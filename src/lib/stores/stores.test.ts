import { generateKeyPairSync, verify } from "node:crypto"
import { describe, expect, it, vi } from "vitest"
import { MinIntervalRateLimiter } from "@/lib/http/rate-limiter"
import { silentLogger } from "@/lib/logger"
import {
  AppleAdsPopularityProvider,
  createClientSecret,
  missingAppleAdsConfig,
  publishedPopularityPeriod,
  toAppleAdsGenre,
} from "./apple/apple-ads-popularity-provider"
import { ItunesClient } from "./apple/itunes-client"
import { AppleItunesMetadataProvider } from "./apple/itunes-metadata-provider"
import { AppleItunesRankProvider } from "./apple/itunes-rank-provider"
import { GooglePlayRankProvider } from "./google/google-play-rank-provider"

const OUR_APP = 6761086056

function app(trackId: number, userRatingCount = 100) {
  return {
    trackId,
    trackName: `App ${trackId}`,
    sellerName: "Dev",
    userRatingCount,
    averageUserRating: 4.5,
  }
}

function itunesResponse(results: unknown[], resultCount = results.length) {
  return new Response(JSON.stringify({ resultCount, results }), { status: 200 })
}

function makeClient(fetchImpl: typeof fetch) {
  return new ItunesClient({
    fetchImpl,
    limiter: new MinIntervalRateLimiter(0),
    logger: silentLogger,
    retries: 1,
    baseDelayMs: 1,
    maxDelayMs: 2,
    sleep: async () => {},
  })
}

const query = {
  keyword: "budget game",
  platform: "ios" as const,
  country: "US",
  language: "en",
  appExternalId: String(OUR_APP),
}

describe("AppleItunesRankProvider", () => {
  it("returns the 1-based position and the leading competitors", async () => {
    const results = [app(1, 50_000), app(2), app(OUR_APP), app(3)]
    // Apple's envelope can claim more results than it sends; only those seen count.
    const fetchImpl = vi.fn(async () => itunesResponse(results, 200))
    const provider = new AppleItunesRankProvider(makeClient(fetchImpl as unknown as typeof fetch))

    const result = await provider.getRank(query)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data).toMatchObject({
      rank: 3,
      resultCount: 4,
      searchDepth: 200,
      source: "apple_itunes_search",
      confidence: "medium",
    })
    expect(result.data.topCompetitors.map((c) => c.externalId)).toEqual(["1", "2", "3"])
    expect(result.data.topCompetitors[2]!.position).toBe(4)
  })

  it("reports rank null with low confidence when the app is absent", async () => {
    const fetchImpl = vi.fn(async () => itunesResponse([app(1), app(2)]))
    const result = await new AppleItunesRankProvider(
      makeClient(fetchImpl as unknown as typeof fetch),
    ).getRank(query)
    expect(result.ok && result.data.rank).toBeNull()
    expect(result.ok && result.data.resultCount).toBe(2)
    expect(result.ok && result.data.confidence).toBe("low")
  })

  it("lowers confidence for deep positions, where Apple's ordering is unstable", async () => {
    const results = [...Array.from({ length: 79 }, (_, i) => app(i + 1)), app(OUR_APP)]
    const fetchImpl = vi.fn(async () => itunesResponse(results))
    const result = await new AppleItunesRankProvider(
      makeClient(fetchImpl as unknown as typeof fetch),
    ).getRank(query)
    expect(result.ok && result.data.rank).toBe(80)
    expect(result.ok && result.data.confidence).toBe("low")
  })

  it("preserves positions when an entry fails to parse", async () => {
    const fetchImpl = vi.fn(async () => itunesResponse([{ kind: "not-an-app" }, app(OUR_APP)]))
    const result = await new AppleItunesRankProvider(
      makeClient(fetchImpl as unknown as typeof fetch),
    ).getRank(query)
    expect(result.ok && result.data.rank).toBe(2)
  })

  it("sends the documented search parameters", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request) => itunesResponse([]))
    await new AppleItunesRankProvider(makeClient(fetchImpl as unknown as typeof fetch)).getRank(
      query,
    )
    const url = new URL(String(fetchImpl.mock.calls[0]![0]))
    expect(url.origin + url.pathname).toBe("https://itunes.apple.com/search")
    expect(Object.fromEntries(url.searchParams)).toEqual({
      term: "budget game",
      country: "us",
      entity: "software",
      limit: "200",
    })
  })

  it("deduplicates identical searches within the cache window", async () => {
    const fetchImpl = vi.fn(async () => itunesResponse([app(OUR_APP)]))
    const provider = new AppleItunesRankProvider(makeClient(fetchImpl as unknown as typeof fetch))
    await provider.getRank(query)
    await provider.getRank({ ...query, appExternalId: "123" })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it("maps throttling to rate_limited and does not cache failures", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 429 }))
    const provider = new AppleItunesRankProvider(makeClient(fetchImpl as unknown as typeof fetch))
    const result = await provider.getRank(query)
    expect(result).toMatchObject({ ok: false, error: { code: "rate_limited", retryable: true } })
    await provider.getRank(query)
    expect(fetchImpl).toHaveBeenCalledTimes(4) // 2 attempts × 2 calls
  })

  it("rejects malformed responses", async () => {
    const fetchImpl = vi.fn(async () => new Response("<html>", { status: 200 }))
    const result = await new AppleItunesRankProvider(
      makeClient(fetchImpl as unknown as typeof fetch),
    ).getRank(query)
    expect(result).toMatchObject({ ok: false, error: { code: "bad_response" } })
  })

  it("validates inputs", async () => {
    const provider = new AppleItunesRankProvider(makeClient(vi.fn() as unknown as typeof fetch))
    expect(await provider.getRank({ ...query, appExternalId: "com.hunter.vault" })).toMatchObject({
      ok: false,
      error: { code: "invalid_input" },
    })
    expect(await provider.getRank({ ...query, platform: "android" })).toMatchObject({
      ok: false,
      error: { code: "unsupported" },
    })
  })
})

