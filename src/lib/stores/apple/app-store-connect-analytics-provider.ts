/**
 * Official App Store analytics via the App Store Connect API (Analytics Reports).
 *
 * Flow, per Apple's "Downloading Analytics Reports" guide:
 *   1. An ONGOING analytics report request for the app (created once; needs an Admin key).
 *   2. The request's reports, filtered by name: "App Store Discovery and Engagement
 *      Standard" and "App Downloads Standard".
 *   3. Each report's DAILY instances (one per processing date).
 *   4. Each instance's segments: pre-signed download URLs with size and MD5 checksum.
 *
 * Auth: ES256 JWT signed with a team API key (iss = issuer ID, kid = key ID,
 * aud = appstoreconnect-v1, lifetime ≤ 20 minutes). Read-only apart from step 1.
 */

import "server-only"

import { createHash, createPrivateKey, sign } from "node:crypto"
import { gunzipSync } from "node:zlib"
import { z } from "zod"
import { type FetchFailure, fetchWithRetry } from "@/lib/http/fetch-with-retry"
import type { Sleep } from "@/lib/http/rate-limiter"
import { createLogger } from "@/lib/logger"
import {
  fail,
  ok,
  type ProviderResult,
  type ProviderStatus,
  type StoreAnalyticsInstance,
  type StoreAnalyticsInstanceData,
  type StoreAnalyticsProvider,
} from "../types"
import {
  aggregateReportFiles,
  APPLE_REPORT_NAMES,
  type AppStoreAnalyticsReport,
} from "./analytics-report-parser"

export const ASC_ANALYTICS_SOURCE = "apple_app_store_connect_analytics"

const API = "https://api.appstoreconnect.apple.com"
const TOKEN_LIFETIME_S = 15 * 60
const MAX_PAGES = 50

export interface AppStoreConnectConfig {
  issuerId?: string
  keyId?: string
  privateKey?: string
}

export interface AppStoreConnectOptions {
  fetchImpl?: typeof fetch
  sleep?: Sleep
  now?: () => Date
}

const linksSchema = z.object({ next: z.string().optional() }).optional()
const requestsSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      attributes: z.object({
        accessType: z.string(),
        stoppedDueToInactivity: z.boolean().optional(),
      }),
    }),
  ),
  links: linksSchema,
})
const createdSchema = z.object({ data: z.object({ id: z.string() }) })
const reportsSchema = z.object({
  data: z.array(z.object({ id: z.string(), attributes: z.object({ name: z.string() }) })),
  links: linksSchema,
})
const instancesSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      attributes: z.object({ granularity: z.string(), processingDate: z.string() }),
    }),
  ),
  links: linksSchema,
})
const segmentsSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      attributes: z.object({
        url: z.url(),
        checksum: z.string().optional(),
        sizeInBytes: z.number().optional(),
      }),
    }),
  ),
  links: linksSchema,
})

export function missingAppStoreConnectConfig(config: AppStoreConnectConfig): string[] {
  const missing: string[] = []
  if (!config.issuerId) missing.push("APPLE_CONNECT_ISSUER_ID")
  if (!config.keyId) missing.push("APPLE_CONNECT_KEY_ID")
  if (!config.privateKey) missing.push("APPLE_CONNECT_PRIVATE_KEY")
  return missing
}

/** ES256 JWT for the App Store Connect API (team key). */
export function createAppStoreConnectToken(
  config: Required<AppStoreConnectConfig>,
  now: Date,
): string {
  const iat = Math.floor(now.getTime() / 1000)
  const encode = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url")
  const unsigned = `${encode({ alg: "ES256", kid: config.keyId, typ: "JWT" })}.${encode({
    iss: config.issuerId,
    iat,
    exp: iat + TOKEN_LIFETIME_S,
    aud: "appstoreconnect-v1",
  })}`
  const key = createPrivateKey(config.privateKey.replace(/\\n/g, "\n"))
  const signature = sign("sha256", Buffer.from(unsigned), { key, dsaEncoding: "ieee-p1363" })
  return `${unsigned}.${signature.toString("base64url")}`
}

export class AppStoreConnectAnalyticsProvider implements StoreAnalyticsProvider {
  readonly id = ASC_ANALYTICS_SOURCE
  readonly name = "App Store Connect Analytics"
  readonly platform = "ios" as const
  readonly official = true

  private token: { value: string; expiresAt: number } | null = null
  private readonly logger = createLogger("app-store-connect")

