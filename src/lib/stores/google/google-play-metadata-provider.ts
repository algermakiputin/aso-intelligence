/**
 * Google Play listing metadata via the official Google Play Developer API
 * (androidpublisher v3): title, short description and full description of the app's
 * store listing in the listing's language.
 *
 * The API only exposes listings inside an "edit" (a draft). We open one, read it and
 * always delete it without committing, so nothing is ever published to Google Play.
 *
 * Auth: a Google Cloud service account invited in Play Console (Users and permissions)
 * with read-only access to the app. OAuth 2.0 JWT bearer grant signed with RS256; the
 * key is the service-account JSON in GOOGLE_PLAY_SERVICE_ACCOUNT_JSON.
 */

import "server-only"

import { createSign } from "node:crypto"
import { z } from "zod"
import { fetchWithRetry, type FetchFailure } from "@/lib/http/fetch-with-retry"
import type { Sleep } from "@/lib/http/rate-limiter"
import { createLogger } from "@/lib/logger"
import { parsePlayPackage } from "@/lib/validation/store-ids"
import {
  fail,
  ok,
  type ListingMetadataQuery,
  type MetadataProvider,
  type ProviderResult,
  type ProviderStatus,
  type StoreListingMetadata,
} from "../types"

export const GOOGLE_PLAY_METADATA_SOURCE = "google_play_developer_api"

const API_BASE = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications"
const SCOPE = "https://www.googleapis.com/auth/androidpublisher"
const DEFAULT_TOKEN_URI = "https://oauth2.googleapis.com/token"

const serviceAccountSchema = z.object({
  type: z.literal("service_account"),
  client_email: z.email(),
  private_key: z.string().includes("PRIVATE KEY"),
  private_key_id: z.string().optional(),
  token_uri: z.url().optional(),
})
type ServiceAccount = z.infer<typeof serviceAccountSchema>

const tokenSchema = z.object({ access_token: z.string(), expires_in: z.number() })
const editSchema = z.object({ id: z.string() })
const listingsSchema = z.object({
  listings: z
    .array(
      z.object({
        language: z.string(),
        title: z.string().optional(),
        shortDescription: z.string().optional(),
        fullDescription: z.string().optional(),
      }),
    )
    .optional(),
})
const detailsSchema = z.object({ defaultLanguage: z.string().optional() })

export interface GooglePlayProviderOptions {
  fetchImpl?: typeof fetch
  sleep?: Sleep
  now?: () => Date
}

/** Parses GOOGLE_PLAY_SERVICE_ACCOUNT_JSON. Never echoes the input in errors. */
export function parseServiceAccount(
  raw: string | undefined,
): { ok: true; account: ServiceAccount } | { ok: false; reason: "missing" | "invalid" } {
  if (!raw?.trim()) return { ok: false, reason: "missing" }
  try {
    const parsed = serviceAccountSchema.safeParse(JSON.parse(raw))
    return parsed.success ? { ok: true, account: parsed.data } : { ok: false, reason: "invalid" }
  } catch {
    return { ok: false, reason: "invalid" }
  }
}

/**
 * Which Google Play listing language to read for one of our listings. Exact match first,
 * then the same base language ("en" → the default "en-US", else any "en-*"), then the
 * app's default language, which is what Google Play shows when a language is missing.
 */
export function pickListingLanguage(
  available: string[],
  wanted: string,
  defaultLanguage: string | null,
): string | null {
  const lower = (s: string) => s.toLowerCase()
  const exact = available.find((l) => lower(l) === lower(wanted))
  if (exact) return exact
  const base = lower(wanted.split("-")[0] ?? wanted)
  const sameBase = available.filter((l) => lower(l.split("-")[0] ?? l) === base)
  if (sameBase.length > 0) {
    return (
      sameBase.find((l) => defaultLanguage && lower(l) === lower(defaultLanguage)) ??
      [...sameBase].sort()[0]!
    )
  }
  return available.find((l) => defaultLanguage && lower(l) === lower(defaultLanguage)) ?? null
}

function base64url(input: string): string {
  return Buffer.from(input).toString("base64url")
}

export class GooglePlayMetadataProvider implements MetadataProvider {
  readonly id = GOOGLE_PLAY_METADATA_SOURCE
  readonly name = "Google Play Developer API"
  readonly platform = "android" as const
  readonly official = true

  private readonly account: ReturnType<typeof parseServiceAccount>
  private token: { value: string; expiresAt: number } | null = null
  private readonly logger = createLogger("google-play")

  constructor(
    serviceAccountJson: string | undefined,
    private readonly options: GooglePlayProviderOptions = {},
  ) {
    this.account = parseServiceAccount(serviceAccountJson)
  }

  status(): ProviderStatus {
    if (!this.account.ok) {
      return {
        state: "not_configured",
        detail:
          this.account.reason === "missing"
            ? "Google Play not connected"
            : "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is not a valid service-account key",
        missing: ["GOOGLE_PLAY_SERVICE_ACCOUNT_JSON"],
      }
    }
    return { state: "ready", detail: "Service account configured. Read-only listing import." }
  }