describe("AppleItunesMetadataProvider", () => {
  it("maps lookup results and leaves the subtitle unknown", async () => {
    const fetchImpl = vi.fn(async () =>
      itunesResponse([
        {
          ...app(OUR_APP),
          trackName: "Budget Tracker: Hunter Vault",
          bundleId: "com.hunter.vault",
          primaryGenreName: "Finance",
          version: "6.7.4",
        },
      ]),
    )
    const result = await new AppleItunesMetadataProvider(
      makeClient(fetchImpl as unknown as typeof fetch),
    ).getListing({
      platform: "ios",
      externalAppId: String(OUR_APP),
      country: "US",
    })
    expect(result).toMatchObject({
      ok: true,
      data: {
        title: "Budget Tracker: Hunter Vault",
        bundleId: "com.hunter.vault",
        subtitle: null,
        primaryCategory: "Finance",
        version: "6.7.4",
      },
    })
  })

  it("reports not_found for unknown ids", async () => {
    const fetchImpl = vi.fn(async () => itunesResponse([]))
    const result = await new AppleItunesMetadataProvider(
      makeClient(fetchImpl as unknown as typeof fetch),
    ).getListing({
      platform: "ios",
      externalAppId: "1",
      country: "US",
    })
    expect(result).toMatchObject({ ok: false, error: { code: "not_found" } })
  })
})

describe("GooglePlayRankProvider", () => {
  it("is explicitly unsupported rather than guessing", async () => {
    const provider = new GooglePlayRankProvider()
    expect(provider.status().state).toBe("unsupported")
    expect(await provider.getRank()).toMatchObject({ ok: false, error: { code: "unsupported" } })
  })
})