  constructor(
    private readonly config: AppStoreConnectConfig,
    private readonly options: AppStoreConnectOptions = {},
  ) {}

  status(): ProviderStatus {
    const missing = missingAppStoreConnectConfig(this.config)
    if (missing.length > 0) {
      return { state: "not_configured", detail: "App Store Connect not connected", missing }
    }
    return { state: "ready", detail: "API key configured. Imports daily analytics reports." }
  }

  async ensureReporting(externalAppId: string) {
    if (!/^\d+$/.test(externalAppId)) return fail("invalid_input", "App Store IDs are numeric")
    const listed = await this.listRequests(externalAppId)
    if (!listed.ok) return listed
    let active = listed.data.filter((r) => !r.stopped)
    let created = false

    if (!active.some((r) => r.accessType === "ONGOING")) {
      const result = await this.request(
        "POST",
        "/v1/analyticsReportRequests",
        createdSchema,
        "Starting Apple's analytics reports needs an App Store Connect API key with the Admin role (once).",
        {
          data: {
            type: "analyticsReportRequests",
            attributes: { accessType: "ONGOING" },
            relationships: { app: { data: { type: "apps", id: externalAppId } } },
          },
        },
      )
      if (result.ok) {
        created = true
        active = [...active, { id: result.data.data.id, accessType: "ONGOING", stopped: false }]
      } else if (result.error.code === "conflict") {
        const again = await this.listRequests(externalAppId)
        if (!again.ok) return again
        active = again.data.filter((r) => !r.stopped)
      } else return result
    }
    return ok({ requestIds: active.map((r) => r.id), created })
  }

