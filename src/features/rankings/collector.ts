import "server-only"

/**
 * One rank-collection pass for an app. Shared by the manual "Refresh rankings" action
 * (user session, RLS applies) and the scheduled job endpoint (service role).
 *
 * Every successful check appends a rank observation and, when the provider returns the
 * surrounding results, a difficulty estimate. Nothing is ever updated or overwritten.
 */

import { selectDueKeywords, type ScheduleMode } from "@/lib/aso/scheduling"
import { estimateDifficulty } from "@/lib/aso/scoring/difficulty"
import { createLogger, type Logger } from "@/lib/logger"
import type { KeywordRankProvider } from "@/lib/stores/types"
import type { AsoClient } from "@/lib/supabase/types"
import type { Platform } from "@/types/aso"
import { listListings } from "../listings/data"
import { selectListing } from "../listings/model"

export interface CollectorDeps {
  getRankProvider: (platform: Platform) => KeywordRankProvider
  now?: () => Date
  logger?: Logger
}

export interface CollectOptions {
  appId: string
  trigger: "manual" | "scheduled"
  mode: ScheduleMode
  /** Restrict to these keywords (must belong to the app). */
  keywordIds?: string[]
  /** Check the given keywords regardless of schedule (single "Check now"). */
  force?: boolean
  /** Maximum keywords to check in this pass. */
  limit: number
  /** Continue an existing run (batched manual refresh). */
  runId?: string | null
  triggeredBy?: string | null
}

export type SkipReason = "no_listing" | "provider_unavailable"

export interface CollectSummary {
  status: "nothing_due" | "demo_workspace" | "in_progress" | "succeeded" | "partial" | "failed"
  runId: string | null
  checked: number
  failed: number
  skipped: number
  /** Keywords still due after this pass. */
  remaining: number
  stoppedReason: "rate_limited" | null
  skipReasons: Partial<Record<SkipReason, number>>
  errors: Array<{ keyword: string; message: string }>
}

const emptySummary = (status: CollectSummary["status"]): CollectSummary => ({
  status,
  runId: null,
  checked: 0,
  failed: 0,
  skipped: 0,
  remaining: 0,
  stoppedReason: null,
  skipReasons: {},
  errors: [],
})

