import { Check, CircleDashed, Minus, X } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import {
  DifficultyValue,
  EstimatedRank,
  OpportunityValue,
  PlatformLabel,
  PopularityValue,
  RankChangeIndicator,
  RankText,
  RelativeTime,
  RelevanceValue,
} from "@/components/aso/metrics"
import { PopularityChart } from "@/components/charts/popularity-chart"
import { RankHistoryChart } from "@/components/charts/rank-history-chart"
import { EmptyState, WaitingForData } from "@/components/dashboard/empty-state"
import { PageContainer, PageHeader, Panel } from "@/components/dashboard/panel"
import { Stat, StatStrip } from "@/components/dashboard/stat-strip"
import { EventItem } from "@/features/experiments/components/event-item"
import { listEvents } from "@/features/experiments/data"
import { eventsForStorefront } from "@/features/experiments/model"
import { KeywordActions } from "@/features/keywords/components/keyword-actions"
import {
  getKeyword,
  getLatestDifficulty,
  getPopularityHistory,
  getRankHistory,
} from "@/features/keywords/data"
import { listListings } from "@/features/listings/data"
import { listingMetadata, selectListing } from "@/features/listings/model"
import { ManualPopularityForm } from "@/features/popularity/components/manual-popularity-form"
import { requireActiveApp } from "@/features/workspaces/context"
import {
  analyzeKeywordCoverage,
  describeCoverageSummary,
  type FieldMatch,
} from "@/lib/aso/coverage"
import { computeRankChange, describeRankChange } from "@/lib/aso/rank"
import { describeMissingInputs } from "@/lib/aso/scoring/opportunity"
import { getSourceInfo } from "@/lib/aso/sources"
import { formatCompact, formatDate, formatDateTime, toDateInputValue } from "@/lib/format"
import { getPopularityProvider } from "@/lib/stores/registry"
import { cn } from "@/lib/utils"
import { countryName, languageName } from "@/lib/validation/locales"

export const maxDuration = 60

const RANGES = [
  { key: "7d", label: "7D", days: 7 },
  { key: "30d", label: "30D", days: 30 },
  { key: "90d", label: "90D", days: 90 },
  { key: "all", label: "All", days: null },
] as const
type RangeKey = (typeof RANGES)[number]["key"]

export async function generateMetadata(
  props: PageProps<"/dashboard/keywords/[keywordId]">,
): Promise<Metadata> {
  const { keywordId } = await props.params
  const ctx = await requireActiveApp()
  const keyword = await getKeyword(ctx.db, ctx.activeApp.id, keywordId)
  return { title: keyword ? `“${keyword.keyword}”` : "Keyword" }
}

