/**
 * Apple keyword popularity via the Apple Ads Platform API (Search Term Popularity).
 *
 *   POST https://api.ads.apple.com/v1/insights/apps/search-term-popularity/query
 *   https://developer.apple.com/documentation/apple-ads-platform-api/query-app-search-term-popularity-data
 *
 * Apple's dataset is a ranked list of popular search terms per storefront, genre and
 * period. It only contains terms that meet Apple's eligibility criteria (≥ 500 searches
 * and ≥ 10 impressions in the period), up to 500 terms per country and genre. It is not a
 * lookup that answers for any keyword. We query it for the tracked terms in a storefront;
 * a term Apple doesn't return is recorded as `below_threshold` ("not returned"), never as
 * zero. If Apple returns no rows at all for the storefront and period, the dataset is
 * treated as unavailable and nothing is recorded.
 *
 * Request shape, headers, date rules and field names follow Apple's official
 * documentation (checked October 2026). The integration has not yet run against a live
 * Apple Ads account. Responses are schema-validated and rejected if they don't match, so a
 * mismatch fails loudly instead of storing bad data.
 *
 * Auth: OAuth 2.0 client credentials. The client secret is an ES256 JWT signed with the
 * key uploaded to Apple Ads (or supplied pre-signed via APPLE_ADS_CLIENT_SECRET). Every
 * call carries `X-AP-Context: adAccountId=…`.
 */

import "server-only"

import { createPrivateKey, sign } from "node:crypto"
import { z } from "zod"
import { normalizeKeyword } from "@/lib/aso/normalization/text"
import { fetchWithRetry } from "@/lib/http/fetch-with-retry"
import type { Sleep } from "@/lib/http/rate-limiter"
import { createLogger } from "@/lib/logger"
import {
  fail,
  ok,
  type KeywordPopularityProvider,
  type KeywordPopularityQuery,
  type KeywordPopularityResult,
  type PopularityObservation,
  type PopularityPeriod,
  type ProviderResult,
  type ProviderStatus,
} from "../types"

export const APPLE_ADS_POPULARITY_SOURCE = "apple_ads_search_term_popularity"

const TOKEN_URL = "https://appleid.apple.com/auth/oauth2/token"
const API_BASE = "https://api.ads.apple.com/v1"
const POPULARITY_PATH = "/insights/apps/search-term-popularity/query"

/** Metrics Apple only includes when they are listed in the request's `fields` array. */
const METRIC_FIELDS = [
  "rankInGenre",
  "searchPopularityInGenre",
  "searchPopularity1to100",
  "searchPopularity1to5",
] as const

/** Apple caps `pageSize` at 5000 for this endpoint. */
const PAGE_SIZE = 1000
const MAX_PAGES = 10
/** Terms per `searchTerm IN [...]` filter. Apple doesn't document a limit; stay modest. */
const TERMS_PER_REQUEST = 50

/** Genre values accepted by the `genre` filter, per Apple's documentation. */
export const APPLE_ADS_GENRES = [
  "BUSINESS",
  "EDUCATION",
  "ENTERTAINMENT",
  "FINANCE",
  "FOOD_DRINK",
  "GAMES",
  "HEALTH_FITNESS",
  "LIFESTYLE",
  "NEW_PUBLICATION",
  "PHOTO_VIDEO",
  "PRODUCTIVITY_UTILITIES",
  "SHOPPING",
  "SOCIAL_NETWORKING",
  "SPORTS",
  "TRAVEL",
] as const
export type AppleAdsGenre = (typeof APPLE_ADS_GENRES)[number]

/**
 * App Store category names (as returned by the public Lookup API) → Apple Ads genres.
 * Only unambiguous mappings are listed. Categories Apple Ads doesn't report on (Medical,
 * Music, Navigation…) have no genre.
 */