export async function collectKeywordRanks(
  db: AsoClient,
  deps: CollectorDeps,
  options: CollectOptions,
): Promise<CollectSummary> {
  const now = deps.now ?? (() => new Date())
  const logger = deps.logger ?? createLogger("rank-collector")

  const { data: app, error: appError } = await db
    .from("apps")
    .select("id, workspace:workspaces(is_demo)")
    .eq("id", options.appId)
    .single()
  if (appError) throw new Error(`Failed to load app: ${appError.message}`)
  if (app.workspace?.is_demo) return emptySummary("demo_workspace")

  let candidatesQuery = db
    .from("keyword_overview")
    .select("id, keyword, platform, country, language, tracked, is_priority, latest_checked_at")
    .eq("app_id", options.appId)
  if (options.keywordIds?.length) candidatesQuery = candidatesQuery.in("id", options.keywordIds)
  const [{ data: rows, error: candidatesError }, listings] = await Promise.all([
    candidatesQuery,
    listListings(db, options.appId),
  ])
  if (candidatesError) throw new Error(`Failed to load keywords: ${candidatesError.message}`)

  const candidates = rows.flatMap((r) =>
    r.id && r.keyword && r.platform && r.country && r.language
      ? [
          {
            id: r.id,
            keyword: r.keyword,
            platform: r.platform,
            country: r.country,
            language: r.language,
            tracked: options.force ? true : (r.tracked ?? false),
            isPriority: r.is_priority ?? false,
            lastCheckedAt: r.latest_checked_at ? new Date(r.latest_checked_at) : null,
          },
        ]
      : [],
  )

  const due = options.force
    ? candidates
    : selectDueKeywords(candidates, { now: now(), mode: options.mode })

  // Keywords that can't be checked (no listing, provider unavailable) are reported but
  // never batched; otherwise they would stay "due" forever and a batched refresh would
  // never finish.
  const summary: CollectSummary = emptySummary("in_progress")
  const processable: Array<
    (typeof due)[number] & { appExternalId: string; provider: KeywordRankProvider }
  > = []
  for (const keyword of due) {
    const match = selectListing(listings, keyword)
    if (!match) {
      summary.skipped++
      summary.skipReasons.no_listing = (summary.skipReasons.no_listing ?? 0) + 1
      continue
    }
    const provider = deps.getRankProvider(keyword.platform)
    if (provider.status().state !== "ready") {
      summary.skipped++
      summary.skipReasons.provider_unavailable = (summary.skipReasons.provider_unavailable ?? 0) + 1
      continue
    }
    processable.push({ ...keyword, appExternalId: match.listing.externalAppId, provider })
  }

  const batch = processable.slice(0, options.limit)
  if (batch.length === 0) return { ...summary, status: "nothing_due" }
  summary.remaining = processable.length - batch.length

  // Open (or continue) the audit-log run.
  let runId = options.runId ?? null
  if (!runId) {
    const { data: run, error } = await db
      .from("collector_runs")
      .insert({
        app_id: options.appId,
        job_type: "keyword_ranks",
        trigger: options.trigger,
        triggered_by: options.triggeredBy ?? null,
        items_total: processable.length,
      })
      .select("id")
      .single()
    if (error) throw new Error(`Failed to start collector run: ${error.message}`)
    runId = run.id
  }
  summary.runId = runId

  for (const [index, keyword] of batch.entries()) {
    const result = await keyword.provider.getRank({
      keyword: keyword.keyword,
      platform: keyword.platform,
      country: keyword.country,
      language: keyword.language,
      appExternalId: keyword.appExternalId,
    })

    if (!result.ok) {
      summary.failed++
      summary.errors.push({ keyword: keyword.keyword, message: result.error.message })
      logger.warn("rank_check_failed", { keywordId: keyword.id, code: result.error.code })
      if (result.error.code === "rate_limited") {
        summary.stoppedReason = "rate_limited"
        summary.remaining += batch.length - index - 1
        break
      }
      continue
    }

    const observation = result.data
    const { error: insertError } = await db.from("keyword_rank_history").insert({
      keyword_id: keyword.id,
      rank: observation.rank,
      result_count: observation.resultCount,
      search_depth: observation.searchDepth,
      source: observation.source,
      confidence: observation.confidence,
      checked_at: observation.checkedAt.toISOString(),
      collector_run_id: runId,
    })
    if (insertError) {
      summary.failed++
      summary.errors.push({ keyword: keyword.keyword, message: "Couldn't save the observation" })
      logger.error("rank_insert_failed", { keywordId: keyword.id, message: insertError.message })
      continue
    }

    const difficulty = estimateDifficulty(observation.topCompetitors)
    const { error: difficultyError } = await db.from("keyword_difficulty_history").insert({
      keyword_id: keyword.id,
      difficulty_score: difficulty.score,
      method: difficulty.method,
      source: observation.source,
      sample_size: difficulty.sampleSize,
      measured_at: observation.checkedAt.toISOString(),
      collector_run_id: runId,
      details: {
        result_count: observation.resultCount,
        top_results: observation.topCompetitors.map((c) => ({
          position: c.position,
          externalId: c.externalId,
          name: c.name,
          developer: c.developer,
          ratingCount: c.ratingCount,
          rating: c.rating,
        })),
      },
    })
    if (difficultyError)
      logger.warn("difficulty_insert_failed", {
        keywordId: keyword.id,
        message: difficultyError.message,
      })

    summary.checked++
  }

  // Close or advance the run.
  const { data: run } = await db
    .from("collector_runs")
    .select("items_succeeded, items_failed, items_skipped")
    .eq("id", runId)
    .single()
  const succeeded = (run?.items_succeeded ?? 0) + summary.checked
  const failed = (run?.items_failed ?? 0) + summary.failed
  const skipped = (run?.items_skipped ?? 0) + summary.skipped
  const finished = summary.remaining === 0 || summary.stoppedReason !== null
  const finalStatus = failed === 0 ? "succeeded" : succeeded > 0 ? "partial" : "failed"

  await db
    .from("collector_runs")
    .update({
      items_succeeded: succeeded,
      items_failed: failed,
      items_skipped: skipped,
      ...(finished
        ? {
            status: finalStatus,
            finished_at: now().toISOString(),
            error_summary:
              summary.stoppedReason === "rate_limited"
                ? "Stopped early: Apple rate-limited requests"
                : (summary.errors[0]?.message ?? null),
          }
        : {}),
    })
    .eq("id", runId)

  summary.status = finished ? finalStatus : "in_progress"
  logger.info("collection_pass", {
    appId: options.appId,
    trigger: options.trigger,
    checked: summary.checked,
    failed: summary.failed,
    skipped: summary.skipped,
    remaining: summary.remaining,
  })
  return summary
}