export default async function KeywordDetailPage(
  props: PageProps<"/dashboard/keywords/[keywordId]">,
) {
  const [{ keywordId }, searchParams] = await Promise.all([props.params, props.searchParams])
  const rangeKey: RangeKey = RANGES.some((r) => r.key === searchParams.range)
    ? (searchParams.range as RangeKey)
    : "30d"
  const range = RANGES.find((r) => r.key === rangeKey)!

  const ctx = await requireActiveApp()
  const keyword = await getKeyword(ctx.db, ctx.activeApp.id, keywordId)
  if (!keyword) notFound()

  const nowDate = new Date()
  const now = nowDate.toISOString()
  const since = range.days === null ? null : new Date(nowDate.getTime() - range.days * 86_400_000)

  const [history, popularity, difficulty, listings, events] = await Promise.all([
    getRankHistory(ctx.db, keyword.id, since),
    getPopularityHistory(ctx.db, keyword.id),
    getLatestDifficulty(ctx.db, keyword.id),
    listListings(ctx.db, ctx.activeApp.id),
    listEvents(ctx.db, ctx.activeApp.id, { limit: 200 }),
  ])

  const popularityConnected = getPopularityProvider(keyword.platform)?.status().state === "ready"
  const relatedEvents = eventsForStorefront(events, keyword)
  const listingMatch = selectListing(listings, keyword)
  const coverage = analyzeKeywordCoverage(
    keyword.keyword,
    listingMetadata(listingMatch?.listing ?? null),
    keyword.platform,
  )
  const rangeChange =
    history.length >= 2
      ? computeRankChange(history[0]!.value, history[history.length - 1]!.value)
      : null
  const movement = history.slice(-12).map((point, i, arr) => ({
    ...point,
    change: i === 0 ? null : computeRankChange(arr[i - 1]!.value, point.value),
  }))
  const latestSource = keyword.latestRank ? getSourceInfo(keyword.latestRank.source) : null

  return (
    <PageContainer>
      <PageHeader
        eyebrow={
          <Link href="/dashboard/keywords" className="hover:text-foreground">
            Keywords
          </Link>
        }
        title={keyword.keyword}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <PlatformLabel platform={keyword.platform} />
            <span>
              {countryName(keyword.country)} storefront, {languageName(keyword.language)}
            </span>
            {!keyword.tracked ? (
              <span className="rounded-sm border px-1.5 text-xs">Tracking paused</span>
            ) : null}
            {keyword.isPriority ? (
              <span className="rounded-sm border px-1.5 text-xs">Priority</span>
            ) : null}
          </span>
        }
        actions={ctx.canEdit ? <KeywordActions keyword={keyword} canCheck={!ctx.isDemo} /> : null}
      />

      <StatStrip>
        <Stat
          label={latestSource?.official ? "Rank" : "Estimated Rank"}
          value={
            keyword.latestRank ? (
              <EstimatedRank observation={keyword.latestRank} now={now} />
            ) : (
              <WaitingForData label="Not checked" />
            )
          }
          detail={
            keyword.latestRank ? (
              <RelativeTime value={keyword.latestRank.checkedAt} now={now} />
            ) : (
              "Use Check rank now"
            )
          }
        />
        <Stat
          label="Change vs. previous check"
          value={
            keyword.change.kind === "no_baseline" ? (
              <WaitingForData />
            ) : (
              <RankChangeIndicator change={keyword.change} />
            )
          }
          detail={
            keyword.change.kind === "no_baseline"
              ? "Needs two checks"
              : describeRankChange(keyword.change)
          }
        />
        <Stat
          label="Popularity"
          value={
            keyword.popularity ? (
              <PopularityValue
                popularity={keyword.popularity}
                connected={popularityConnected}
                now={now}
              />
            ) : (
              <WaitingForData label={popularityConnected ? "Waiting for data" : "Not connected"} />
            )
          }
          detail={
            keyword.popularity
              ? getSourceInfo(keyword.popularity.source).label
              : popularityConnected
                ? "No data yet"
                : "Apple Ads not connected"
          }
        />
        <Stat
          label="Difficulty"
          value={<DifficultyValue difficulty={keyword.difficulty} />}
          detail={keyword.difficulty ? "Estimated from top results" : "After the first check"}
        />
        <Stat
          label="Relevance"
          value={
            keyword.relevance === null ? (
              <WaitingForData label="Not set" />
            ) : (
              <RelevanceValue relevance={keyword.relevance} />
            )
          }
          detail={keyword.relevance === null ? "Set it with Edit" : "Your assessment"}
        />
        <Stat
          label="Opportunity Score"
          value={<OpportunityValue opportunity={keyword.opportunity} showBar={false} />}
          detail={
            keyword.opportunity.status === "complete"
              ? "All inputs available"
              : keyword.opportunity.status === "partial"
                ? describeMissingInputs(keyword.opportunity.missing)
                : keyword.opportunity.missing.includes("relevance")
                  ? "Set relevance first"
                  : "Not enough data"
          }
        />
      </StatStrip>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          <Panel
            title="Estimated rank history"
            description={
              rangeChange
                ? `${range.key === "all" ? "All time" : `Last ${range.days} days`}: ${describeRankChange(rangeChange).toLowerCase()}`
                : "Lower is better. Position 1 is the top search result."
            }
            action={
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
            }
            bodyClassName="p-4"
          >
            {history.length === 0 ? (
              <EmptyState
                title={keyword.latestRank ? "No checks in this range" : "Waiting for data"}
                description={
                  keyword.latestRank
                    ? "Pick a longer range to see earlier observations."
                    : "Every rank check adds a point here; nothing is ever overwritten. Check the rank now, or wait for the scheduled job."
                }
                className="py-12"
              />
            ) : (
              <>
                <RankHistoryChart
                  points={history}
                  events={relatedEvents.map((e) => ({
                    id: e.id,
                    title: e.title,
                    happenedAt: e.happenedAt,
                  }))}
                  rangeStart={since?.toISOString() ?? null}
                  rangeEnd={now}
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  {history.length} {history.length === 1 ? "observation" : "observations"}. ◆ marks
                  a recorded ASO change. “Not ranked” means the app wasn&apos;t among the results
                  Apple returned; it isn&apos;t plotted as a rank. Positions beyond about 100
                  fluctuate between checks.
                </p>
              </>
            )}
          </Panel>

          <Panel
            title="Popularity history"
            description="Apple's relative popularity score (1–100). Not search volume."
            bodyClassName="p-4 space-y-4"
          >
            {popularity.length > 0 ? (
              <PopularityChart points={popularity} />
            ) : (
              <p className="text-sm text-muted-foreground">
                {popularityConnected
                  ? "No popularity recorded for this keyword yet."
                  : "Apple keyword popularity not connected."}{" "}
                {ctx.canEdit
                  ? "You can record a value from the Apple Ads dashboard below; it will be labelled as a manual entry."
                  : null}
              </p>
            )}
            {ctx.canEdit && !ctx.isDemo ? (
              <ManualPopularityForm keywordId={keyword.id} today={toDateInputValue(nowDate)} />
            ) : null}
          </Panel>

          <Panel title="Recent movement" description="Each check compared with the one before it.">
            {movement.length === 0 ? (
              <EmptyState
                title="Waiting for data"
                description="Movement appears after the first rank checks."
                className="py-8"
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="h-8 px-4 font-medium">Checked</th>
                      <th className="h-8 px-4 text-right font-medium">Estimated Rank</th>
                      <th className="h-8 px-4 text-right font-medium">Change</th>
                      <th className="h-8 px-4 font-medium">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...movement].reverse().map((m) => (
                      <tr key={m.checkedAt} className="border-b last:border-b-0">
                        <td className="h-9 px-4 tabular">{formatDateTime(m.checkedAt)}</td>
                        <td className="h-9 px-4 text-right font-medium">
                          <RankText value={m.value} />
                        </td>
                        <td className="h-9 px-4 text-right">
                          {m.change ? (
                            <RankChangeIndicator change={m.change} />
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="h-9 px-4 text-muted-foreground">
                          {getSourceInfo(m.source).label}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <Panel
            title="Opportunity Score"
            description="This tool's own heuristic, not an industry standard."
            bodyClassName="p-4"
          >
            <table className="w-full text-[13px] tabular">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="pb-2 font-medium">Input</th>
                  <th className="pb-2 text-right font-medium">Value</th>
                  <th className="pb-2 text-right font-medium">Weight</th>
                  <th className="pb-2 text-right font-medium">Points</th>
                </tr>
              </thead>
              <tbody>
                {keyword.opportunity.components.map((c) => (
                  <tr
                    key={c.key}
                    className={cn("border-t", c.value === null && "text-muted-foreground")}
                  >
                    <td className="py-1.5">{c.label}</td>
                    <td className="py-1.5 text-right">
                      {c.value === null ? "missing" : c.value.toFixed(2)}
                    </td>
                    <td className="py-1.5 text-right">{Math.round(c.weight * 100)}%</td>
                    <td className="py-1.5 text-right">
                      {c.points === null ? "—" : c.points.toFixed(1)}
                    </td>
                  </tr>
                ))}
                <tr className="border-t font-medium">
                  <td className="py-1.5">Score</td>
                  <td />
                  <td />
                  <td className="py-1.5 text-right">{keyword.opportunity.score ?? "—"}</td>
                </tr>
              </tbody>
            </table>
            <p className="mt-3 text-xs text-muted-foreground">
              Inputs are normalized to 0–1, weighted and scaled to 100.
              {keyword.opportunity.status === "partial"
                ? " Missing inputs are excluded and the remaining weights renormalized, so this score is partial."
                : null}{" "}
              <Link
                href="/dashboard/settings#scoring"
                className="underline-offset-2 hover:underline"
              >
                How it works
              </Link>
            </p>
          </Panel>

          <Panel
            title="Metadata coverage"
            description={describeCoverageSummary(coverage.summary)}
            bodyClassName="p-4 space-y-3"
          >
            {!listingMatch ? (
              <p className="text-sm text-muted-foreground">
                No {keyword.platform === "ios" ? "App Store" : "Google Play"} listing for this app
                yet.
              </p>
            ) : (
              <>
                <ul className="space-y-2">
                  {coverage.fields.map((f) => (
                    <li key={f.field} className="flex items-start gap-2.5 text-[13px]">
                      <CoverageIcon match={f.match} />
                      <div className="min-w-0">
                        <span className="font-medium">{f.label}</span>{" "}
                        <span className="text-muted-foreground">
                          {coverageText(f.match, f.missingTerms, f.variantTerms)}
                        </span>
                      </div>
                    </li>
                  ))}
                  {coverage.combined ? (
                    <li className="flex items-start gap-2.5 border-t pt-2 text-[13px]">
                      <CoverageIcon
                        match={
                          coverage.combined.match === "all_terms"
                            ? "all_terms"
                            : coverage.combined.match
                        }
                      />
                      <div>
                        <span className="font-medium">Title + subtitle + keyword field</span>{" "}
                        <span className="text-muted-foreground">
                          {coverage.combined.match === "all_terms"
                            ? "every word appears somewhere"
                            : `missing ${coverage.combined.missingTerms.join(", ")}`}
                        </span>
                      </div>
                    </li>
                  ) : null}
                </ul>
                <p className="text-xs text-muted-foreground">
                  Shows where the words appear, not how much each field affects ranking.
                  {listingMatch.match !== "exact"
                    ? ` Using the ${listingMatch.listing.country} (${listingMatch.listing.language}) listing's metadata.`
                    : null}{" "}
                  <Link
                    href="/dashboard/settings#listings"
                    className="underline-offset-2 hover:underline"
                  >
                    Edit listing metadata
                  </Link>
                </p>
              </>
            )}
          </Panel>

          <Panel
            title="Related ASO events"
            description={`${keyword.platform === "ios" ? "iOS" : "Android"} changes in this storefront`}
            bodyClassName="p-4"
          >
            {relatedEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No changes recorded.{" "}
                <Link
                  href="/dashboard/experiments"
                  className="text-foreground underline-offset-2 hover:underline"
                >
                  Record a change
                </Link>{" "}
                to annotate the rank chart.
              </p>
            ) : (
              <ul className="space-y-4">
                {relatedEvents.slice(0, 5).map((e) => (
                  <li key={e.id}>
                    <EventItem event={e} compact />
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            title="Top competing results"
            description={
              difficulty
                ? `From the check ${formatDate(difficulty.measuredAt)}. This app excluded.`
                : undefined
            }
          >
            {!difficulty || difficulty.topResults.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">
                {!difficulty
                  ? "Appears after the first rank check."
                  : getSourceInfo(difficulty.source).demo
                    ? "Not included in the demo data."
                    : difficulty.sampleSize === 0
                      ? "The search returned no other apps."
                      : "No result details were stored with this estimate."}
              </p>
            ) : (
              <ol className="divide-y text-[13px]">
                {difficulty.topResults.map((r) => (
                  <li
                    key={`${r.position}-${r.externalId}`}
                    className="flex items-center gap-3 px-4 py-2"
                  >
                    <span className="w-6 shrink-0 text-right text-xs text-muted-foreground tabular">
                      {r.position}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{r.name ?? "Unknown app"}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {r.developer}
                      </span>
                    </span>
                    <span
                      className="shrink-0 text-xs text-muted-foreground tabular"
                      title="Rating count"
                    >
                      {r.ratingCount === null
                        ? "—"
                        : `${formatCompact(r.ratingCount)} ${r.ratingCount === 1 ? "rating" : "ratings"}`}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>
      </div>
    </PageContainer>
  )
}

function CoverageIcon({ match }: { match: FieldMatch | "partial" | "none" }) {
  const base = "mt-0.5 size-3.5 shrink-0"
  if (match === "exact_phrase" || match === "all_terms")
    return <Check className={cn(base, "text-foreground")} aria-label="Covered" />
  if (match === "partial")
    return <CircleDashed className={cn(base, "text-attention")} aria-label="Partly covered" />
  if (match === "empty")
    return <Minus className={cn(base, "text-muted-foreground")} aria-label="Field empty" />
  return <X className={cn(base, "text-muted-foreground")} aria-label="Not present" />
}

function coverageText(match: FieldMatch, missing: string[], variants: string[]): string {
  const variantNote = variants.length > 0 ? ` (variant: ${variants.join(", ")})` : ""
  switch (match) {
    case "exact_phrase":
      return `exact phrase${variantNote}`
    case "all_terms":
      return `all words${variantNote}`
    case "partial":
      return `some words, missing ${missing.join(", ")}`
    case "none":
      return "not present"
    case "empty":
      return "not recorded"
  }
}