const CATEGORY_GENRES: Record<string, AppleAdsGenre> = {
  business: "BUSINESS",
  education: "EDUCATION",
  entertainment: "ENTERTAINMENT",
  finance: "FINANCE",
  "food & drink": "FOOD_DRINK",
  games: "GAMES",
  "health & fitness": "HEALTH_FITNESS",
  lifestyle: "LIFESTYLE",
  "photo & video": "PHOTO_VIDEO",
  productivity: "PRODUCTIVITY_UTILITIES",
  utilities: "PRODUCTIVITY_UTILITIES",
  shopping: "SHOPPING",
  "social networking": "SOCIAL_NETWORKING",
  sports: "SPORTS",
  travel: "TRAVEL",
}

export interface AppleAdsConfig {
  clientId?: string
  teamId?: string
  keyId?: string
  privateKey?: string
  clientSecret?: string
  accountId?: string
}

export interface AppleAdsProviderOptions {
  fetchImpl?: typeof fetch
  sleep?: Sleep
  now?: () => Date
}

const tokenSchema = z.object({ access_token: z.string(), expires_in: z.number() })

const score100 = z.number().min(0).max(100)
const popularityRowSchema = z.object({
  searchTerm: z.string(),
  countryOrRegion: z.string(),
  genre: z.string(),
  week: z.string().optional(),
  month: z.string().optional(),
  rankInGenre: z.number().int().positive().optional(),
  searchPopularityInGenre: score100.optional(),
  searchPopularity1to100: score100.optional(),
  searchPopularity1to5: z.number().int().min(1).max(5).optional(),
})
type PopularityRow = z.infer<typeof popularityRowSchema>

const popularityResponseSchema = z.object({
  result: z.object({ rows: z.array(z.unknown()) }),
  pagination: z
    .object({
      offset: z.number().optional(),
      pageSize: z.number().optional(),
      totalCount: z.number().optional(),
    })
    .nullish(),
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

/** Apple Ads genre for an App Store category ("Finance" → "FINANCE"), or null if unmapped. */
export function toAppleAdsGenre(category: string | null | undefined): AppleAdsGenre | null {
  if (!category) return null
  const trimmed = category.trim()
  const asGenre = APPLE_ADS_GENRES.find((g) => g === trimmed.toUpperCase())
  return asGenre ?? CATEGORY_GENRES[trimmed.toLowerCase()] ?? null
}

const DAY_MS = 86_400_000

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

/**
 * The latest period Apple should have published at `now`, or an earlier one.
 *
 * - Weekly (`WEEKLY_SUN_SAT`): fixed Sunday–Saturday weeks in UTC, generated on Mondays at
 *   07:00 UTC for the week that just ended.
 * - Monthly: calendar months in UTC, refreshed on the 5th for the previous month.
 */
export function publishedPopularityPeriod(
  granularity: PopularityPeriod["granularity"],
  now: Date,
  periodsBack = 0,
): PopularityPeriod {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())

  if (granularity === "weekly") {
    const daysSinceSaturday = (now.getUTCDay() + 1) % 7 || 7
    let saturday = today - daysSinceSaturday * DAY_MS
    const publishedAt = saturday + 2 * DAY_MS + 7 * 3_600_000
    if (now.getTime() < publishedAt) saturday -= 7 * DAY_MS
    saturday -= periodsBack * 7 * DAY_MS
    return {
      granularity,
      start: isoDate(saturday - 6 * DAY_MS),
      end: isoDate(saturday),
      endsAt: new Date(saturday + DAY_MS),
    }
  }

  const monthsBack = (now.getUTCDate() >= 5 ? 1 : 2) + periodsBack
  const first = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsBack, 1)
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsBack + 1, 1)
  return {
    granularity,
    start: isoDate(first),
    end: isoDate(next - DAY_MS),
    endsAt: new Date(next),
  }
}

type Filter = { field: string; operator: "EQUALS" | "IN"; value: string | string[] }

