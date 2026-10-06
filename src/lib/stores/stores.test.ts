import { generateKeyPairSync, verify } from "node:crypto"
import { describe, expect, it, vi } from "vitest"
import { MinIntervalRateLimiter } from "@/lib/http/rate-limiter"
import { silentLogger } from "@/lib/logger"
import {
  AppleAdsPopularityProvider,
  createClientSecret,
  missingAppleAdsConfig,
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
    const fetchImpl = vi.fn(async () => itunesResponse(results, 200))
    const provider = new AppleItunesRankProvider(makeClient(fetchImpl as unknown as typeof fetch))

    const result = await provider.getRank(query)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data).toMatchObject({
      rank: 3,
      resultCount: 200,
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

  it("maps store categories to genre identifiers", () => {
    expect(toAppleAdsGenre("Finance")).toBe("FINANCE")
    expect(toAppleAdsGenre("Health & Fitness")).toBe("HEALTH_FITNESS")
  })
})
