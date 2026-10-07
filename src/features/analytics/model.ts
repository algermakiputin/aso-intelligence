/**
 * Store analytics domain model. Pure: turns the database breakdown into what the
 * Analytics page shows.
 *
 * Rules:
 * - A date the store's report covers but has no rows for is 0 (no events). A date no
 *   imported report covers is null (no data). The two are never conflated.
 * - Apple's daily data is final only after a few days (3 for engagement, 2 for
 *   downloads). Later dates are marked provisional.
 * - Period-over-period change compares equal windows of complete, fully covered days
 *   only; otherwise there is no change figure rather than a misleading one.
 */

import { z } from "zod"
import { METRIC_REPORT, REPORT_COMPLETENESS_DAYS } from "@/lib/stores/apple/analytics-report-parser"
import { STORE_ANALYTICS_METRICS, type StoreAnalyticsMetric } from "@/lib/stores/types"

const DAY_MS = 86_400_000

const metricSchema = z.enum(STORE_ANALYTICS_METRICS)
const breakdownSchema = z.object({
  days: z.array(z.object({ date: z.string(), metric: metricSchema, value: z.number() })),
  sources: z.array(z.object({ key: z.string(), metric: metricSchema, value: z.number() })),
  territories: z.array(z.object({ key: z.string(), metric: metricSchema, value: z.number() })),
  covered: z.array(z.object({ report: z.string(), date: z.string() })),
  reports: z.array(
    z.object({
      report: z.string(),
      latestProcessingDate: z.string(),
      lastImportedAt: z.string(),
      imports: z.number(),
    }),
  ),
})
export type AnalyticsBreakdown = z.infer<typeof breakdownSchema>

export const EMPTY_BREAKDOWN: AnalyticsBreakdown = {
  days: [],
  sources: [],
  territories: [],
  covered: [],
  reports: [],
}

export function parseBreakdown(value: unknown): AnalyticsBreakdown {
  const parsed = breakdownSchema.safeParse(value)
  if (!parsed.success) throw new Error("Unexpected analytics breakdown shape")
  return parsed.data
}

export const METRIC_LABELS: Record<StoreAnalyticsMetric, string> = {
  impressions: "Impressions",
  product_page_views: "Product page views",
  first_time_downloads: "First-time downloads",
  redownloads: "Redownloads",
}

export const SOURCE_TYPE_LABELS: Record<string, string> = {
  app_store_search: "App Store search",
  app_store_browse: "App Store browse",
  app_referrer: "App referrer",
  web_referrer: "Web referrer",
  app_clip: "App Clip",
  notification: "Notification",
  institutional_purchase: "Institutional purchase",
  unavailable: "Unavailable",
}

export function sourceTypeLabel(key: string): string {
  return SOURCE_TYPE_LABELS[key] ?? key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1
}

function dateRange(from: string, to: string): string[] {
  const n = daysBetween(from, to)
  return n <= 0 ? [] : Array.from({ length: n }, (_, i) => addDays(from, i))
}

export interface MetricPoint {
  date: string
  /** null = no imported report covers this date. */
  value: number | null
  provisional: boolean
}

export interface MetricSummary {
  metric: StoreAnalyticsMetric
  label: string
  series: MetricPoint[]
  /** Sum over covered days in the range; null when no day in the range is covered. */
  total: number | null
  coveredDays: number
  provisionalDays: number
  /** Relative change over equal windows of complete days; null when not comparable. */
  change: { ratio: number; days: number } | null
}

export interface BreakdownRow {
  key: string
  label: string
  impressions: number
  productPageViews: number
  firstTimeDownloads: number
}

export interface AnalyticsSummary {
  from: string
  to: string
  metrics: Record<StoreAnalyticsMetric, MetricSummary>
  /** Share of impressions from App Store search; null without impressions. */
  searchShare: number | null
  sources: BreakdownRow[]
  /** Top territories by impressions, then "Other". */
  territories: BreakdownRow[]
  hasData: boolean
  lastImportedAt: string | null
  /** Most recent date with any covered data. */
  latestDate: string | null
}

const TOP_TERRITORIES = 10

function breakdownRows(
  rows: Array<{ key: string; metric: StoreAnalyticsMetric; value: number }>,
  label: (key: string) => string,
): BreakdownRow[] {
  const byKey = new Map<string, BreakdownRow>()
  for (const r of rows) {
    const row =
      byKey.get(r.key) ??
      byKey
        .set(r.key, {
          key: r.key,
          label: label(r.key),
          impressions: 0,
          productPageViews: 0,
          firstTimeDownloads: 0,
        })
        .get(r.key)!
    if (r.metric === "impressions") row.impressions += r.value
    else if (r.metric === "product_page_views") row.productPageViews += r.value
    else if (r.metric === "first_time_downloads") row.firstTimeDownloads += r.value
  }
  return [...byKey.values()].sort(
    (a, b) =>
      b.impressions - a.impressions ||
      b.firstTimeDownloads - a.firstTimeDownloads ||
      a.label.localeCompare(b.label),
  )
}

