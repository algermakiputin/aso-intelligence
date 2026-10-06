/**
 * Keyword domain objects as consumed by the UI. All derived values (rank value, change,
 * Opportunity Score) are computed here from stored observations, never in components.
 * Timestamps are ISO strings so objects can cross the server → client boundary.
 */

import { z } from "zod"
import { computeRankChange, type RankChange, type RankValue, toRankValue } from "@/lib/aso/rank"
import { popularityState } from "@/lib/aso/popularity"
import {
  computeOpportunity,
  missingInputReasons,
  type OpportunityResult,
} from "@/lib/aso/scoring/opportunity"
import type { ViewRow } from "@/lib/supabase/types"
import type { DataConfidence, Platform, PopularityStatus } from "@/types/aso"

export interface RankObservation {
  value: RankValue
  checkedAt: string
}

/** Apple's in-genre metrics, stored alongside the storefront-wide score. */
export interface PopularityGenreDetails {
  genre: string
  rankInGenre: number | null
  searchPopularityInGenre: number | null
  searchPopularity1to5: number | null
}

export interface KeywordPopularity {
  status: PopularityStatus
  /** 1–100 when measured; null when not returned. Never a stand-in zero. */
  score: number | null
  source: string
  measuredAt: string
  granularity: string
  periodStart: string | null
  periodEnd: string | null
  genre: PopularityGenreDetails | null
}

export interface KeywordRow {
  id: string
  appId: string
  keyword: string
  platform: Platform
  country: string
  language: string
  tracked: boolean
  isPriority: boolean
  relevance: number | null
  notes: string | null
  createdAt: string
  latestRank: (RankObservation & { source: string; confidence: DataConfidence }) | null
  previousRank: RankObservation | null
  change: RankChange
  popularity: KeywordPopularity | null
  difficulty: { score: number; method: string; source: string; measuredAt: string } | null
  recentRanks: RankObservation[]
  opportunity: OpportunityResult
}

const recentRanksSchema = z.array(
  z.object({
    rank: z.number().nullable(),
    result_count: z.number().nullable(),
    search_depth: z.number(),
    checked_at: z.string(),
  }),
)

const popularityStatusSchema = z.enum(["measured", "below_threshold"])

const popularityDetailsSchema = z.object({
  genre: z.string(),
  rankInGenre: z.number().nullish(),
  searchPopularityInGenre: z.number().nullish(),
  searchPopularity1to5: z.number().nullish(),
})

export function parsePopularityGenreDetails(details: unknown): PopularityGenreDetails | null {
  const parsed = popularityDetailsSchema.safeParse(details)
  if (!parsed.success) return null
  return {
    genre: parsed.data.genre,
    rankInGenre: parsed.data.rankInGenre ?? null,
    searchPopularityInGenre: parsed.data.searchPopularityInGenre ?? null,
    searchPopularity1to5: parsed.data.searchPopularity1to5 ?? null,
  }
}

/** Popularity that can feed scoring: only measured values count. */
export function measuredPopularity(row: Pick<KeywordRow, "popularity">): number | null {
  return row.popularity?.status === "measured" ? row.popularity.score : null
}

/** Why each missing Opportunity Score input is missing for this keyword. */
export function opportunityMissingReasons(
  row: Pick<KeywordRow, "opportunity" | "popularity">,
  popularityConnected: boolean,
) {
  return missingInputReasons(row.opportunity, popularityState(row.popularity, popularityConnected))
}

export function mapKeywordOverviewRow(row: ViewRow<"keyword_overview">): KeywordRow | null {
  if (!row.id || !row.app_id || !row.keyword || !row.platform || !row.country || !row.language)
    return null

  const latestRank =
    row.latest_checked_at &&
    row.latest_search_depth !== null &&
    row.latest_rank_source &&
    row.latest_rank_confidence
      ? {
          value: toRankValue({
            rank: row.latest_rank,
            resultCount: row.latest_result_count,
            searchDepth: row.latest_search_depth,
          }),
          checkedAt: row.latest_checked_at,
          source: row.latest_rank_source,
          confidence: row.latest_rank_confidence,
        }
      : null

  const previousRank =
    row.previous_checked_at && row.previous_search_depth !== null
      ? {
          value: toRankValue({
            rank: row.previous_rank,
            resultCount: row.previous_result_count,
            searchDepth: row.previous_search_depth,
          }),
          checkedAt: row.previous_checked_at,
        }
      : null

  const status = popularityStatusSchema.safeParse(row.popularity_status)
  const popularity =
    status.success && row.popularity_source && row.popularity_measured_at
      ? {
          status: status.data,
          score: status.data === "measured" ? row.popularity_score : null,
          source: row.popularity_source,
          measuredAt: row.popularity_measured_at,
          granularity: row.popularity_granularity ?? "point",
          periodStart: row.popularity_period_start,
          periodEnd: row.popularity_period_end,
          genre: parsePopularityGenreDetails(row.popularity_details),
        }
      : null

  const difficulty =
    row.difficulty_score !== null &&
    row.difficulty_method &&
    row.difficulty_source &&
    row.difficulty_measured_at
      ? {
          score: row.difficulty_score,
          method: row.difficulty_method,
          source: row.difficulty_source,
          measuredAt: row.difficulty_measured_at,
        }
      : null

  const recent = recentRanksSchema.safeParse(row.recent_ranks ?? [])
  const recentRanks = recent.success
    ? recent.data.map((r) => ({
        value: toRankValue({
          rank: r.rank,
          resultCount: r.result_count,
          searchDepth: r.search_depth,
        }),
        checkedAt: r.checked_at,
      }))
    : []

  const relevance = row.relevance_score

  return {
    id: row.id,
    appId: row.app_id,
    keyword: row.keyword,
    platform: row.platform,
    country: row.country,
    language: row.language,
    tracked: row.tracked ?? true,
    isPriority: row.is_priority ?? false,
    relevance,
    notes: row.notes,
    createdAt: row.created_at ?? "",
    latestRank,
    previousRank,
    change: computeRankChange(previousRank?.value ?? null, latestRank?.value ?? null),
    popularity,
    difficulty,
    recentRanks,
    opportunity: computeOpportunity({
      popularity: measuredPopularity({ popularity }),
      relevance,
      rank: latestRank?.value ?? null,
      difficulty: difficulty?.score ?? null,
    }),
  }
}
