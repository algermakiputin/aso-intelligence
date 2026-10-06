import { Check, Circle, Minus, X } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import {
  EstimatedRank,
  OpportunityValue,
  PopularityValue,
  RankChangeIndicator,
} from "@/components/aso/metrics"
import { type DistributionSegment, RankDistribution } from "@/components/charts/rank-distribution"
import { WaitingForData } from "@/components/dashboard/empty-state"
import { PageContainer, PageHeader, Panel } from "@/components/dashboard/panel"
import { Stat, StatStrip } from "@/components/dashboard/stat-strip"
import { Button } from "@/components/ui/button"
import { EventItem } from "@/features/experiments/components/event-item"
import { listEvents } from "@/features/experiments/data"
import { listKeywords } from "@/features/keywords/data"
import { opportunityMissingReasons } from "@/features/keywords/model"
import { listListings } from "@/features/listings/data"
import { summarizeOverview } from "@/features/overview/summary"
import { RefreshRankingsButton } from "@/features/rankings/components/refresh-rankings-button"
import { requireActiveApp } from "@/features/workspaces/context"
import type { HealthCheckStatus } from "@/lib/aso/scoring/health"
import { formatRelative } from "@/lib/format"
import { getPopularityProvider } from "@/lib/stores/registry"
import { cn } from "@/lib/utils"
import { countryName } from "@/lib/validation/locales"

export const metadata: Metadata = { title: "Overview" }
export const maxDuration = 60