export function summarizeAnalytics(
  breakdown: AnalyticsBreakdown,
  range: { from: string; to: string },
  territoryLabel: (key: string) => string = (key) => key,
): AnalyticsSummary {
  const covered = new Map<string, Set<string>>()
  for (const c of breakdown.covered) {
    const set = covered.get(c.report) ?? covered.set(c.report, new Set()).get(c.report)!
    set.add(c.date)
  }
  const latestProcessing = new Map(breakdown.reports.map((r) => [r.report, r.latestProcessingDate]))
  const values = new Map<string, number>()
  for (const d of breakdown.days)
    values.set(`${d.metric}|${d.date}`, (values.get(`${d.metric}|${d.date}`) ?? 0) + d.value)

  const valueOn = (metric: StoreAnalyticsMetric, date: string): number | null =>
    covered.get(METRIC_REPORT[metric])?.has(date) ? (values.get(`${metric}|${date}`) ?? 0) : null

  const days = dateRange(range.from, range.to)
  const metrics = Object.fromEntries(
    STORE_ANALYTICS_METRICS.map((metric) => {
      const report = METRIC_REPORT[metric]
      const processing = latestProcessing.get(report) ?? null
      const lastComplete = processing
        ? addDays(processing, -REPORT_COMPLETENESS_DAYS[report])
        : null
      const series: MetricPoint[] = days.map((date) => ({
        date,
        value: valueOn(metric, date),
        provisional: lastComplete !== null && date > lastComplete,
      }))
      const coveredPoints = series.filter((p) => p.value !== null)

      let change: MetricSummary["change"] = null
      if (lastComplete) {
        const end = lastComplete < range.to ? lastComplete : range.to
        const length = daysBetween(range.from, end)
        if (length > 0) {
          const current = dateRange(range.from, end).map((d) => valueOn(metric, d))
          const previous = dateRange(addDays(range.from, -length), addDays(range.from, -1)).map(
            (d) => valueOn(metric, d),
          )
          if (current.every((v) => v !== null) && previous.every((v) => v !== null)) {
            const sum = (vs: Array<number | null>) => vs.reduce<number>((s, v) => s + (v ?? 0), 0)
            const prev = sum(previous)
            if (prev > 0) change = { ratio: (sum(current) - prev) / prev, days: length }
          }
        }
      }

      return [
        metric,
        {
          metric,
          label: METRIC_LABELS[metric],
          series,
          total: coveredPoints.length > 0 ? coveredPoints.reduce((s, p) => s + p.value!, 0) : null,
          coveredDays: coveredPoints.length,
          provisionalDays: coveredPoints.filter((p) => p.provisional).length,
          change,
        } satisfies MetricSummary,
      ]
    }),
  ) as Record<StoreAnalyticsMetric, MetricSummary>

  const sources = breakdownRows(breakdown.sources, sourceTypeLabel)
  const totalImpressions = sources.reduce((s, r) => s + r.impressions, 0)
  const searchImpressions = sources.find((r) => r.key === "app_store_search")?.impressions ?? 0

  const allTerritories = breakdownRows(breakdown.territories, territoryLabel)
  const territories = allTerritories.slice(0, TOP_TERRITORIES)
  const rest = allTerritories.slice(TOP_TERRITORIES)
  if (rest.length > 0) {
    territories.push({
      key: "other",
      label: `Other (${rest.length})`,
      impressions: rest.reduce((s, r) => s + r.impressions, 0),
      productPageViews: rest.reduce((s, r) => s + r.productPageViews, 0),
      firstTimeDownloads: rest.reduce((s, r) => s + r.firstTimeDownloads, 0),
    })
  }

  const coveredDates = [...covered.values()].flatMap((s) => [...s]).filter((d) => d <= range.to)
  const lastImportedAt = breakdown.reports.reduce<string | null>(
    (latest, r) => (latest === null || r.lastImportedAt > latest ? r.lastImportedAt : latest),
    null,
  )

  return {
    from: range.from,
    to: range.to,
    metrics,
    searchShare: totalImpressions > 0 ? searchImpressions / totalImpressions : null,
    sources,
    territories,
    hasData: breakdown.reports.length > 0,
    lastImportedAt,
    latestDate: coveredDates.length > 0 ? coveredDates.sort().at(-1)! : null,
  }
}