export class AppleAdsPopularityProvider implements KeywordPopularityProvider {
  readonly id = APPLE_ADS_POPULARITY_SOURCE
  readonly name = "Apple Ads Search Term Popularity"
  readonly platform = "ios" as const
  readonly official = true

  private token: { value: string; expiresAt: number } | null = null
  private readonly logger = createLogger("apple-ads")

  constructor(
    private readonly config: AppleAdsConfig,
    private readonly options: AppleAdsProviderOptions = {},
  ) {}

  status(): ProviderStatus {
    const missing = missingAppleAdsConfig(this.config)
    if (missing.length > 0) {
      return { state: "not_configured", detail: "Apple keyword popularity not connected", missing }
    }
    return { state: "ready", detail: "Credentials configured (not yet verified against Apple)" }
  }

  async getPopularity(
    query: KeywordPopularityQuery,
  ): Promise<ProviderResult<KeywordPopularityResult>> {
    const status = this.status()
    if (status.state !== "ready") return fail("not_configured", status.detail)
    if (query.platform !== "ios")
      return fail("unsupported", "Apple Ads popularity covers the App Store only")
    if (!/^[A-Za-z]{2}$/.test(query.country))
      return fail("invalid_input", "Country must be a two-letter storefront code")

    const terms = [...new Set(query.terms.map(normalizeKeyword).filter(Boolean))]
    if (terms.length === 0) return ok({ source: this.id, period: null, observations: [] })

    const token = await this.accessToken()
    if (!token.ok) return token

    const country = query.country.toUpperCase()
    const now = this.options.now?.() ?? new Date()
    const granularity = query.granularity ?? "weekly"

    // Apple publishes on a schedule; if the latest period isn't out yet, use the one before.
    let period: PopularityPeriod | null = null
    for (const back of [0, 1]) {
      const candidate = publishedPopularityPeriod(granularity, now, back)
      const probe = await this.queryRows(token.data, {
        filters: [{ field: "countryOrRegion", operator: "EQUALS", value: country }],
        period: candidate,
        fields: false,
        maxRows: 1,
      })
      if (!probe.ok) return probe
      if (probe.data.length > 0) {
        period = candidate
        break
      }
    }
    if (!period) {
      return fail(
        "unavailable",
        `Apple hasn't published Search Term Popularity for ${country} for the latest ${granularity === "weekly" ? "weeks" : "months"}`,
      )
    }

    const rowsByTerm = new Map<string, PopularityRow[]>()
    for (let i = 0; i < terms.length; i += TERMS_PER_REQUEST) {
      const chunk = terms.slice(i, i + TERMS_PER_REQUEST)
      const rows = await this.queryRows(token.data, {
        filters: [
          { field: "countryOrRegion", operator: "EQUALS", value: country },
          { field: "searchTerm", operator: "IN", value: chunk },
        ],
        period,
        fields: true,
      })
      if (!rows.ok) return rows
      for (const row of rows.data) {
        if (row.countryOrRegion.toUpperCase() !== country) continue
        if (row.searchPopularity1to100 === undefined) {
          return fail(
            "bad_response",
            "Apple Ads rows did not include searchPopularity1to100; verify the request fields",
          )
        }
        const key = normalizeKeyword(row.searchTerm)
        rowsByTerm.set(key, [...(rowsByTerm.get(key) ?? []), row])
      }
    }

    const appGenre = toAppleAdsGenre(query.genre)
    const observations: PopularityObservation[] = terms.map((term) => {
      const rows = rowsByTerm.get(term) ?? []
      const base = {
        term,
        granularity: period.granularity,
        periodStart: period.start,
        periodEnd: period.end,
        measuredAt: period.endsAt,
      }
      if (rows.length === 0) {
        return { ...base, status: "below_threshold", score: null, details: {} }
      }
      // A term can appear in several genres. searchPopularity1to100 is storefront-wide;
      // the in-genre metrics come from the app's genre when Apple returned it.
      const sorted = [...rows].sort(
        (a, b) => (a.rankInGenre ?? Infinity) - (b.rankInGenre ?? Infinity),
      )
      const row = sorted.find((r) => r.genre === appGenre) ?? sorted[0]!
      return {
        ...base,
        status: "measured",
        score: row.searchPopularity1to100!,
        details: {
          genre: row.genre,
          rankInGenre: row.rankInGenre ?? null,
          searchPopularityInGenre: row.searchPopularityInGenre ?? null,
          searchPopularity1to100: row.searchPopularity1to100!,
          searchPopularity1to5: row.searchPopularity1to5 ?? null,
          ...(row.week ? { week: row.week } : {}),
          ...(row.month ? { month: row.month } : {}),
          ...(sorted.length > 1 ? { genresReturned: sorted.map((r) => r.genre) } : {}),
        },
      }
    })
    return ok({ source: this.id, period, observations })
  }

