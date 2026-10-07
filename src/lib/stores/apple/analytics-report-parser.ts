/**
 * Parses App Store Connect Analytics Reports files and aggregates them into the additive
 * daily metrics we store. Pure: no I/O.
 *
 * Reports (field definitions: developer.apple.com/documentation/analytics-reports):
 * - "App Store Discovery and Engagement Standard": Event × Page Type × Source Type ×
 *   Territory × … with Counts. Impressions = Event "Impression"; product page views =
 *   Event "Page view" on Page Type "Product page".
 * - "App Downloads Standard": Download Type × Source Type × Territory × … with Counts.
 *   First-time downloads and redownloads (updates and restores are ignored).
 *
 * Only "Counts" is used. "Unique Counts" can't be summed across rows without double
 * counting users, so it is never aggregated. The file format isn't documented beyond the
 * fields, so the delimiter (tab or comma) and quoting are detected, and any missing
 * column or malformed value fails the whole file instead of storing a guess.
 */

import type { StoreAnalyticsInstanceData, StoreAnalyticsMetric, StoreAnalyticsRow } from "../types"

export const ENGAGEMENT_REPORT = "app_store_discovery_engagement"
export const DOWNLOADS_REPORT = "app_downloads"
export type AppStoreAnalyticsReport = typeof ENGAGEMENT_REPORT | typeof DOWNLOADS_REPORT

/** Apple report names (Standard level) → our report keys. */
export const APPLE_REPORT_NAMES: Record<AppStoreAnalyticsReport, string> = {
  [ENGAGEMENT_REPORT]: "App Store Discovery and Engagement Standard",
  [DOWNLOADS_REPORT]: "App Downloads Standard",
}

/** Days until Apple's daily data for a report is complete (per Apple's report docs). */
export const REPORT_COMPLETENESS_DAYS: Record<AppStoreAnalyticsReport, number> = {
  [ENGAGEMENT_REPORT]: 3,
  [DOWNLOADS_REPORT]: 2,
}

export const METRIC_REPORT: Record<StoreAnalyticsMetric, AppStoreAnalyticsReport> = {
  impressions: ENGAGEMENT_REPORT,
  product_page_views: ENGAGEMENT_REPORT,
  first_time_downloads: DOWNLOADS_REPORT,
  redownloads: DOWNLOADS_REPORT,
}

const REQUIRED_COLUMNS: Record<AppStoreAnalyticsReport, string[]> = {
  [ENGAGEMENT_REPORT]: ["Date", "Event", "Page Type", "Source Type", "Territory", "Counts"],
  [DOWNLOADS_REPORT]: ["Date", "Download Type", "Source Type", "Territory", "Counts"],
}

export type ParseResult<T> = { ok: true; data: T } | { ok: false; message: string }

/** Minimal RFC 4180-style parser; the delimiter is detected from the header line. */
export function parseDelimited(text: string): string[][] {
  const body = text.replace(/^﻿/, "")
  const firstLine = body.slice(0, body.search(/\r?\n|$/))
  const delimiter = firstLine.includes("\t") ? "\t" : ","
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let quoted = false

  for (let i = 0; i < body.length; i++) {
    const ch = body[i]!
    if (quoted) {
      if (ch === '"') {
        if (body[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += ch
      continue
    }
    if (ch === '"' && field === "") quoted = true
    else if (ch === delimiter) {
      row.push(field)
      field = ""
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && body[i + 1] === "\n") i++
      row.push(field)
      if (row.some((v) => v !== "")) rows.push(row)
      row = []
      field = ""
    } else field += ch
  }
  row.push(field)
  if (row.some((v) => v !== "")) rows.push(row)
  return rows
}

const norm = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, " ")

/** "App Store search" → "app_store_search". Empty → "unavailable". */
export function sourceTypeKey(value: string): string {
  const key = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
  return key || "unavailable"
}

function metricForRecord(
  report: AppStoreAnalyticsReport,
  get: (column: string) => string,
): StoreAnalyticsMetric | null {
  if (report === ENGAGEMENT_REPORT) {
    const event = norm(get("Event"))
    if (event === "impression" || event === "impressions") return "impressions"
    if (
      (event === "page view" || event === "page views") &&
      norm(get("Page Type")) === "product page"
    )
      return "product_page_views"
    return null
  }
  const type = norm(get("Download Type"))
  if (type === "first time download" || type === "first time downloads")
    return "first_time_downloads"
  if (type === "redownload" || type === "redownloads") return "redownloads"
  return null
}

/** Aggregates one instance (all of its segment files) into additive daily rows. */
export function aggregateReportFiles(
  report: AppStoreAnalyticsReport,
  files: string[],
  appAppleId: string,
): ParseResult<StoreAnalyticsInstanceData> {
  const totals = new Map<string, StoreAnalyticsRow>()
  let firstDate = null as string | null
  let lastDate = null as string | null

  for (const [fileIndex, text] of files.entries()) {
    const [header, ...records] = parseDelimited(text)
    if (!header) {
      if (text.trim() === "") continue
      return { ok: false, message: `Report file ${fileIndex + 1} has no header row` }
    }
    const columns = new Map(header.map((name, i) => [name.trim().toLowerCase(), i]))
    const missing = REQUIRED_COLUMNS[report].filter((c) => !columns.has(c.toLowerCase()))
    if (missing.length > 0) {
      return { ok: false, message: `Report file is missing columns: ${missing.join(", ")}` }
    }
    const appColumn = columns.get("app apple identifier")

    for (const [line, record] of records.entries()) {
      const get = (column: string) => record[columns.get(column.toLowerCase())!] ?? ""
      if (appColumn !== undefined && record[appColumn] && record[appColumn]!.trim() !== appAppleId)
        continue

      const date = get("Date").trim()
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return { ok: false, message: `Unexpected date on line ${line + 2}` }
      }
      if (firstDate === null || date < firstDate) firstDate = date
      if (lastDate === null || date > lastDate) lastDate = date

      const metric = metricForRecord(report, get)
      if (!metric) continue
      const countText = get("Counts").trim()
      if (!/^\d+$/.test(countText)) {
        return { ok: false, message: `Unexpected count on line ${line + 2}` }
      }
      const territory = get("Territory").trim() || "unknown"
      const sourceType = sourceTypeKey(get("Source Type"))
      const key = `${date}|${territory}|${sourceType}|${metric}`
      const existing = totals.get(key)
      const value = Number(countText)
      if (existing) existing.value += value
      else totals.set(key, { metricDate: date, territory, sourceType, metric, value })
    }
  }

  return { ok: true, data: { rows: [...totals.values()], firstDate, lastDate } }
}
