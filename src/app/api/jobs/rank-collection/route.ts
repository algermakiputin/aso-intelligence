import { timingSafeEqual } from "node:crypto"
import { type AnalyticsImportSummary, importStoreAnalytics } from "@/features/analytics/collector"
import { collectKeywordRanks, type CollectSummary } from "@/features/rankings/collector"
import { getServerEnv } from "@/lib/env/server"
import { createLogger } from "@/lib/logger"
import { getAnalyticsProvider, getRankProvider } from "@/lib/stores/registry"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

/**
 * Scheduler entry point for the daily jobs (Vercel Cron, pg_cron + pg_net, or any
 * external scheduler). Requires `Authorization: Bearer $CRON_SECRET`. Uses the service
 * role. Within one time budget, across all non-demo apps:
 *
 *   1. Rank collection: keywords due per the schedule policy (priority ≈ daily,
 *      normal every 2–3 days).
 *   2. Store analytics import: new App Store Connect report instances (also keeps
 *      Apple's report request from stopping for inactivity).
 */

export const maxDuration = 300
export const dynamic = "force-dynamic"

const PER_APP_LIMIT = 40
const TIME_BUDGET_MS = 240_000
/** Rank collection may use this much; the rest is left for the analytics import. */
const RANK_BUDGET_MS = 180_000
const logger = createLogger("job:rank-collection")

function authorized(request: Request, secret: string): boolean {
  const header = request.headers.get("authorization") ?? ""
  const expected = Buffer.from(`Bearer ${secret}`)
  const received = Buffer.from(header)
  return received.length === expected.length && timingSafeEqual(received, expected)
}

async function run(request: Request): Promise<Response> {
  const secret = getServerEnv().CRON_SECRET
  if (!secret)
    return Response.json(
      { error: "Scheduled jobs are not configured (CRON_SECRET unset)" },
      { status: 503 },
    )
  if (!authorized(request, secret)) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const startedAt = Date.now()
  const db = createSupabaseAdminClient()
  const { data: apps, error } = await db
    .from("apps")
    .select("id, name, workspace:workspaces(is_demo)")
  if (error) {
    logger.error("load_apps_failed", { message: error.message })
    return Response.json({ error: "Failed to load apps" }, { status: 500 })
  }

  const results: Array<
    { appId: string; app: string } & Pick<
      CollectSummary,
      "status" | "checked" | "failed" | "skipped" | "remaining"
    >
  > = []
  for (const app of apps) {
    if (app.workspace?.is_demo) continue
    if (Date.now() - startedAt > RANK_BUDGET_MS) break
    const summary = await collectKeywordRanks(
      db,
      { getRankProvider },
      {
        appId: app.id,
        trigger: "scheduled",
        mode: "scheduled",
        limit: PER_APP_LIMIT,
      },
    )
    results.push({
      appId: app.id,
      app: app.name,
      status: summary.status,
      checked: summary.checked,
      failed: summary.failed,
      skipped: summary.skipped,
      remaining: summary.remaining,
    })
    if (summary.stoppedReason === "rate_limited") break
  }

  const analytics: Array<
    { appId: string; app: string } & Pick<
      AnalyticsImportSummary,
      "status" | "imported" | "remaining"
    >
  > = []
  for (const app of apps) {
    if (app.workspace?.is_demo) continue
    if (Date.now() - startedAt > TIME_BUDGET_MS) break
    try {
      const summary = await importStoreAnalytics(
        db,
        { getAnalyticsProvider },
        { appId: app.id, trigger: "scheduled", deadline: startedAt + TIME_BUDGET_MS },
      )
      analytics.push({
        appId: app.id,
        app: app.name,
        status: summary.status,
        imported: summary.imported,
        remaining: summary.remaining,
      })
    } catch (error) {
      logger.error("analytics_import_failed", {
        appId: app.id,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  logger.info("job_finished", { apps: results.length, ms: Date.now() - startedAt })
  return Response.json({ ok: true, durationMs: Date.now() - startedAt, results, analytics })
}

export const GET = run
export const POST = run