describe("AppleAdsPopularityProvider", () => {
  it("is not configured without credentials and does not make requests", async () => {
    const provider = new AppleAdsPopularityProvider({})
    expect(provider.status()).toMatchObject({
      state: "not_configured",
      detail: "Apple keyword popularity not connected",
    })
    const result = await provider.getPopularity({
      platform: "ios",
      country: "US",
      terms: ["budget"],
      genre: "Finance",
    })
    expect(result).toMatchObject({ ok: false, error: { code: "not_configured" } })
  })

  it("lists missing variables", () => {
    expect(missingAppleAdsConfig({ clientId: "x" })).toEqual([
      "APPLE_ADS_ACCOUNT_ID",
      "APPLE_ADS_TEAM_ID",
      "APPLE_ADS_KEY_ID",
      "APPLE_ADS_PRIVATE_KEY",
    ])
    expect(missingAppleAdsConfig({ clientId: "x", accountId: "1", clientSecret: "jwt" })).toEqual(
      [],
    )
  })

  it("signs a verifiable ES256 client secret", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" })
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString()
    const jwt = createClientSecret({
      clientId: "SEARCHADS.abc",
      teamId: "SEARCHADS.abc",
      keyId: "kid1",
      privateKey: pem,
    })
    const [header, payload, signature] = jwt.split(".")
    expect(JSON.parse(Buffer.from(header!, "base64url").toString())).toEqual({
      alg: "ES256",
      kid: "kid1",
    })
    expect(JSON.parse(Buffer.from(payload!, "base64url").toString())).toMatchObject({
      sub: "SEARCHADS.abc",
      aud: "https://appleid.apple.com",
    })
    const valid = verify(
      "sha256",
      Buffer.from(`${header}.${payload}`),
      { key: publicKey, dsaEncoding: "ieee-p1363" },
      Buffer.from(signature!, "base64url"),
    )
    expect(valid).toBe(true)
  })

  it("maps App Store categories to Apple Ads genres, and leaves unsupported ones unmapped", () => {
    expect(toAppleAdsGenre("Finance")).toBe("FINANCE")
    expect(toAppleAdsGenre("Health & Fitness")).toBe("HEALTH_FITNESS")
    expect(toAppleAdsGenre("Productivity")).toBe("PRODUCTIVITY_UTILITIES")
    expect(toAppleAdsGenre("Utilities")).toBe("PRODUCTIVITY_UTILITIES")
    expect(toAppleAdsGenre("FOOD_DRINK")).toBe("FOOD_DRINK")
    expect(toAppleAdsGenre("Medical")).toBeNull()
    expect(toAppleAdsGenre(null)).toBeNull()
  })
})

describe("publishedPopularityPeriod", () => {
  const at = (iso: string) => new Date(iso)
  const weekly = (iso: string, back = 0) => {
    const p = publishedPopularityPeriod("weekly", at(iso), back)
    return [p.start, p.end]
  }

  it("uses the Sunday–Saturday week Apple publishes on Mondays at 07:00 UTC", () => {
    expect(weekly("2026-10-05T07:00:00Z")).toEqual(["2026-09-27", "2026-10-03"])
    expect(weekly("2026-10-06T10:00:00Z")).toEqual(["2026-09-27", "2026-10-03"])
    // Before Monday 07:00 UTC the week that just ended isn't out yet.
    expect(weekly("2026-10-05T06:59:00Z")).toEqual(["2026-09-20", "2026-09-26"])
    expect(weekly("2026-10-04T12:00:00Z")).toEqual(["2026-09-20", "2026-09-26"])
    // On a Saturday the current week is still in progress.
    expect(weekly("2026-10-03T23:00:00Z")).toEqual(["2026-09-20", "2026-09-26"])
    expect(weekly("2026-10-06T10:00:00Z", 1)).toEqual(["2026-09-20", "2026-09-26"])
  })

  it("marks the period end as the start of the following day", () => {
    const p = publishedPopularityPeriod("weekly", at("2026-10-06T10:00:00Z"))
    expect(p.endsAt.toISOString()).toBe("2026-10-04T00:00:00.000Z")
  })

  it("uses the previous calendar month from the 5th", () => {
    const monthly = (iso: string) => {
      const p = publishedPopularityPeriod("monthly", at(iso))
      return [p.start, p.end, p.endsAt.toISOString().slice(0, 10)]
    }
    expect(monthly("2026-10-05T00:00:00Z")).toEqual(["2026-09-01", "2026-09-30", "2026-10-01"])
    expect(monthly("2026-10-04T23:00:00Z")).toEqual(["2026-08-01", "2026-08-31", "2026-09-01"])
    expect(monthly("2026-01-10T00:00:00Z")).toEqual(["2025-12-01", "2025-12-31", "2026-01-01"])
  })
})

