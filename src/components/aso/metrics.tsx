import { ArrowDown, ArrowUp } from "lucide-react"
import type * as React from "react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  describeRank,
  describeRankChange,
  formatRank,
  formatRankChange,
  type RankChange,
  rankChangeDirection,
  type RankValue,
} from "@/lib/aso/rank"
import { difficultyLabel } from "@/lib/aso/scoring/difficulty"
import { POPULARITY_STATE_DESCRIPTIONS, popularityState } from "@/lib/aso/popularity"
import {
  describeAvailableInputs,
  MISSING_INPUT_REASON_LABELS,
  type MissingInputReason,
  OPPORTUNITY_COMPONENT_LABELS,
  type OpportunityComponentKey,
  type OpportunityResult,
} from "@/lib/aso/scoring/opportunity"
import { getSourceInfo, rankLabel } from "@/lib/aso/sources"
import { formatDateTime, formatPopularityPeriod, formatRelative } from "@/lib/format"
import { cn } from "@/lib/utils"
import {
  PLATFORM_LABELS,
  type DataConfidence,
  type Platform,
  type PopularityStatus,
} from "@/types/aso"

function Hint({ content, children }: { content: React.ReactNode; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-default">{children}</span>
      </TooltipTrigger>
      <TooltipContent className="max-w-72 text-xs leading-relaxed">{content}</TooltipContent>
    </Tooltip>
  )
}

function Provenance({ lines }: { lines: Array<React.ReactNode | null | false> }) {
  return (
    <div className="space-y-0.5">
      {lines.filter(Boolean).map((line, i) => (
        <div key={i} className={i === 0 ? "font-medium" : "opacity-80"}>
          {line}
        </div>
      ))}
    </div>
  )
}

const muted = "text-muted-foreground"

// ---------------------------------------------------------------------------
// Rank
// ---------------------------------------------------------------------------

export function RankText({ value, className }: { value: RankValue; className?: string }) {
  return (
    <span
      className={cn("tabular", value.kind === "unranked" && `${muted} text-[0.92em]`, className)}
    >
      {formatRank(value)}
    </span>
  )
}

export function EstimatedRank({
  observation,
  now,
  className,
}: {
  observation: {
    value: RankValue
    checkedAt: string
    source: string
    confidence?: DataConfidence
  } | null
  now: string
  className?: string
}) {
  if (!observation) {
    return (
      <Hint content="This keyword hasn't been checked yet. Use “Refresh rankings”.">
        <span className={cn(muted, "text-[0.92em]", className)}>Not checked</span>
      </Hint>
    )
  }
  const source = getSourceInfo(observation.source)
  return (
    <Hint
      content={
        <Provenance
          lines={[
            `${rankLabel(observation.source)}: ${describeRank(observation.value)}`,
            source.label,
            observation.confidence ? `Confidence: ${observation.confidence}` : null,
            `Checked ${formatRelative(observation.checkedAt, now)} (${formatDateTime(observation.checkedAt)})`,
            !source.official && "Unofficial source: an estimate, not App Store's canonical rank.",
          ]}
        />
      }
    >
      <RankText value={observation.value} className={cn("font-medium", className)} />
    </Hint>
  )
}

export function RankChangeIndicator({
  change,
  className,
}: {
  change: RankChange
  className?: string
}) {
  const direction = rankChangeDirection(change)
  const text = formatRankChange(change)
  const Icon = direction === "up" ? ArrowUp : ArrowDown
  return (
    <Hint content={describeRankChange(change)}>
      <span
        className={cn(
          "inline-flex items-center gap-0.5 tabular",
          direction === "up" && "text-positive",
          direction === "down" && "text-negative",
          (direction === "flat" || direction === "none") && muted,
          className,
        )}
      >
        {direction === "up" || direction === "down" ? (
          <Icon className="size-3" aria-hidden />
        ) : null}
        <span className="sr-only">{describeRankChange(change)}</span>
        <span aria-hidden>{text}</span>
      </span>
    </Hint>
  )
}

