import { BarChart3, CloudOff, Hourglass } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { MetricTrendChart } from "@/components/charts/metric-trend-chart"
import { EmptyState, WaitingForData } from "@/components/dashboard/empty-state"
import { PageContainer, PageHeader, Panel } from "@/components/dashboard/panel"
import { Stat, StatStrip } from "@/components/dashboard/stat-strip"
import { ImportAnalyticsButton } from "@/features/analytics/components/import-analytics-button"
import { getAnalyticsBreakdown } from "@/features/analytics/data"
import {
  addDays,
  type BreakdownRow,
  EMPTY_BREAKDOWN,
  type MetricSummary,
  summarizeAnalytics,
} from "@/features/analytics/model"
import { listEvents } from "@/features/experiments/data"
import { listListings } from "@/features/listings/data"
import { requireActiveApp } from "@/features/workspaces/context"
import { getSourceInfo } from "@/lib/aso/sources"
import { formatCompact, formatDate, formatDateTime, formatNumber } from "@/lib/format"
import { ASC_ANALYTICS_SOURCE } from "@/lib/stores/apple/app-store-connect-analytics-provider"
import { getAnalyticsProvider } from "@/lib/stores/registry"
import { cn } from "@/lib/utils"
import { countryName } from "@/lib/validation/locales"

export const metadata: Metadata = { title: "Analytics" }
// The manual import runs as a Server Action from this page.
export const maxDuration = 60

const RANGES = [
  { key: "28d", label: "28D", days: 28 },
  { key: "90d", label: "90D", days: 90 },
  { key: "180d", label: "180D", days: 180 },
] as const
type RangeKey = (typeof RANGES)[number]["key"]

const TREND_METRICS = ["impressions", "product_page_views", "first_time_downloads"] as const

function territoryLabel(key: string): string {
  return /^[A-Z]{2}$/.test(key) ? countryName(key) : key
}

function ChangeText({ change }: { change: MetricSummary["change"] }) {
  if (!change) return <>No comparable earlier period</>
  const pct = Math.round(change.ratio * 100)
  return (
    <span className="tabular">
      {pct > 0 ? "+" : pct < 0 ? "−" : ""}
      {Math.abs(pct)}% vs. previous {change.days} complete days
    </span>
  )
}

