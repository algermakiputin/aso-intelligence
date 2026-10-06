/**
 * Apple keyword popularity via the Apple Ads Platform API (search-term popularity).
 *
 * The dataset is a *ranked list of popular terms per genre and storefront*, published
 * weekly or monthly. It is not a lookup for arbitrary keywords. We fetch the list for the
 * app's genre and match tracked keywords against it; a keyword absent from the list is
 * recorded as `below_threshold`, never as zero.
 *
 * STATUS: unverified against a live account. Endpoint, payload and field names follow
 * third-party documentation of the API (Aug 2026). Responses are schema-validated and
 * rejected if they don't match, so a mismatch fails loudly instead of storing bad data.
 *
 * Auth: OAuth 2.0 client credentials. The client secret is an ES256 JWT signed with the
 * key uploaded to Apple Ads (or supplied pre-signed via APPLE_ADS_CLIENT_SECRET). Every
 * call carries `X-AP-Context: adAccountId=…`.
 */

import "server-only"

import { createPrivateKey, sign } from "node:crypto"
import { z } from "zod"
import { fetchWithRetry } from "@/lib/http/fetch-with-retry"
import { createLogger } from "@/lib/logger"
import {
  fail,
  ok,
  type KeywordPopularityProvider,
  type KeywordPopularityQuery,
  type PopularityObservation,
  type ProviderResult,
  type ProviderStatus,
} from "../types"

export const APPLE_ADS_POPULARITY_SOURCE = "apple_ads_search_term_popularity"

const TOKEN_URL = "https://appleid.apple.com/auth/oauth2/token"
const API_BASE = "https://api.ads.apple.com/v1"
const POPULARITY_PATH = "/insights/apps/search-term-popularity/query"

export interface AppleAdsConfig {
  clientId?: string
  teamId?: string
  keyId?: string
  privateKey?: string
  clientSecret?: string
  accountId?: string
}

const tokenSchema = z.object({ access_token: z.string(), expires_in: z.number() })

const popularityRowSchema = z.object({
  searchTerm: z.string(),
  searchPopularity1to100: z.number().min(0).max(100),
})
const popularityResponseSchema = z.object({
  data: z.union([z.array(z.unknown()), z.object({ rows: z.array(z.unknown()) })]),
})

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url")
}

/** ES256 client-secret JWT as required by Apple's OAuth endpoint. */
export function createClientSecret(
  config: Required<Pick<AppleAdsConfig, "clientId" | "teamId" | "keyId" | "privateKey">>,
  now = new Date(),
): string {
  const iat = Math.floor(now.getTime() / 1000)
  const header = base64url(JSON.stringify({ alg: "ES256", kid: config.keyId }))
  const payload = base64url(
    JSON.stringify({
      sub: config.clientId,
      iss: config.teamId,
      aud: "https://appleid.apple.com",
      iat,
      exp: iat + 3600,
    }),
  )
  const key = createPrivateKey(config.privateKey.replace(/\\n/g, "\n"))
  const signature = sign("sha256", Buffer.from(`${header}.${payload}`), {
    key,
    dsaEncoding: "ieee-p1363",
  })
  return `${header}.${payload}.${base64url(signature)}`
}

export function missingAppleAdsConfig(config: AppleAdsConfig): string[] {
  const missing: string[] = []
  if (!config.clientId) missing.push("APPLE_ADS_CLIENT_ID")
  if (!config.accountId) missing.push("APPLE_ADS_ACCOUNT_ID")
  if (!config.clientSecret) {
    if (!config.teamId) missing.push("APPLE_ADS_TEAM_ID")
    if (!config.keyId) missing.push("APPLE_ADS_KEY_ID")
    if (!config.privateKey) missing.push("APPLE_ADS_PRIVATE_KEY")
  }
  return missing
}

/** Apple Ads genre identifiers are upper snake case ("Finance" → "FINANCE"). Unverified. */
export function toAppleAdsGenre(category: string): string {
  return category
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
}

export class AppleAdsPopularityProvider implements KeywordPopularityProvider {
  readonly id = APPLE_ADS_POPULARITY_SOURCE
  readonly name = "Apple Ads search-term popularity"
  readonly platform = "ios" as const
  readonly official = true

  private token: { value: string; expiresAt: number } | null = null
  private readonly logger = createLogger("apple-ads")

  constructor(private readonly config: AppleAdsConfig) {}

  status(): ProviderStatus {
    const missing = missingAppleAdsConfig(this.config)
    if (missing.length > 0) {
      return { state: "not_configured", detail: "Apple keyword popularity not connected", missing }
    }
    return { state: "ready", detail: "Credentials configured (integration unverified)" }
  }

