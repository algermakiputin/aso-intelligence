import { describe, expect, it } from "vitest"
import { type AnalyticsBreakdown, addDays, summarizeAnalytics } from "./model"

const ENG = "app_store_discovery_engagement"
const DL = "app_downloads"

/** Covered dates for both reports from `from` to `to`. */
function covered(from: string, to: string, reports = [ENG, DL]) {
  const out: AnalyticsBreakdown["covered"] = []
  for (let d = from; d <= to; d = addDays(d, 1))
    for (const report of reports) out.push({ report, date: d })
  return out
}

function breakdown(overrides: Partial<AnalyticsBreakdown> = {}): AnalyticsBreakdown {
  return {
    days: [],
    sources: [],
    territories: [],
    covered: [],
    reports: [
      {
        report: ENG,
        latestProcessingDate: "2026-10-06",
        lastImportedAt: "2026-10-06T08:00:00Z",
        imports: 3,
      },
      {
        report: DL,
        latestProcessingDate: "2026-10-06",
        lastImportedAt: "2026-10-06T08:00:00Z",
        imports: 3,
      },
    ],
    ...overrides,
  }
}

describe("summarizeAnalytics", () => {
  const range = { from: "2026-10-01", to: "2026-10-06" }

  it("keeps 'no events' (0) and 'no data' (null) apart", () => {
    const summary = summarizeAnalytics(
      breakdown({
        covered: covered("2026-10-03", "2026-10-05"),
        days: [{ date: "2026-10-03", metric: "impressions", value: 40 }],
      }),
      range,
    )
    const values = summary.metrics.impressions.series.map((p) => p.value)
    // Oct 1–2 not covered → null; Oct 3 = 40; Oct 4–5 covered without rows → 0; Oct 6 not covered.
    expect(values).toEqual([null, null, 40, 0, 0, null])
    expect(summary.metrics.impressions.total).toBe(40)
    expect(summary.metrics.impressions.coveredDays).toBe(3)
  })

  it("marks days Apple may still revise as provisional (3 days engagement, 2 downloads)", () => {
    const summary = summarizeAnalytics(
      breakdown({ covered: covered("2026-10-01", "2026-10-06") }),
      range,
    )
    const provisional = (metric: "impressions" | "first_time_downloads") =>
      summary.metrics[metric].series.filter((p) => p.provisional).map((p) => p.date)
    expect(provisional("impressions")).toEqual(["2026-10-04", "2026-10-05", "2026-10-06"])
    expect(provisional("first_time_downloads")).toEqual(["2026-10-05", "2026-10-06"])
  })

  it("compares equal windows of complete days only", () => {
    const days: AnalyticsBreakdown["days"] = []
    for (let d = "2026-09-25"; d <= "2026-10-06"; d = addDays(d, 1)) {
      days.push({ date: d, metric: "impressions", value: d >= "2026-10-01" ? 20 : 10 })
    }
    const summary = summarizeAnalytics(
      breakdown({ covered: covered("2026-09-25", "2026-10-06"), days }),
      range,
    )
    // Complete engagement days: Oct 1–3 (3 days) vs Sep 28–30.
    expect(summary.metrics.impressions.change).toEqual({ ratio: 1, days: 3 })
  })

  it("gives no change figure when the earlier window isn't fully covered", () => {
    const summary = summarizeAnalytics(
      breakdown({
        covered: covered("2026-09-29", "2026-10-06"),
        days: [{ date: "2026-10-01", metric: "impressions", value: 5 }],
      }),
      range,
    )
    expect(summary.metrics.impressions.change).toBeNull()
  })

  it("computes search share and ranks sources and territories", () => {
    const summary = summarizeAnalytics(
      breakdown({
        sources: [
          { key: "app_store_search", metric: "impressions", value: 75 },
          { key: "app_store_browse", metric: "impressions", value: 25 },
          { key: "app_store_search", metric: "first_time_downloads", value: 4 },
        ],
        territories: Array.from({ length: 12 }, (_, i) => ({
          key: `T${String.fromCharCode(65 + i)}`,
          metric: "impressions" as const,
          value: 100 - i,
        })),
      }),
      range,
    )
    expect(summary.searchShare).toBe(0.75)
    expect(summary.sources[0]).toMatchObject({
      label: "App Store search",
      impressions: 75,
      firstTimeDownloads: 4,
    })
    expect(summary.territories).toHaveLength(11)
    expect(summary.territories.at(-1)).toMatchObject({ key: "other", impressions: 90 + 89 })
  })

  it("has no data before the first import", () => {
    const summary = summarizeAnalytics({ ...breakdown(), reports: [] }, range)
    expect(summary.hasData).toBe(false)
    expect(summary.metrics.impressions.total).toBeNull()
    expect(summary.searchShare).toBeNull()
  })
})