export default async function AnalyticsPage(props: PageProps<"/dashboard/analytics">) {
  const searchParams = await props.searchParams
  const rangeKey: RangeKey = RANGES.some((r) => r.key === searchParams.range)
    ? (searchParams.range as RangeKey)
    : "28d"
  const range = RANGES.find((r) => r.key === rangeKey)!

  const ctx = await requireActiveApp()
  const provider = getAnalyticsProvider("ios")
  const connected = provider?.status().state === "ready"
  const listings = await listListings(ctx.db, ctx.activeApp.id)
  const iosListing = listings.find((l) => l.platform === "ios") ?? null
  const hasAndroid = listings.some((l) => l.platform === "android")

  // Apple's daily data never includes today; the latest possible day is yesterday (UTC).
  const to = addDays(new Date().toISOString().slice(0, 10), -1)
  const from = addDays(to, -(range.days - 1))
  const [breakdown, events] = await Promise.all([
    ctx.isDemo || !iosListing
      ? EMPTY_BREAKDOWN
      : getAnalyticsBreakdown(ctx.db, ctx.activeApp.id, ASC_ANALYTICS_SOURCE, {
          from,
          to,
          seriesFrom: addDays(from, -range.days),
        }),
    listEvents(ctx.db, ctx.activeApp.id, { since: new Date(`${from}T00:00:00Z`), limit: 200 }),
  ])
  const summary = summarizeAnalytics(breakdown, { from, to }, territoryLabel)
  const chartEvents = events
    .filter((e) => e.platform === null || e.platform === "ios")
    .map((e) => ({ id: e.id, title: e.title, happenedAt: e.happenedAt }))
  const canImport = ctx.canEdit && !ctx.isDemo && connected && Boolean(iosListing)

  const header = (
    <PageHeader
      title="Analytics"
      description="Official App Store numbers from App Store Connect: how often the app is shown, how often its product page is viewed, and how often it's downloaded."
      actions={
        <>
          {summary.hasData ? (
            <nav aria-label="Range" className="flex rounded-md border p-0.5">
              {RANGES.map((r) => (
                <Link
                  key={r.key}
                  href={`?range=${r.key}`}
                  scroll={false}
                  aria-current={r.key === rangeKey ? "page" : undefined}
                  className={cn(
                    "rounded-sm px-2 py-0.5 text-xs text-muted-foreground tabular hover:text-foreground",
                    r.key === rangeKey && "bg-muted font-medium text-foreground",
                  )}
                >
                  {r.label}
                </Link>
              ))}
            </nav>
          ) : null}
          {canImport && summary.hasData ? <ImportAnalyticsButton /> : null}
        </>
      }
    />
  )

  if (ctx.isDemo) {
    return (
      <PageContainer>
        {header}
        <Panel>
          <EmptyState
            icon={BarChart3}
            title="No analytics in the demo"
            description="Analytics come only from App Store Connect for a real app. The demo workspace has no synthetic analytics."
          />
        </Panel>
      </PageContainer>
    )
  }

  if (!connected || !iosListing) {
    return (
      <PageContainer>
        {header}
        <Panel>
          <EmptyState
            icon={CloudOff}
            title={!iosListing ? "No App Store listing" : "App Store Connect not connected"}
            description={
              !iosListing ? (
                "Analytics are imported for the app's App Store listing. Add one in Settings."
              ) : (
                <>
                  Set <code>APPLE_CONNECT_ISSUER_ID</code>, <code>APPLE_CONNECT_KEY_ID</code> and{" "}
                  <code>APPLE_CONNECT_PRIVATE_KEY</code> (an App Store Connect API team key). The
                  key needs the Admin role once, to start Apple&apos;s reports.
                </>
              )
            }
          />
        </Panel>
      </PageContainer>
    )
  }

  if (!summary.hasData) {
    return (
      <PageContainer>
        {header}
        <Panel>
          <EmptyState
            icon={Hourglass}
            title="Waiting for Apple's first reports"
            description="Apple generates the first analytics reports 1–2 days after they're requested, then a new one every day. Imports also run with the daily scheduled job."
          >
            {canImport ? <ImportAnalyticsButton variant="default" /> : null}
          </EmptyState>
        </Panel>
      </PageContainer>
    )
  }

  const m = summary.metrics
  const source = getSourceInfo(ASC_ANALYTICS_SOURCE)

  return (
    <PageContainer>
      {header}

      <StatStrip className="xl:grid-cols-4">
        {TREND_METRICS.map((key) => (
          <Stat
            key={key}
            label={m[key].label}
            value={m[key].total === null ? <WaitingForData /> : formatCompact(m[key].total!)}
            detail={<ChangeText change={m[key].change} />}
            hint={`${source.label}. Sum of daily counts in the selected range.`}
          />
        ))}
        <Stat
          label="From App Store search"
          value={
            summary.searchShare === null ? (
              <WaitingForData />
            ) : (
              `${Math.round(summary.searchShare * 100)}%`
            )
          }
          detail="Share of impressions"
          hint="Impressions whose source is App Store search (includes Apple Ads results)."
        />
      </StatStrip>

      <Panel
        title="Daily trend"
        description={`${formatDate(`${from}T00:00:00Z`)} – ${formatDate(`${to}T00:00:00Z`)}. Apple revises the last few days, shaded “Not final”. ◆ marks a recorded ASO change.`}
        bodyClassName="grid gap-6 p-4 lg:grid-cols-3"
      >
        {TREND_METRICS.map((key) => (
          <div key={key} className="min-w-0 space-y-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-xs font-medium">{m[key].label}</h3>
              <span className="text-xs text-muted-foreground tabular">
                {m[key].total === null ? "No data" : formatNumber(m[key].total!)}
              </span>
            </div>
            <MetricTrendChart label={m[key].label} points={m[key].series} events={chartEvents} />
          </div>
        ))}
        <details className="text-xs lg:col-span-3">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            Daily values
          </summary>
          <div className="relative mt-2 max-h-80 overflow-auto rounded-md border">
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="h-8 px-3 font-medium">Date</th>
                  {TREND_METRICS.map((key) => (
                    <th key={key} className="h-8 px-3 text-right font-medium">
                      {m[key].label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...m.impressions.series].reverse().map((point, i, arr) => {
                  const index = arr.length - 1 - i
                  return (
                    <tr key={point.date} className="border-b last:border-b-0">
                      <td className="h-8 px-3 tabular">
                        {formatDate(`${point.date}T00:00:00Z`)}
                        {TREND_METRICS.some((k) => m[k].series[index]?.provisional) ? (
                          <span className="ml-1.5 text-muted-foreground">not final</span>
                        ) : null}
                      </td>
                      {TREND_METRICS.map((key) => {
                        const value = m[key].series[index]?.value ?? null
                        return (
                          <td key={key} className="h-8 px-3 text-right tabular">
                            {value === null ? (
                              <span className="text-muted-foreground">—</span>
                            ) : (
                              formatNumber(value)
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </details>
      </Panel>

      <div className="grid gap-5 xl:grid-cols-2">
        <BreakdownPanel
          title="By source"
          description="Where people found the app, in the selected range"
          rows={summary.sources}
          firstColumn="Source"
        />
        <BreakdownPanel
          title="Top countries and regions"
          description="App Store storefronts, in the selected range"
          rows={summary.territories}
          firstColumn="Storefront"
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Source: {source.label} (official). Counts are event totals, not unique people.
        {summary.lastImportedAt
          ? ` Last imported ${formatDateTime(summary.lastImportedAt)}.`
          : ""}{" "}
        {hasAndroid ? "Google Play analytics aren't imported yet." : null}
      </p>
    </PageContainer>
  )
}

function BreakdownPanel({
  title,
  description,
  rows,
  firstColumn,
}: {
  title: string
  description: string
  rows: BreakdownRow[]
  firstColumn: string
}) {
  const max = Math.max(1, ...rows.map((r) => r.impressions))
  return (
    // min-w-0 lets the table scroll inside the panel instead of widening the grid column.
    <Panel title={title} description={description} className="min-w-0">
      {rows.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">No data in this range.</p>
      ) : (
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[480px] text-[13px]">
            <thead>
              <tr className="border-b text-xs whitespace-nowrap text-muted-foreground">
                <th className="h-8 px-4 text-left font-medium">{firstColumn}</th>
                <th className="h-8 px-4 text-left font-medium">Impressions</th>
                <th className="h-8 px-4 text-right font-medium">Page views</th>
                <th className="h-8 px-4 text-right font-medium">First-time downloads</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-b last:border-b-0">
                  <td className="h-9 px-4 whitespace-nowrap">{r.label}</td>
                  <td className="h-9 px-4">
                    <span className="flex items-center gap-2">
                      <span
                        className="h-2 rounded-r-[4px] bg-data"
                        style={{ width: `${Math.max(2, (r.impressions / max) * 96)}px` }}
                        aria-hidden
                      />
                      <span className="tabular">{formatNumber(r.impressions)}</span>
                    </span>
                  </td>
                  <td className="h-9 px-4 text-right tabular">
                    {formatNumber(r.productPageViews)}
                  </td>
                  <td className="h-9 px-4 text-right tabular">
                    {formatNumber(r.firstTimeDownloads)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
}