export default async function OverviewPage() {
  const ctx = await requireActiveApp()
  const [keywords, listings, events] = await Promise.all([
    listKeywords(ctx.db, ctx.activeApp.id),
    listListings(ctx.db, ctx.activeApp.id),
    listEvents(ctx.db, ctx.activeApp.id, { limit: 5 }),
  ])
  const nowDate = new Date()
  const now = nowDate.toISOString()
  const summary = summarizeOverview(keywords, listings, nowDate)
  const popularityConnected = getPopularityProvider("ios")?.status().state === "ready"

  const steps = [
    {
      done: listings.some((l) => l.title),
      label: "Import or enter the live listing metadata",
      href: "/dashboard/settings#listings",
    },
    {
      done: summary.tracked > 0,
      label: "Add the keywords you want to rank for",
      href: "/dashboard/keywords",
    },
    {
      done: summary.checked > 0,
      label: "Refresh rankings to get the first estimated ranks",
      href: "/dashboard/keywords",
    },
    {
      done: events.length > 0,
      label: "Record listing changes as you make them",
      href: "/dashboard/experiments",
    },
  ]
  const setupComplete = steps.every((s) => s.done)

  const segments: DistributionSegment[] = [
    {
      key: "top_3",
      label: "1–3",
      count: summary.distribution.find((d) => d.band === "top_3")!.count,
      colorClass: "bg-rank-1",
    },
    {
      key: "top_10",
      label: "4–10",
      count: summary.distribution.find((d) => d.band === "top_10")!.count,
      colorClass: "bg-rank-2",
    },
    {
      key: "top_50",
      label: "11–50",
      count: summary.distribution.find((d) => d.band === "top_50")!.count,
      colorClass: "bg-rank-3",
    },
    {
      key: "top_100",
      label: "51–100",
      count: summary.distribution.find((d) => d.band === "top_100")!.count,
      colorClass: "bg-rank-4",
    },
    {
      key: "outside",
      label: "Outside top 100",
      count: summary.outsideTop100,
      colorClass: "bg-rank-none",
    },
    // Unranked in a check that returned fewer than 100 results: not provably outside 100.
    ...(summary.unrankedUnproven > 0
      ? [
          {
            key: "unproven",
            label: "Not ranked (<100 seen)",
            count: summary.unrankedUnproven,
            colorClass: "bg-rank-none/50",
          },
        ]
      : []),
  ]

  const listing = listings.find((l) => l.country === ctx.activeApp.defaultCountry) ?? listings[0]

  return (
    <PageContainer>
      <PageHeader
        title="Overview"
        description={
          <>
            {listing?.title ?? ctx.activeApp.name} in the{" "}
            {countryName(ctx.activeApp.defaultCountry)} storefront.{" "}
            {summary.lastCheckedAt
              ? `Last rank check ${formatRelative(summary.lastCheckedAt, now)}.`
              : "No rank checks yet."}
          </>
        }
        actions={
          ctx.canEdit && summary.tracked > 0 ? (
            <RefreshRankingsButton
              disabled={ctx.isDemo}
              disabledReason="Rank checks are disabled for demo data"
            />
          ) : null
        }
      />

      {!setupComplete ? (
        <Panel
          title="Get started"
          description={`${steps.filter((s) => s.done).length} of ${steps.length} done`}
        >
          <ol className="grid divide-y sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
            {steps.map((step, i) => (
              <li key={step.label}>
                <Link
                  href={step.href}
                  className="flex h-full items-start gap-3 px-4 py-3 text-[13px] hover:bg-muted/40"
                >
                  <span
                    className={cn(
                      "mt-px flex size-5 shrink-0 items-center justify-center rounded-full border text-[11px] tabular",
                      step.done && "border-transparent bg-primary text-primary-foreground",
                    )}
                  >
                    {step.done ? <Check className="size-3" /> : i + 1}
                  </span>
                  <span
                    className={
                      step.done
                        ? "text-muted-foreground line-through decoration-muted-foreground/40"
                        : undefined
                    }
                  >
                    {step.label}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </Panel>
      ) : null}

      <StatStrip>
        <Stat
          label="Tracked keywords"
          value={summary.tracked}
          detail={summary.tracked > 0 ? `${summary.checked} checked` : "Add keywords to start"}
        />
        <Stat
          label="In top 10"
          value={summary.top10 ?? <WaitingForData />}
          detail={
            summary.top10 !== null
              ? `Estimated, of ${summary.checked} checked`
              : "Needs a rank check"
          }
        />
        <Stat
          label="In top 50"
          value={summary.top50 ?? <WaitingForData />}
          detail={
            summary.top50 !== null
              ? `Estimated, of ${summary.checked} checked`
              : "Needs a rank check"
          }
        />
        <Stat
          label="Improved"
          value={
            summary.improved === null ? (
              <WaitingForData />
            ) : (
              <span className={summary.improved > 0 ? "text-positive" : undefined}>
                {summary.improved}
              </span>
            )
          }
          detail={summary.improved === null ? "Needs two checks" : "Estimated, vs. previous check"}
        />
        <Stat
          label="Declined"
          value={
            summary.declined === null ? (
              <WaitingForData />
            ) : (
              <span className={summary.declined > 0 ? "text-negative" : undefined}>
                {summary.declined}
              </span>
            )
          }
          detail={summary.declined === null ? "Needs two checks" : "Estimated, vs. previous check"}
        />
        <Stat
          label="Estimated Search Visibility"
          hint="Popularity-weighted reciprocal rank across tracked keywords, 0–100. An index, not a traffic estimate."
          value={summary.visibility.status === "ok" ? summary.visibility.score : <WaitingForData />}
          detail={
            summary.visibility.status === "ok"
              ? `Index from ${summary.visibility.keywordsUsed} of ${summary.visibility.keywordsTotal} keywords`
              : summary.visibility.reason === "no_popularity"
                ? "Needs popularity data"
                : "Needs ranked keywords"
          }
        />
      </StatStrip>

      <Panel
        title="Ranking distribution"
        description={
          summary.checked > 0
            ? `Where ${summary.checked} checked keywords currently rank (estimated)`
            : undefined
        }
        bodyClassName="p-4"
      >
        {summary.checked > 0 ? (
          <RankDistribution segments={segments} total={summary.checked} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Waiting for data. The distribution appears after the first rank check.
          </p>
        )}
      </Panel>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          <Panel
            title="Top opportunities"
            description="Highest Opportunity Score among tracked keywords"
            action={
              <Button asChild variant="ghost" size="sm">
                <Link href="/dashboard/keywords">All keywords</Link>
              </Button>
            }
          >
            {summary.topOpportunities.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">
                {summary.tracked === 0
                  ? "Add keywords to see opportunities."
                  : "Waiting for data. Opportunity needs a keyword's relevance plus a rank check or popularity."}
              </p>
            ) : (
              <div className="relative overflow-x-auto">
                <table className="w-full min-w-[520px] text-[13px]">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="h-8 px-4 text-left font-medium">Keyword</th>
                      <th className="h-8 px-4 text-right font-medium">Popularity</th>
                      <th className="h-8 px-4 text-right font-medium">Estimated Rank</th>
                      <th className="h-8 px-4 text-right font-medium">Opportunity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.topOpportunities.map((k) => (
                      <tr key={k.id} className="border-b last:border-b-0 hover:bg-muted/40">
                        <td className="h-9 px-4">
                          <Link
                            href={`/dashboard/keywords/${k.id}`}
                            className="font-medium hover:underline"
                          >
                            {k.keyword}
                          </Link>
                          <span className="ml-2 text-xs text-muted-foreground">{k.country}</span>
                        </td>
                        <td className="h-9 px-4 text-right">
                          <PopularityValue
                            popularity={k.popularity}
                            connected={popularityConnected}
                            now={now}
                          />
                        </td>
                        <td className="h-9 px-4 text-right">
                          <EstimatedRank observation={k.latestRank} now={now} />
                        </td>
                        <td className="h-9 px-4 text-right">
                          <OpportunityValue
                            opportunity={k.opportunity}
                            missingReasons={opportunityMissingReasons(k, popularityConnected)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel
            title="Rank movement"
            description="Largest changes since each keyword's previous check"
          >
            {summary.movers.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">
                {summary.comparable === 0
                  ? "Waiting for data. Movement needs at least two checks per keyword."
                  : "No movement since the previous checks."}
              </p>
            ) : (
              <ul className="divide-y text-[13px]">
                {summary.movers.map((k) => (
                  <li key={k.id} className="flex items-center gap-3 px-4 py-2">
                    <Link
                      href={`/dashboard/keywords/${k.id}`}
                      className="min-w-0 flex-1 truncate font-medium hover:underline"
                    >
                      {k.keyword}
                    </Link>
                    <span className="text-xs text-muted-foreground tabular">
                      {k.previousRank ? (
                        <EstimatedRank
                          observation={{ ...k.previousRank, source: k.latestRank!.source }}
                          now={now}
                          className="font-normal"
                        />
                      ) : null}
                      {" → "}
                      <EstimatedRank observation={k.latestRank} now={now} />
                    </span>
                    <span className="w-14 text-right">
                      <RankChangeIndicator change={k.change} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <Panel
            title="ASO Health"
            description={
              summary.health.evaluated > 0
                ? `${summary.health.passed} of ${summary.health.evaluated} checks passing`
                : "Nothing to evaluate yet"
            }
          >
            <ul className="divide-y">
              {summary.health.checks.map((check) => (
                <li key={check.id} className="flex items-start gap-2.5 px-4 py-2.5 text-[13px]">
                  <HealthIcon status={check.status} />
                  <div className="min-w-0">
                    <div>{check.label}</div>
                    <div className="text-xs text-muted-foreground">{check.detail}</div>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel
            title="Recent changes"
            action={
              <Button asChild variant="ghost" size="sm">
                <Link href="/dashboard/experiments">Timeline</Link>
              </Button>
            }
            bodyClassName="p-4"
          >
            {events.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No listing changes recorded. Record title, subtitle, keyword and screenshot changes
                so you can see what they did to rankings.
              </p>
            ) : (
              <ul className="space-y-4">
                {events.map((e) => (
                  <li key={e.id}>
                    <EventItem event={e} compact />
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </PageContainer>
  )
}

function HealthIcon({ status }: { status: HealthCheckStatus }) {
  const base = "mt-0.5 size-3.5 shrink-0"
  if (status === "pass")
    return <Check className={cn(base, "text-foreground")} aria-label="Passing" />
  if (status === "fail")
    return <X className={cn(base, "text-attention")} aria-label="Needs attention" />
  if (status === "unknown")
    return <Minus className={cn(base, "text-muted-foreground")} aria-label="Not evaluated" />
  return <Circle className={base} />
}