  async listInstances(requestIds: string[]) {
    const names = Object.values(APPLE_REPORT_NAMES)
    const keyByName = new Map(
      (Object.entries(APPLE_REPORT_NAMES) as Array<[AppStoreAnalyticsReport, string]>).map(
        ([key, name]) => [name, key],
      ),
    )
    const instances: StoreAnalyticsInstance[] = []
    for (const requestId of requestIds) {
      const reports = await this.paginate(
        `/v1/analyticsReportRequests/${encodeURIComponent(requestId)}/reports?filter[name]=${encodeURIComponent(names.join(","))}&limit=200`,
        reportsSchema,
      )
      if (!reports.ok) return reports
      for (const report of reports.data) {
        const key = keyByName.get(report.attributes.name)
        if (!key) continue
        const listed = await this.paginate(
          `/v1/analyticsReports/${encodeURIComponent(report.id)}/instances?filter[granularity]=DAILY&limit=200`,
          instancesSchema,
        )
        if (!listed.ok) return listed
        for (const instance of listed.data) {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(instance.attributes.processingDate)) continue
          instances.push({
            externalId: instance.id,
            report: key,
            granularity: "daily",
            processingDate: instance.attributes.processingDate,
          })
        }
      }
    }
    return ok(instances)
  }

  async getInstance(
    instance: StoreAnalyticsInstance,
    externalAppId: string,
  ): Promise<ProviderResult<StoreAnalyticsInstanceData>> {
    if (!(instance.report in APPLE_REPORT_NAMES)) return fail("invalid_input", "Unknown report")
    const segments = await this.paginate(
      `/v1/analyticsReportInstances/${encodeURIComponent(instance.externalId)}/segments?limit=200`,
      segmentsSchema,
    )
    if (!segments.ok) return segments

    const files: string[] = []
    for (const segment of segments.data) {
      const { url, checksum, sizeInBytes } = segment.attributes
      if (!url.startsWith("https://")) return fail("bad_response", "Report segment URL isn't HTTPS")
      // Pre-signed URL: no Authorization header.
      const outcome = await fetchWithRetry(
        url,
        { method: "GET", cache: "no-store" },
        this.retry(2, 60_000),
      )
      if (!outcome.ok)
        return this.failure(outcome.failure, "Couldn't download an analytics report file")
      const bytes = Buffer.from(await outcome.response.arrayBuffer())
      if (sizeInBytes !== undefined && bytes.length !== sizeInBytes) {
        return fail("bad_response", "Analytics report file size doesn't match Apple's metadata")
      }
      const gzipped = bytes[0] === 0x1f && bytes[1] === 0x8b
      let content: Buffer
      try {
        content = gzipped ? gunzipSync(bytes) : bytes
      } catch {
        return fail("bad_response", "Analytics report file isn't valid gzip")
      }
      if (checksum) {
        const md5 = (b: Buffer) => createHash("md5").update(b).digest("hex")
        const expected = checksum.toLowerCase()
        if (md5(bytes) !== expected && md5(content) !== expected) {
          return fail("bad_response", "Analytics report file checksum doesn't match")
        }
      }
      files.push(content.toString("utf8"))
    }

    const parsed = aggregateReportFiles(
      instance.report as AppStoreAnalyticsReport,
      files,
      externalAppId,
    )
    if (!parsed.ok) return fail("bad_response", parsed.message)
    return ok(parsed.data)
  }

  // -------------------------------------------------------------------------

  private async listRequests(externalAppId: string) {
    const listed = await this.paginate(
      `/v1/apps/${encodeURIComponent(externalAppId)}/analyticsReportRequests?limit=200`,
      requestsSchema,
    )
    if (!listed.ok) return listed
    return ok(
      listed.data.map((r) => ({
        id: r.id,
        accessType: r.attributes.accessType,
        stopped: r.attributes.stoppedDueToInactivity === true,
      })),
    )
  }

  private retry(retries: number, timeoutMs = 20_000) {
    return {
      retries,
      baseDelayMs: 1_000,
      maxDelayMs: 16_000,
      timeoutMs,
      fetchImpl: this.options.fetchImpl,
      sleep: this.options.sleep,
      logger: this.logger,
    }
  }

  private accessToken(): ProviderResult<string> {
    const missing = missingAppStoreConnectConfig(this.config)
    if (missing.length > 0) return fail("not_configured", "App Store Connect not connected")
    const now = this.options.now?.() ?? new Date()
    if (this.token && this.token.expiresAt > now.getTime() + 120_000) return ok(this.token.value)
    try {
      const value = createAppStoreConnectToken(this.config as Required<AppStoreConnectConfig>, now)
      this.token = { value, expiresAt: now.getTime() + TOKEN_LIFETIME_S * 1000 }
      return ok(value)
    } catch {
      return fail("not_configured", "APPLE_CONNECT_PRIVATE_KEY is not a valid EC private key")
    }
  }

  private failure<T>(f: FetchFailure, forbidden: string): ProviderResult<T> {
    if (f.kind === "http") {
      if (f.status === 401)
        return fail(
          "not_configured",
          "App Store Connect rejected the API key (check key ID, issuer ID and key)",
        )
      if (f.status === 403) return fail("not_configured", forbidden)
      if (f.status === 404)
        return fail("not_found", "App Store Connect couldn't find that app or report")
      if (f.status === 409) return fail("conflict", "App Store Connect reported a conflict")
      if (f.status === 429)
        return fail("rate_limited", "App Store Connect rate limit reached; try again later", true)
      if (f.status < 500)
        return fail("bad_response", `App Store Connect rejected the request (HTTP ${f.status})`)
    }
    return fail(
      "network",
      `App Store Connect request failed (${f.kind === "http" ? `HTTP ${f.status}` : f.kind})`,
      true,
    )
  }

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    schema: z.ZodType<T>,
    forbidden = "This App Store Connect API key's role can't access analytics reports.",
    body?: unknown,
  ): Promise<ProviderResult<T>> {
    const token = this.accessToken()
    if (!token.ok) return token
    const url = path.startsWith("https://") ? path : `${API}${path}`
    if (!url.startsWith(`${API}/`)) return fail("bad_response", "Unexpected App Store Connect URL")
    const outcome = await fetchWithRetry(
      url,
      {
        method,
        headers: {
          Authorization: `Bearer ${token.data}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        cache: "no-store",
      },
      this.retry(method === "GET" ? 2 : 0),
    )
    if (!outcome.ok) return this.failure(outcome.failure, forbidden)
    const parsed = schema.safeParse(await outcome.response.json().catch(() => null))
    if (!parsed.success) return fail("bad_response", "Unexpected App Store Connect response")
    return ok(parsed.data)
  }

  private async paginate<T extends { data: unknown[]; links?: { next?: string } }>(
    path: string,
    schema: z.ZodType<T>,
  ): Promise<ProviderResult<T["data"]>> {
    const items: T["data"] = []
    let next: string | undefined = path
    for (let page = 0; next && page < MAX_PAGES; page++) {
      const result: ProviderResult<T> = await this.request("GET", next, schema)
      if (!result.ok) return result
      items.push(...result.data.data)
      next = result.data.links?.next
    }
    if (next) return fail("bad_response", "App Store Connect returned more pages than expected")
    return ok(items)
  }
}