// ---------------------------------------------------------------------------
// Popularity (Apple relative popularity; never "search volume")
// ---------------------------------------------------------------------------

export interface PopularityDisplay {
  status: PopularityStatus
  score: number | null
  source: string
  measuredAt: string
  granularity?: string
  periodStart?: string | null
  periodEnd?: string | null
  genre?: {
    genre: string
    rankInGenre: number | null
    searchPopularityInGenre: number | null
    searchPopularity1to5: number | null
  } | null
}

const GENRE_LABELS: Record<string, string> = {
  FOOD_DRINK: "Food & Drink",
  HEALTH_FITNESS: "Health & Fitness",
  PHOTO_VIDEO: "Photo & Video",
  PRODUCTIVITY_UTILITIES: "Productivity & Utilities",
}

/** Apple Ads genre id → label ("SOCIAL_NETWORKING" → "Social Networking"). */
function genreName(genre: string): string {
  return (
    GENRE_LABELS[genre] ??
    genre
      .split("_")
      .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
      .join(" ")
  )
}

export function PopularityValue({
  popularity,
  connected,
  now,
}: {
  popularity: PopularityDisplay | null
  connected: boolean
  now: string
}) {
  const state = popularityState(popularity, connected)
  if (!popularity || state === "not_connected" || state === "unavailable") {
    return (
      <Hint content={POPULARITY_STATE_DESCRIPTIONS[state]}>
        <span className={cn(muted, "text-[0.92em]")}>
          {state === "not_connected" ? "Not connected" : "—"}
        </span>
      </Hint>
    )
  }
  const source = getSourceInfo(popularity.source)
  const period = formatPopularityPeriod({
    granularity: popularity.granularity ?? "point",
    periodStart: popularity.periodStart ?? null,
    periodEnd: popularity.periodEnd ?? null,
  })
  const provenance = `${source.label}, ${period ?? formatRelative(popularity.measuredAt, now)}`
  if (state === "not_returned") {
    return (
      <Hint
        content={
          <Provenance
            lines={[
              "Not returned by Apple",
              POPULARITY_STATE_DESCRIPTIONS.not_returned,
              provenance,
            ]}
          />
        }
      >
        <span className={cn(muted, "text-[0.92em]")}>Not returned</span>
      </Hint>
    )
  }
  const genre = popularity.genre
  return (
    <Hint
      content={
        <Provenance
          lines={[
            `Popularity ${popularity.score} / 100`,
            POPULARITY_STATE_DESCRIPTIONS.available,
            genre
              ? [
                  genreName(genre.genre),
                  genre.rankInGenre !== null ? `#${genre.rankInGenre} in genre` : null,
                  genre.searchPopularityInGenre !== null
                    ? `${genre.searchPopularityInGenre}/100 in genre`
                    : null,
                  genre.searchPopularity1to5 !== null ? `${genre.searchPopularity1to5}/5` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : null,
            provenance,
          ]}
        />
      }
    >
      <span className="font-medium tabular">{Math.round(popularity.score ?? 0)}</span>
    </Hint>
  )
}

// ---------------------------------------------------------------------------
// Difficulty / Relevance
// ---------------------------------------------------------------------------

export function DifficultyValue({
  difficulty,
}: {
  difficulty: { score: number; source: string; measuredAt: string } | null
}) {
  if (!difficulty) {
    return (
      <Hint content="Estimated from the apps ranking for this keyword. Appears after the first rank check.">
        <span className={cn(muted, "text-[0.92em]")}>—</span>
      </Hint>
    )
  }
  return (
    <Hint
      content={
        <Provenance
          lines={[
            `Estimated difficulty ${Math.round(difficulty.score)} / 100`,
            "Based on the rating counts of the top 10 competing apps in the same search. An estimate, not an Apple metric.",
            getSourceInfo(difficulty.source).demo ? "Demo data" : null,
          ]}
        />
      }
    >
      <span className="inline-flex items-baseline gap-1.5">
        <span>{difficultyLabel(difficulty.score)}</span>
        <span className={cn(muted, "text-[0.92em] tabular")}>{Math.round(difficulty.score)}</span>
      </span>
    </Hint>
  )
}

export function RelevanceValue({ relevance }: { relevance: number | null }) {
  if (relevance === null) return <span className={cn(muted, "text-[0.92em]")}>Not set</span>
  return (
    <span className="tabular">
      {relevance}
      <span className={muted}>/10</span>
    </span>
  )
}

// ---------------------------------------------------------------------------
// Opportunity Score
// ---------------------------------------------------------------------------

export function OpportunityValue({
  opportunity,
  missingReasons = {},
  showBar = true,
}: {
  opportunity: OpportunityResult
  /** Why each missing input is missing (see `missingInputReasons`). */
  missingReasons?: Partial<Record<OpportunityComponentKey, MissingInputReason>>
  showBar?: boolean
}) {
  const reasonFor = (key: OpportunityComponentKey) => {
    const reason = missingReasons[key]
    return reason ? MISSING_INPUT_REASON_LABELS[reason] : "missing"
  }
  if (opportunity.score === null) {
    return (
      <Hint
        content={
          opportunity.missing.includes("relevance")
            ? "Set the keyword's relevance to compute an Opportunity Score."
            : `Not enough data yet. ${opportunity.missing
                .map(
                  (key) => `${OPPORTUNITY_COMPONENT_LABELS[key]}: ${reasonFor(key).toLowerCase()}`,
                )
                .join("; ")}.`
        }
      >
        <span className={cn(muted, "text-[0.92em]")}>—</span>
      </Hint>
    )
  }
  const partial = opportunity.status === "partial"
  return (
    <Hint
      content={
        <div className="space-y-1.5">
          <div className="font-medium">
            Opportunity Score {opportunity.score} / 100{partial ? " (partial)" : ""}
          </div>
          <table className="w-full tabular">
            <tbody>
              {opportunity.components.map((c) => (
                <tr key={c.key} className={c.value === null ? "opacity-60" : undefined}>
                  <td className="pr-3">{c.label}</td>
                  <td className="pr-2 text-right">{Math.round(c.weight * 100)}%</td>
                  <td className="text-right">
                    {c.points === null ? reasonFor(c.key) : `+${c.points.toFixed(1)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {partial ? (
            <div className="opacity-80">
              Partial. {describeAvailableInputs(opportunity)} Missing inputs are excluded, not
              counted as zero, and the remaining weights are renormalized.
            </div>
          ) : null}
        </div>
      }
    >
      <span className="inline-flex items-center gap-2">
        <span className="w-6 text-right font-medium tabular">{opportunity.score}</span>
        {showBar ? (
          <span
            className="relative hidden h-1.5 w-12 overflow-hidden rounded-full bg-data-soft sm:block"
            aria-hidden
          >
            <span
              className="absolute inset-y-0 left-0 rounded-full bg-data"
              style={{ width: `${opportunity.score}%` }}
            />
          </span>
        ) : null}
        {partial ? <span className="text-[10px] text-attention">partial</span> : null}
      </span>
    </Hint>
  )
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

export function PlatformLabel({ platform, className }: { platform: Platform; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-sm border px-1.5 text-[11px] font-medium text-muted-foreground",
        className,
      )}
    >
      {PLATFORM_LABELS[platform]}
    </span>
  )
}

export function RelativeTime({
  value,
  now,
  className,
}: {
  value: string | null
  now: string
  className?: string
}) {
  if (!value) return <span className={cn(muted, className)}>—</span>
  return (
    <time dateTime={value} title={formatDateTime(value)} className={cn("tabular", className)}>
      {formatRelative(value, now)}
    </time>
  )
}