  async getPopularity(query: KeywordPopularityQuery) {
    const status = this.status()
    if (status.state !== "ready") return fail("not_configured", status.detail)
    if (query.platform !== "ios")
      return fail("unsupported", "Apple Ads popularity covers the App Store only")
    if (!query.genre)
      return fail(
        "invalid_input",
        "Popularity is published per genre; set the listing's category first",
      )

    const token = await this.accessToken()
    if (!token.ok) return token

    const outcome = await fetchWithRetry(
      `${API_BASE}${POPULARITY_PATH}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token.data}`,
          "X-AP-Context": `adAccountId=${this.config.accountId}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          granularity: "WEEKLY_SUN_SAT",
          selector: {
            conditions: [
              {
                field: "countryOrRegion",
                operator: "EQUALS",
                values: [query.country.toUpperCase()],
              },
              { field: "genre", operator: "EQUALS", values: [toAppleAdsGenre(query.genre)] },
            ],
            pagination: { offset: 0, limit: 5000 },
          },
        }),
        cache: "no-store",
      },
      {
        retries: 2,
        baseDelayMs: 1_000,
        maxDelayMs: 10_000,
        timeoutMs: 20_000,
        logger: this.logger,
      },
    )
    if (!outcome.ok) {
      const f = outcome.failure
      if (f.kind === "http" && f.status === 429)
        return fail("rate_limited", "Apple Ads rate-limited the request", true)
      if (f.kind === "http" && (f.status === 401 || f.status === 403)) {
        return fail("not_configured", `Apple Ads rejected the credentials (HTTP ${f.status})`)
      }
      return fail(
        "network",
        `Apple Ads request failed (${f.kind === "http" ? `HTTP ${f.status}` : f.kind})`,
        true,
      )
    }

    const parsed = popularityResponseSchema.safeParse(
      await outcome.response.json().catch(() => null),
    )
    if (!parsed.success) {
      return fail(
        "bad_response",
        "Unexpected Apple Ads response shape; verify the integration against Apple's docs",
      )
    }
    const rawRows = Array.isArray(parsed.data.data) ? parsed.data.data : parsed.data.data.rows
    const scores = new Map<string, number>()
    for (const raw of rawRows) {
      const row = popularityRowSchema.safeParse(raw)
      if (row.success)
        scores.set(row.data.searchTerm.trim().toLowerCase(), row.data.searchPopularity1to100)
    }
    if (rawRows.length > 0 && scores.size === 0) {
      return fail("bad_response", "Apple Ads rows did not contain the expected popularity fields")
    }

    const measuredAt = new Date()
    const observations: PopularityObservation[] = query.terms.map((term) => {
      const score = scores.get(term.toLowerCase())
      return {
        term,
        status: score === undefined ? "below_threshold" : "measured",
        score: score ?? null,
        granularity: "weekly",
        periodStart: null,
        periodEnd: null,
        measuredAt,
      }
    })
    return ok({ source: this.id, observations })
  }

  private async accessToken(): Promise<ProviderResult<string>> {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return ok(this.token.value)

    const { clientId, teamId, keyId, privateKey } = this.config
    let clientSecret = this.config.clientSecret
    if (!clientSecret) {
      try {
        clientSecret = createClientSecret({
          clientId: clientId!,
          teamId: teamId!,
          keyId: keyId!,
          privateKey: privateKey!,
        })
      } catch {
        return fail("not_configured", "APPLE_ADS_PRIVATE_KEY is not a valid EC private key")
      }
    }

    const url = new URL(TOKEN_URL)
    url.searchParams.set("grant_type", "client_credentials")
    url.searchParams.set("client_id", clientId!)
    url.searchParams.set("client_secret", clientSecret)
    url.searchParams.set("scope", "searchadsorg")

    const outcome = await fetchWithRetry(
      url.toString(),
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        cache: "no-store",
      },
      { retries: 1, baseDelayMs: 1_000, maxDelayMs: 5_000, timeoutMs: 10_000, logger: this.logger },
    )
    if (!outcome.ok)
      return fail("not_configured", "Apple Ads token request failed; check the credentials")

    const token = tokenSchema.safeParse(await outcome.response.json().catch(() => null))
    if (!token.success) return fail("bad_response", "Unexpected Apple OAuth response")
    this.token = {
      value: token.data.access_token,
      expiresAt: Date.now() + token.data.expires_in * 1000,
    }
    return ok(this.token.value)
  }
}
