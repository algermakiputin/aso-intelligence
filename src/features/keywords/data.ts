import "server-only"

import { z } from "zod"
import { toRankValue } from "@/lib/aso/rank"
import type { AsoClient } from "@/lib/supabase/types"
import type { PopularityStatus } from "@/types/aso"
import { type KeywordRow, mapKeywordOverviewRow, type RankObservation } from "./model"

/** Keyword tables are expected to stay well under PostgREST's max_rows (1000). */
const KEYWORD_LIMIT = 1000

export async function listKeywords(db: AsoClient, appId: string): Promise<KeywordRow[]> {
  const { data, error } = await db
    .from("keyword_overview")
    .select("*")
    .eq("app_id", appId)
    .order("keyword")
    .limit(KEYWORD_LIMIT)
  if (error) throw new Error(`Failed to load keywords: ${error.message}`)
  return data.flatMap((row) => mapKeywordOverviewRow(row) ?? [])
}

export async function getKeyword(
  db: AsoClient,
  appId: string,
  keywordId: string,
): Promise<KeywordRow | null> {
  if (!z.uuid().safeParse(keywordId).success) return null
  const { data, error } = await db
    .from("keyword_overview")
    .select("*")
    .eq("app_id", appId)
    .eq("id", keywordId)
    .maybeSingle()
  if (error) throw new Error(`Failed to load keyword: ${error.message}`)
  return data ? mapKeywordOverviewRow(data) : null
}

export interface RankHistoryPoint extends RankObservation {
  source: string
}

export async function getRankHistory(
  db: AsoClient,
  keywordId: string,
  since: Date | null,
): Promise<RankHistoryPoint[]> {
  let query = db
    .from("keyword_rank_history")
    .select("rank, result_count, search_depth, source, checked_at")
    .eq("keyword_id", keywordId)
    .order("checked_at", { ascending: false })
    .limit(1000)
  if (since) query = query.gte("checked_at", since.toISOString())
  const { data, error } = await query
  if (error) throw new Error(`Failed to load rank history: ${error.message}`)
  return data
    .map((h) => ({
      value: toRankValue({
        rank: h.rank,
        resultCount: h.result_count,
        searchDepth: h.search_depth,
      }),
      checkedAt: h.checked_at,
      source: h.source,
    }))
    .reverse()
}

export interface PopularityPoint {
  status: PopularityStatus
  score: number | null
  source: string
  granularity: string
  measuredAt: string
}

export async function getPopularityHistory(
  db: AsoClient,
  keywordId: string,
): Promise<PopularityPoint[]> {
  const { data, error } = await db
    .from("keyword_popularity_history")
    .select("status, popularity_score, source, granularity, measured_at")
    .eq("keyword_id", keywordId)
    .order("measured_at", { ascending: true })
    .limit(500)
  if (error) throw new Error(`Failed to load popularity history: ${error.message}`)
  return data.map((p) => ({
    status: p.status === "below_threshold" ? "below_threshold" : "measured",
    score: p.popularity_score,
    source: p.source,
    granularity: p.granularity,
    measuredAt: p.measured_at,
  }))
}

const topResultsSchema = z.array(
  z.object({
    position: z.number(),
    externalId: z.string().nullable(),
    name: z.string().nullable(),
    developer: z.string().nullable(),
    ratingCount: z.number().nullable(),
    rating: z.number().nullable(),
  }),
)

export interface DifficultyDetail {
  score: number
  method: string
  source: string
  sampleSize: number
  measuredAt: string
  topResults: z.infer<typeof topResultsSchema>
}

export async function getLatestDifficulty(
  db: AsoClient,
  keywordId: string,
): Promise<DifficultyDetail | null> {
  const { data, error } = await db
    .from("keyword_difficulty_history")
    .select("difficulty_score, method, source, sample_size, details, measured_at")
    .eq("keyword_id", keywordId)
    .order("measured_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`Failed to load difficulty: ${error.message}`)
  if (!data) return null
  const details = (data.details ?? {}) as { top_results?: unknown }
  const topResults = topResultsSchema.safeParse(details.top_results ?? [])
  return {
    score: data.difficulty_score,
    method: data.method,
    source: data.source,
    sampleSize: data.sample_size,
    measuredAt: data.measured_at,
    topResults: topResults.success ? topResults.data : [],
  }
}
