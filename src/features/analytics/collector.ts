import "server-only"

/**
 * One store-analytics import pass for an app. Shared by the "Import now" action (user
 * session, RLS applies) and the scheduled job (service role).
 *
 * It keeps Apple's ONGOING report request alive, lists the daily report instances and
 * imports the ones not imported yet, each in one transaction
 * (`aso.import_store_analytics_instance`). Instances are kept as delivered; the
 * `store_analytics_daily` view picks the latest instance per date.
 */

import { createLogger, type Logger } from "@/lib/logger"
import type { StoreAnalyticsInstance, StoreAnalyticsProvider } from "@/lib/stores/types"
import type { AsoClient } from "@/lib/supabase/types"
import type { Platform } from "@/types/aso"

export interface AnalyticsImportDeps {
  getAnalyticsProvider: (platform: Platform) => StoreAnalyticsProvider | null
  logger?: Logger
}

export interface AnalyticsImportOptions {
  appId: string
  trigger: "manual" | "scheduled"
  triggeredBy?: string | null
  /** Maximum instances to import in this pass. */
  limit?: number
  /** Stop starting new downloads after this time (ms since epoch). */
  deadline?: number
}

export type AnalyticsImportStatus =
  | "demo_workspace"
  | "no_listing"
  | "not_connected"
  | "waiting_for_store"
  | "up_to_date"
  | "imported"
  | "partial"
  | "failed"

export interface AnalyticsImportSummary {
  status: AnalyticsImportStatus
  imported: number
  failed: number
  /** Instances still waiting after this pass. */
  remaining: number
  requestCreated: boolean
  message: string | null
}

const DEFAULT_LIMIT = 40

const summary = (
  status: AnalyticsImportStatus,
  extra: Partial<AnalyticsImportSummary> = {},
): AnalyticsImportSummary => ({
  status,
  imported: 0,
  failed: 0,
  remaining: 0,
  requestCreated: false,
  message: null,
  ...extra,
})

export async function importStoreAnalytics(
  db: AsoClient,
  deps: AnalyticsImportDeps,
  options: AnalyticsImportOptions,
): Promise<AnalyticsImportSummary> {
  const logger = (deps.logger ?? createLogger("analytics-import")).child(options.appId.slice(0, 8))

  const { data: app, error: appError } = await db
    .from("apps")
    .select("id, workspace:workspaces(is_demo)")
    .eq("id", options.appId)
    .single()
  if (appError) throw new Error(`Failed to load app: ${appError.message}`)
  if (app.workspace?.is_demo) return summary("demo_workspace")

  const { data: listing } = await db
    .from("store_listings")
    .select("external_app_id")
    .eq("app_id", options.appId)
    .eq("platform", "ios")
    .order("created_at")
    .limit(1)
    .maybeSingle()
  if (!listing) return summary("no_listing", { message: "Add an App Store listing first." })

  const provider = deps.getAnalyticsProvider("ios")
  if (!provider || provider.status().state !== "ready") {
    return summary("not_connected", { message: "App Store Connect not connected." })
  }
  const appleId = listing.external_app_id

  const reporting = await provider.ensureReporting(appleId)
  if (!reporting.ok) return summary("failed", { message: reporting.error.message })
  const { requestIds, created } = reporting.data

  const instances = await provider.listInstances(requestIds)
  if (!instances.ok) {
    return summary("failed", { message: instances.error.message, requestCreated: created })
  }
  if (instances.data.length === 0) {
    return summary("waiting_for_store", {
      requestCreated: created,
      message:
        "Apple hasn't delivered any reports yet. The first ones arrive 1–2 days after the request.",
    })
  }

  const { data: done, error: doneError } = await db
    .from("store_analytics_imports")
    .select("external_instance_id")
    .eq("app_id", options.appId)
    .eq("source", provider.id)
  if (doneError) throw new Error(`Failed to load imports: ${doneError.message}`)
  const imported = new Set(done.map((d) => d.external_instance_id))
  const pending = instances.data
    .filter((i) => !imported.has(i.externalId))
    .sort((a, b) => a.processingDate.localeCompare(b.processingDate))
  if (pending.length === 0) return summary("up_to_date", { requestCreated: created })

  const batch = pending.slice(0, options.limit ?? DEFAULT_LIMIT)
  const { data: run, error: runError } = await db
    .from("collector_runs")
    .insert({
      app_id: options.appId,
      job_type: "store_analytics",
      trigger: options.trigger,
      triggered_by: options.triggeredBy ?? null,
      items_total: batch.length,
    })
    .select("id")
    .single()
  if (runError) throw new Error(`Failed to start collector run: ${runError.message}`)

  let succeeded = 0
  let failed = 0
  let attempted = 0
  const errors: string[] = []
  for (const instance of batch) {
    if (options.deadline && Date.now() > options.deadline) break
    attempted++
    const result = await importInstance(db, provider, instance, appleId, options, run.id)
    if (result.ok) succeeded++
    else {
      failed++
      errors.push(result.message)
      logger.warn("instance_import_failed", { report: instance.report, code: result.code })
      if (result.code === "rate_limited") break
    }
  }

  const status: AnalyticsImportStatus =
    failed === 0 ? "imported" : succeeded > 0 ? "partial" : "failed"
  await db
    .from("collector_runs")
    .update({
      status: failed === 0 ? "succeeded" : succeeded > 0 ? "partial" : "failed",
      items_succeeded: succeeded,
      items_failed: failed,
      items_skipped: batch.length - attempted,
      error_summary: errors[0] ?? null,
      finished_at: new Date().toISOString(),
    })
    .eq("id", run.id)

  return summary(status, {
    imported: succeeded,
    failed,
    remaining: pending.length - succeeded,
    requestCreated: created,
    message: errors[0] ?? null,
  })
}

async function importInstance(
  db: AsoClient,
  provider: StoreAnalyticsProvider,
  instance: StoreAnalyticsInstance,
  appleId: string,
  options: AnalyticsImportOptions,
  runId: string,
): Promise<{ ok: true } | { ok: false; code: string; message: string }> {
  const data = await provider.getInstance(instance, appleId)
  if (!data.ok) return { ok: false, code: data.error.code, message: data.error.message }

  const { error } = await db.rpc("import_store_analytics_instance", {
    p_app_id: options.appId,
    p_platform: provider.platform,
    p_source: provider.id,
    p_report: instance.report,
    p_granularity: instance.granularity,
    p_processing_date: instance.processingDate,
    p_external_instance_id: instance.externalId,
    p_first_metric_date: data.data.firstDate ?? undefined,
    p_last_metric_date: data.data.lastDate ?? undefined,
    p_rows: data.data.rows.map((r) => ({
      metric_date: r.metricDate,
      territory: r.territory,
      source_type: r.sourceType,
      metric: r.metric,
      value: r.value,
    })),
    p_collector_run_id: runId,
    p_imported_by: options.triggeredBy ?? undefined,
  })
  if (error) return { ok: false, code: "database", message: "Couldn't save an analytics report." }
  return { ok: true }
}