  async getListing(query: ListingMetadataQuery): Promise<ProviderResult<StoreListingMetadata>> {
    if (!this.account.ok) return fail("not_configured", this.status().detail)
    if (query.platform !== "android")
      return fail("unsupported", "The Google Play Developer API only covers Google Play")
    const packageName = parsePlayPackage(query.externalAppId)
    if (packageName !== query.externalAppId)
      return fail("invalid_input", "Google Play listings need a package name, e.g. com.example.app")

    const token = await this.accessToken(this.account.account)
    if (!token.ok) return token

    const app = `${API_BASE}/${encodeURIComponent(packageName)}`
    const edit = await this.call(token.data, `${app}/edits`, "POST", editSchema, packageName)
    if (!edit.ok) return edit
    const editUrl = `${app}/edits/${encodeURIComponent(edit.data.id)}`

    try {
      const [listings, details] = await Promise.all([
        this.call(token.data, `${editUrl}/listings`, "GET", listingsSchema, packageName),
        this.call(token.data, `${editUrl}/details`, "GET", detailsSchema, packageName),
      ])
      if (!listings.ok) return listings
      if (!details.ok) return details

      const all = listings.data.listings ?? []
      const language = pickListingLanguage(
        all.map((l) => l.language),
        query.language ?? "en-US",
        details.data.defaultLanguage ?? null,
      )
      const listing = all.find((l) => l.language === language)
      if (!listing) {
        return fail("not_found", `${packageName} has no Google Play store listing to import`)
      }

      return ok({
        externalAppId: packageName,
        bundleId: packageName,
        title: listing.title ?? null,
        subtitle: listing.shortDescription ?? null,
        description: listing.fullDescription ?? null,
        developerName: null,
        primaryCategory: null,
        iconUrl: null,
        version: null,
        rating: null,
        ratingCount: null,
        storeUrl: `https://play.google.com/store/apps/details?id=${encodeURIComponent(packageName)}`,
        listingLanguage: listing.language,
        source: GOOGLE_PLAY_METADATA_SOURCE,
        fetchedAt: this.options.now?.() ?? new Date(),
      })
    } finally {
      // Never commit: discard the draft so nothing is published. Unused edits also
      // expire on their own, so a failed delete only leaves a short-lived draft.
      const deleted = await fetchWithRetry(
        editUrl,
        { method: "DELETE", headers: { Authorization: `Bearer ${token.data}` }, cache: "no-store" },
        this.retryOptions(1),
      )
      if (!deleted.ok) this.logger.warn("edit_delete_failed", { reason: deleted.failure.kind })
    }
  }

  private retryOptions(retries: number) {
    return {
      retries,
      baseDelayMs: 1_000,
      maxDelayMs: 10_000,
      timeoutMs: 15_000,
      fetchImpl: this.options.fetchImpl,
      sleep: this.options.sleep,
      logger: this.logger,
    }
  }

  private async call<T>(
    accessToken: string,
    url: string,
    method: "GET" | "POST",
    schema: z.ZodType<T>,
    packageName: string,
  ): Promise<ProviderResult<T>> {
    const outcome = await fetchWithRetry(
      url,
      { method, headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" },
      this.retryOptions(2),
    )
    if (!outcome.ok) return this.failure(outcome.failure, packageName)
    const parsed = schema.safeParse(await outcome.response.json().catch(() => null))
    if (!parsed.success) return fail("bad_response", "Unexpected Google Play API response")
    return ok(parsed.data)
  }

  private failure<T>(f: FetchFailure, packageName: string): ProviderResult<T> {
    if (f.kind === "http") {
      if (f.status === 401)
        return fail("not_configured", "Google rejected the service account credentials")
      if (f.status === 403) {
        return fail(
          "not_configured",
          "The service account can't access this app. In Play Console → Users and permissions, give it View app information for the app.",
        )
      }
      if (f.status === 404)
        return fail(
          "not_found",
          `${packageName} isn't an app in this Google Play developer account`,
        )
      if (f.status === 429)
        return fail("rate_limited", "Google Play API rate limit reached; try again later", true)
      if (f.status < 500)
        return fail("bad_response", `Google Play API rejected the request (HTTP ${f.status})`)
    }
    return fail(
      "network",
      `Google Play API request failed (${f.kind === "http" ? `HTTP ${f.status}` : f.kind})`,
      true,
    )
  }

  private async accessToken(account: ServiceAccount): Promise<ProviderResult<string>> {
    const nowMs = (this.options.now?.() ?? new Date()).getTime()
    if (this.token && this.token.expiresAt > nowMs + 60_000) return ok(this.token.value)

    const tokenUri = account.token_uri ?? DEFAULT_TOKEN_URI
    const iat = Math.floor(nowMs / 1000)
    const header = base64url(
      JSON.stringify({
        alg: "RS256",
        typ: "JWT",
        ...(account.private_key_id ? { kid: account.private_key_id } : {}),
      }),
    )
    const claims = base64url(
      JSON.stringify({
        iss: account.client_email,
        scope: SCOPE,
        aud: tokenUri,
        iat,
        exp: iat + 3600,
      }),
    )
    let assertion: string
    try {
      const signature = createSign("RSA-SHA256")
        .update(`${header}.${claims}`)
        .sign(account.private_key.replace(/\\n/g, "\n"), "base64url")
      assertion = `${header}.${claims}.${signature}`
    } catch {
      return fail("not_configured", "The service-account private key couldn't be used to sign")
    }

    const outcome = await fetchWithRetry(
      tokenUri,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
          assertion,
        }).toString(),
        cache: "no-store",
      },
      this.retryOptions(1),
    )
    if (!outcome.ok) {
      return fail(
        "not_configured",
        "Google rejected the service-account key (it may have been deleted or rotated)",
      )
    }
    const token = tokenSchema.safeParse(await outcome.response.json().catch(() => null))
    if (!token.success) return fail("bad_response", "Unexpected Google OAuth response")
    this.token = { value: token.data.access_token, expiresAt: nowMs + token.data.expires_in * 1000 }
    return ok(this.token.value)
  }
}