  private async queryRows(
    accessToken: string,
    request: { filters: Filter[]; period: PopularityPeriod; fields: boolean; maxRows?: number },
  ): Promise<ProviderResult<PopularityRow[]>> {
    const pageSize = Math.min(PAGE_SIZE, request.maxRows ?? PAGE_SIZE)
    const rows: PopularityRow[] = []

    for (let page = 0; page < MAX_PAGES; page++) {
      const body = {
        ...(request.fields ? { fields: METRIC_FIELDS } : {}),
        filters: request.filters,
        timeRange: {
          start: request.period.start,
          end: request.period.end,
          granularity: request.period.granularity === "weekly" ? "WEEKLY_SUN_SAT" : "MONTHLY",
        },
        sorting: [{ field: "rankInGenre", order: "ASC" }],
        pagination: { offset: page * pageSize, pageSize },
      }
      const response = await this.post(accessToken, body)
      if (!response.ok) return response

      const parsed = popularityResponseSchema.safeParse(response.data)
      if (!parsed.success) {
        return fail(
          "bad_response",
          "Unexpected Apple Ads response shape; verify the integration against Apple's docs",
        )
      }
      for (const raw of parsed.data.result.rows) {
        const row = popularityRowSchema.safeParse(raw)
        if (!row.success) {
          return fail("bad_response", "Apple Ads returned a row without the documented fields")
        }
        rows.push(row.data)
      }

      const pageRows = parsed.data.result.rows.length
      const total = parsed.data.pagination?.totalCount
      if (request.maxRows !== undefined && rows.length >= request.maxRows) return ok(rows)
      if (pageRows < pageSize || (total !== undefined && rows.length >= total)) return ok(rows)
    }
    return fail("bad_response", "Apple Ads returned more pages than expected")
  }

  private async post(accessToken: string, body: unknown): Promise<ProviderResult<unknown>> {
    const outcome = await fetchWithRetry(
      `${API_BASE}${POPULARITY_PATH}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "X-AP-Context": `adAccountId=${this.config.accountId}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        cache: "no-store",
      },
      {
        retries: 2,
        baseDelayMs: 1_000,
        maxDelayMs: 16_000,
        timeoutMs: 20_000,
        fetchImpl: this.options.fetchImpl,
        sleep: this.options.sleep,
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
      if (f.kind === "http" && f.status >= 400 && f.status < 500) {
        return fail("bad_response", `Apple Ads rejected the request (HTTP ${f.status})`)
      }
      return fail(
        "network",
        `Apple Ads request failed (${f.kind === "http" ? `HTTP ${f.status}` : f.kind})`,
        true,
      )
    }
    return ok(await outcome.response.json().catch(() => null))
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
      {
        retries: 1,
        baseDelayMs: 1_000,
        maxDelayMs: 5_000,
        timeoutMs: 10_000,
        fetchImpl: this.options.fetchImpl,
        sleep: this.options.sleep,
        logger: this.logger,
      },
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
