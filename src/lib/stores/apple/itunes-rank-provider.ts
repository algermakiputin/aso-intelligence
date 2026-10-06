/**
 * Estimated iOS keyword rank from Apple's public iTunes Search API.
 *
 * The Search API's ordering approximates, but is not, App Store search ranking, and the
 * tail of the list (beyond roughly position 100) varies between identical requests.
 * Results are stored with source `apple_itunes_search` and the UI labels them
 * "Estimated Rank". Confidence is `medium` for positions within the top 50 and `low`
 * deeper down or when the app wasn't returned at all.
 */

import "server-only"

import {
  fail,
  ok,
  type KeywordRankProvider,
  type KeywordRankQuery,
  type KeywordRankResult,
  type ProviderResult,
  type ProviderStatus,
  type SearchResultEntry,
} from "../types"
import {
  ITUNES_MAX_LIMIT,
  type ItunesApp,
  type ItunesClient,
  type ItunesSearchResponse,
} from "./itunes-client"

export const ITUNES_RANK_SOURCE = "apple_itunes_search"
export const TOP_COMPETITORS = 10
/** Positions at or above this are reasonably stable between requests. */
export const STABLE_POSITION_LIMIT = 50

interface CacheEntry {
  expiresAt: number
  response: Promise<ProviderResult<ItunesSearchResponse>>
}

export class AppleItunesRankProvider implements KeywordRankProvider {
  readonly id = ITUNES_RANK_SOURCE
  readonly name = "Apple iTunes Search API"
  readonly platform = "ios" as const
  readonly official = false

  /** Dedupes identical searches (same term + storefront) across apps within a short window. */
  private readonly cache = new Map<string, CacheEntry>()

  constructor(
    private readonly client: ItunesClient,
    private readonly options: { cacheTtlMs?: number; now?: () => number } = {},
  ) {}

  status(): ProviderStatus {
    return { state: "ready", detail: "Public API. No credentials required." }
  }

  async getRank(query: KeywordRankQuery): Promise<ProviderResult<KeywordRankResult>> {
    if (query.platform !== "ios") {
      return fail("unsupported", "The iTunes Search API only covers the App Store")
    }
    if (!/^\d+$/.test(query.appExternalId)) {
      return fail("invalid_input", "iOS listings need a numeric App Store ID")
    }

    const search = await this.searchCached(query.keyword, query.country)
    if (!search.ok) return search

    const { results, resultCount, fetchedAt } = search.data
    const index = results.findIndex((r) => r !== null && String(r.trackId) === query.appExternalId)

    const topCompetitors: SearchResultEntry[] = []
    results.forEach((app, i) => {
      if (topCompetitors.length >= TOP_COMPETITORS) return
      if (app !== null && String(app.trackId) === query.appExternalId) return
      topCompetitors.push(toEntry(app, i + 1))
    })

    const rank = index === -1 ? null : index + 1
    return ok({
      rank,
      resultCount,
      searchDepth: ITUNES_MAX_LIMIT,
      source: ITUNES_RANK_SOURCE,
      confidence: rank !== null && rank <= STABLE_POSITION_LIMIT ? "medium" : "low",
      checkedAt: fetchedAt,
      topCompetitors,
    })
  }

  private searchCached(term: string, country: string) {
    const now = this.options.now?.() ?? Date.now()
    const key = `${country.toUpperCase()}:${term}`
    const cached = this.cache.get(key)
    if (cached && cached.expiresAt > now) return cached.response

    const response = this.client
      .search({ term, country, limit: ITUNES_MAX_LIMIT })
      .then((result) => {
        if (!result.ok) this.cache.delete(key)
        return result
      })
    this.cache.set(key, { expiresAt: now + (this.options.cacheTtlMs ?? 10 * 60_000), response })
    this.evictExpired(now)
    return response
  }

  private evictExpired(now: number) {
    if (this.cache.size < 500) return
    for (const [key, entry] of this.cache) if (entry.expiresAt <= now) this.cache.delete(key)
  }
}

function toEntry(app: ItunesApp | null, position: number): SearchResultEntry {
  return {
    position,
    externalId: app ? String(app.trackId) : null,
    name: app?.trackName ?? null,
    developer: app?.sellerName ?? app?.artistName ?? null,
    ratingCount: app?.userRatingCount ?? null,
    rating: app?.averageUserRating ?? null,
    iconUrl: app?.artworkUrl100 ?? null,
  }
}
