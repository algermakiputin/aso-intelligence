/**
 * External store provider contracts. The application depends only on these interfaces;
 * concrete providers (public APIs, official APIs, future vendors) live behind them and
 * are wired up in `registry.ts`.
 *
 * Providers never throw for expected failures. They return a `ProviderResult` whose
 * error code tells the caller whether to retry, skip, or stop.
 */

import type { DataConfidence, Platform, PopularityGranularity, PopularityStatus } from "@/types/aso"

// ---------------------------------------------------------------------------
// Results and status
// ---------------------------------------------------------------------------

export type ProviderErrorCode =
  | "not_configured"
  | "unsupported"
  | "rate_limited"
  | "timeout"
  | "network"
  | "bad_response"
  | "not_found"
  | "invalid_input"
  /** The provider has no dataset for the query (not published yet, or storefront not covered). */
  | "unavailable"

export interface ProviderError {
  code: ProviderErrorCode
  message: string
  retryable: boolean
}

export type ProviderResult<T> = { ok: true; data: T } | { ok: false; error: ProviderError }

export function ok<T>(data: T): ProviderResult<T> {
  return { ok: true, data }
}

export function fail<T = never>(
  code: ProviderErrorCode,
  message: string,
  retryable = false,
): ProviderResult<T> {
  return { ok: false, error: { code, message, retryable } }
}

export type ProviderStatus =
  | { state: "ready"; detail: string }
  | { state: "not_configured"; detail: string; missing: string[] }
  | { state: "unsupported"; detail: string }

export interface ProviderDescriptor {
  /** Stable id, stored as `source` on observations. */
  readonly id: string
  readonly name: string
  readonly platform: Platform
  /** Official store data (vs. public endpoints that only approximate store behaviour). */
  readonly official: boolean
  status(): ProviderStatus
}

// ---------------------------------------------------------------------------
// Keyword rank
// ---------------------------------------------------------------------------

export interface KeywordRankQuery {
  keyword: string
  platform: Platform
  country: string
  language: string
  /** iOS: numeric App Store ID. Android: package name. */
  appExternalId: string
}

export interface SearchResultEntry {
  /** 1-based position in the search results. */
  position: number
  externalId: string | null
  name: string | null
  developer: string | null
  ratingCount: number | null
  rating: number | null
  iconUrl: string | null
}

export interface KeywordRankResult {
  /** 1-based position, or null when the app is not within `searchDepth` results. */
  rank: number | null
  /** Number of results the provider returned. */
  resultCount: number
  /** How many results the provider can see at most. */
  searchDepth: number
  source: string
  confidence: DataConfidence
  checkedAt: Date
  /** Leading results excluding the app itself (used for difficulty and "top results"). */
  topCompetitors: SearchResultEntry[]
}

export interface KeywordRankProvider extends ProviderDescriptor {
  getRank(query: KeywordRankQuery): Promise<ProviderResult<KeywordRankResult>>
}

// ---------------------------------------------------------------------------
// Keyword popularity
// ---------------------------------------------------------------------------

export interface KeywordPopularityQuery {
  platform: Platform
  country: string
  terms: string[]
  /**
   * Store category of the app (e.g. "Finance"). Optional; genre-scoped datasets use it to
   * pick in-genre metrics when a term is reported in several genres.
   */
  genre: string | null
  /** Defaults to weekly. */
  granularity?: "weekly" | "monthly"
}

export interface PopularityPeriod {
  granularity: "weekly" | "monthly"
  /** First day of the period (YYYY-MM-DD, UTC). */
  start: string
  /** Last day of the period (YYYY-MM-DD, UTC). */
  end: string
  /** Instant the period ended (start of the following day, UTC). */
  endsAt: Date
}

export interface PopularityObservation {
  term: string
  /**
   * `measured`: the provider returned a value. `below_threshold`: the provider's dataset
   * for this period didn't include the term. That is not a zero.
   */
  status: PopularityStatus
  /** 1–100 when measured; null when not returned. */
  score: number | null
  granularity: PopularityGranularity
  periodStart: string | null
  periodEnd: string | null
  measuredAt: Date
  /** Provider-specific fields stored with the observation (e.g. Apple's rank in genre). */
  details: Record<string, unknown>
}

export interface KeywordPopularityResult {
  source: string
  /** Period the observations describe; null when no terms were queried. */
  period: PopularityPeriod | null
  observations: PopularityObservation[]
}

export interface KeywordPopularityProvider extends ProviderDescriptor {
  getPopularity(query: KeywordPopularityQuery): Promise<ProviderResult<KeywordPopularityResult>>
}

// ---------------------------------------------------------------------------
// Listing metadata
// ---------------------------------------------------------------------------

export interface ListingMetadataQuery {
  platform: Platform
  externalAppId: string
  country: string
}

export interface StoreListingMetadata {
  externalAppId: string
  bundleId: string | null
  title: string | null
  /** Public lookups don't expose the iOS subtitle; null means "unknown", not empty. */
  subtitle: string | null
  description: string | null
  developerName: string | null
  primaryCategory: string | null
  iconUrl: string | null
  version: string | null
  rating: number | null
  ratingCount: number | null
  storeUrl: string | null
  source: string
  fetchedAt: Date
}

export interface MetadataProvider extends ProviderDescriptor {
  getListing(query: ListingMetadataQuery): Promise<ProviderResult<StoreListingMetadata>>
}

// ---------------------------------------------------------------------------
// Contracts for later versions (no implementations in V0.1)
// ---------------------------------------------------------------------------

export interface StoreAnalyticsQuery {
  platform: Platform
  externalAppId: string
  from: string
  to: string
}

export interface StoreAnalyticsMetric {
  date: string
  country: string | null
  /** e.g. impressions, product_page_views, downloads, conversion_rate */
  metric: string
  value: number
  source: string
}

/** V0.2: App Store Connect Analytics / Google Play reporting. */
export interface StoreAnalyticsProvider extends ProviderDescriptor {
  getDailyMetrics(query: StoreAnalyticsQuery): Promise<ProviderResult<StoreAnalyticsMetric[]>>
}

export interface StoreReview {
  externalId: string
  rating: number
  title: string | null
  body: string
  author: string | null
  country: string
  version: string | null
  createdAt: Date
}

/** V0.4: review intelligence. */
export interface ReviewProvider extends ProviderDescriptor {
  getRecentReviews(query: {
    platform: Platform
    externalAppId: string
    country: string
  }): Promise<ProviderResult<StoreReview[]>>
}