describe("AppleAdsPopularityProvider requests", () => {
  const NOW = new Date("2026-10-06T10:00:00Z")
  const config = { clientId: "SEARCHADS.client", accountId: "12345", clientSecret: "signed.jwt" }

  type Call = { url: string; init: RequestInit; body: Record<string, unknown> | null }
  type Filter = { field: string; operator: string; value: unknown }

  function row(searchTerm: string, extra: Record<string, unknown> = {}) {
    return {
      week: "2026-10-04",
      countryOrRegion: "US",
      genre: "FINANCE",
      searchTerm,
      rankInGenre: 12,
      searchPopularityInGenre: 81,
      searchPopularity1to100: 64,
      searchPopularity1to5: 4,
      ...extra,
    }
  }

  /** Fake Apple: token endpoint plus a popularity endpoint answered by `respond`. */
  function fakeApple(respond: (body: Record<string, unknown>, call: number) => Response) {
    const calls: Call[] = []
    let apiCalls = 0
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : null
      calls.push({ url, init: init ?? {}, body })
      if (url.startsWith("https://appleid.apple.com/")) {
        return new Response(JSON.stringify({ access_token: "token-1", expires_in: 3600 }))
      }
      return respond(body, apiCalls++)
    })
    const provider = new AppleAdsPopularityProvider(config, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleep: async () => {},
      now: () => NOW,
    })
    return { provider, calls, apiCalls: () => calls.filter((c) => c.url.includes("api.ads")) }
  }

  const page = (rows: unknown[], totalCount = rows.length) =>
    new Response(
      JSON.stringify({
        result: { rows },
        pagination: { offset: 0, pageSize: rows.length, totalCount },
      }),
    )
  const hasTermFilter = (body: Record<string, unknown>) =>
    (body.filters as Filter[]).some((f) => f.field === "searchTerm")

  const query = {
    platform: "ios" as const,
    country: "us",
    terms: ["Budget Tracker", "money rpg"],
    genre: "Finance",
  }

  it("sends the documented request and maps returned and missing terms", async () => {
    const { provider, calls, apiCalls } = fakeApple((body) =>
      hasTermFilter(body) ? page([row("budget tracker")]) : page([row("anything")]),
    )
    const result = await provider.getPopularity(query)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const token = new URL(calls[0]!.url)
    expect(token.origin + token.pathname).toBe("https://appleid.apple.com/auth/oauth2/token")
    expect(token.searchParams.get("grant_type")).toBe("client_credentials")
    expect(token.searchParams.get("client_id")).toBe("SEARCHADS.client")
    expect(token.searchParams.get("scope")).toBe("searchadsorg")

    const [probe, terms] = apiCalls()
    expect(terms!.url).toBe(
      "https://api.ads.apple.com/v1/insights/apps/search-term-popularity/query",
    )
    expect(terms!.init.method).toBe("POST")
    expect(terms!.init.headers).toMatchObject({
      Authorization: "Bearer token-1",
      "X-AP-Context": "adAccountId=12345",
      "Content-Type": "application/json",
    })
    expect(terms!.body).toEqual({
      fields: [
        "rankInGenre",
        "searchPopularityInGenre",
        "searchPopularity1to100",
        "searchPopularity1to5",
      ],
      filters: [
        { field: "countryOrRegion", operator: "EQUALS", value: "US" },
        { field: "searchTerm", operator: "IN", value: ["budget tracker", "money rpg"] },
      ],
      timeRange: { start: "2026-09-27", end: "2026-10-03", granularity: "WEEKLY_SUN_SAT" },
      sorting: [{ field: "rankInGenre", order: "ASC" }],
      pagination: { offset: 0, pageSize: 1000 },
    })
    // The probe checks the storefront has data for the period before any term is judged.
    expect(probe!.body).toMatchObject({
      filters: [{ field: "countryOrRegion", operator: "EQUALS", value: "US" }],
      pagination: { offset: 0, pageSize: 1 },
    })
    expect(probe!.body).not.toHaveProperty("fields")

    expect(result.data.period).toMatchObject({
      granularity: "weekly",
      start: "2026-09-27",
      end: "2026-10-03",
    })
    const [measured, missing] = result.data.observations
    expect(measured).toMatchObject({
      term: "budget tracker",
      status: "measured",
      score: 64,
      granularity: "weekly",
      periodStart: "2026-09-27",
      periodEnd: "2026-10-03",
      details: {
        genre: "FINANCE",
        rankInGenre: 12,
        searchPopularityInGenre: 81,
        searchPopularity1to100: 64,
        searchPopularity1to5: 4,
      },
    })
    expect(measured!.measuredAt.toISOString()).toBe("2026-10-04T00:00:00.000Z")
    // Not returned is its own state, never a zero.
    expect(missing).toMatchObject({ term: "money rpg", status: "below_threshold", score: null })
  })

  it("prefers the app's genre when Apple returns a term in several genres", async () => {
    const { provider } = fakeApple((body) =>
      hasTermFilter(body)
        ? page([
            row("money rpg", { genre: "GAMES", rankInGenre: 3, searchPopularityInGenre: 90 }),
            row("money rpg", { genre: "FINANCE", rankInGenre: 40, searchPopularityInGenre: 30 }),
          ])
        : page([row("x")]),
    )
    const result = await provider.getPopularity({ ...query, terms: ["money rpg"] })
    if (!result.ok) throw new Error(result.error.message)
    expect(result.data.observations[0]!.details).toMatchObject({
      genre: "FINANCE",
      rankInGenre: 40,
      genresReturned: ["GAMES", "FINANCE"],
    })
  })

  it("records nothing when Apple has no data for the storefront and period", async () => {
    const { provider, apiCalls } = fakeApple(() => page([]))
    const result = await provider.getPopularity(query)
    expect(result).toMatchObject({ ok: false, error: { code: "unavailable" } })
    // Latest and previous period probed; no term was judged "not returned".
    expect(apiCalls()).toHaveLength(2)
    expect(apiCalls().every((c) => !hasTermFilter(c.body!))).toBe(true)
  })

  it("falls back to the previous period when the latest isn't published yet", async () => {
    const { provider, apiCalls } = fakeApple((body, call) =>
      call === 0
        ? page([])
        : hasTermFilter(body)
          ? page([row("budget tracker")])
          : page([row("x")]),
    )
    const result = await provider.getPopularity(query)
    if (!result.ok) throw new Error(result.error.message)
    expect(result.data.period).toMatchObject({ start: "2026-09-20", end: "2026-09-26" })
    expect(apiCalls()[2]!.body!.timeRange).toMatchObject({ start: "2026-09-20", end: "2026-09-26" })
  })

  it("follows pagination until totalCount is reached", async () => {
    const filler = Array.from({ length: 1000 }, (_, i) => row(`term ${i}`))
    const { provider, apiCalls } = fakeApple((body) => {
      if (!hasTermFilter(body)) return page([row("x")])
      const offset = (body.pagination as { offset: number }).offset
      return offset === 0 ? page(filler, 1001) : page([row("money rpg")], 1001)
    })
    const result = await provider.getPopularity(query)
    if (!result.ok) throw new Error(result.error.message)
    const offsets = apiCalls()
      .filter((c) => hasTermFilter(c.body!))
      .map((c) => (c.body!.pagination as { offset: number }).offset)
    expect(offsets).toEqual([0, 1000])
    expect(result.data.observations[1]).toMatchObject({ term: "money rpg", status: "measured" })
  })

  it("rejects responses that don't match the documented shape", async () => {
    const legacy = fakeApple(() => new Response(JSON.stringify({ data: [row("x")] })))
    expect(await legacy.provider.getPopularity(query)).toMatchObject({
      ok: false,
      error: { code: "bad_response" },
    })

    const noScore = fakeApple((body) =>
      hasTermFilter(body)
        ? page([{ ...row("budget tracker"), searchPopularity1to100: undefined }])
        : page([row("x")]),
    )
    expect(await noScore.provider.getPopularity(query)).toMatchObject({
      ok: false,
      error: { code: "bad_response" },
    })
  })

  it("maps auth failures and rate limits", async () => {
    const unauthorized = fakeApple(() => new Response("{}", { status: 401 }))
    expect(await unauthorized.provider.getPopularity(query)).toMatchObject({
      ok: false,
      error: { code: "not_configured" },
    })
    const limited = fakeApple(() => new Response("{}", { status: 429 }))
    expect(await limited.provider.getPopularity(query)).toMatchObject({
      ok: false,
      error: { code: "rate_limited", retryable: true },
    })
  })
})
