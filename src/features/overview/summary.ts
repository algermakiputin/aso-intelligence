/**
 * Overview dashboard metrics, derived purely from keyword rows and listings. Metrics
 * that have no underlying observations come back as null so the UI can say
 * "Waiting for data" instead of showing a misleading zero.
 */

import { analyzeKeywordCoverage, isCoveredInPrimaryFields } from "@/lib/aso/coverage"
import {
  isProvablyOutsideTop,
  RANK_BANDS,
  type RankBand,
  rankBand,
  rankChangeSortValue,
} from "@/lib/aso/rank"
import { evaluateAsoHealth, HIGH_RELEVANCE, type HealthReport } from "@/lib/aso/scoring/health"
import { estimateSearchVisibility, type VisibilityResult } from "@/lib/aso/scoring/visibility"
import { isStale } from "@/lib/aso/scheduling"
import type { KeywordRow } from "../keywords/model"
import { measuredPopularity } from "../keywords/model"
import { type Listing, listingMetadata, selectListing } from "../listings/model"

export const FRESHNESS_HOURS = 72

export interface OverviewSummary {
  tracked: number
  /** Tracked keywords with at least one rank observation. */
  checked: number
  top10: number | null
  top50: number | null
  improved: number | null
  declined: number | null
  /** Tracked keywords that have a previous observation to compare against. */
  comparable: number
  visibility: VisibilityResult
  distribution: Array<{ band: RankBand; label: string; count: number }>
  /** Ranked beyond 100, or unranked in a check that saw at least 100 results. */
  outsideTop100: number
  /** Unranked in a check that saw fewer than 100 results, so the position is unknown. */
  unrankedUnproven: number
  topOpportunities: KeywordRow[]
  movers: KeywordRow[]
  lastCheckedAt: string | null
  health: HealthReport
}

export function summarizeOverview(
  keywords: KeywordRow[],
  listings: Listing[],
  now: Date,
): OverviewSummary {
  const tracked = keywords.filter((k) => k.tracked)
  const checked = tracked.filter((k) => k.latestRank !== null)
  const comparable = checked.filter((k) => k.previousRank !== null)

  const counts = new Map<RankBand, number>(RANK_BANDS.map((b) => [b.band, 0]))
  for (const k of checked) {
    const band = rankBand(k.latestRank!.value)
    counts.set(band, (counts.get(band) ?? 0) + 1)
  }

  const inTop = (n: number) =>
    checked.filter(
      (k) =>
        k.latestRank!.value.kind === "ranked" &&
        (k.latestRank!.value as { position: number }).position <= n,
    ).length

  const lastCheckedAt = checked.reduce<string | null>(
    (latest, k) =>
      latest === null || k.latestRank!.checkedAt > latest ? k.latestRank!.checkedAt : latest,
    null,
  )

  let highRelevance = 0
  let highRelevanceCovered = 0
  for (const k of tracked) {
    if ((k.relevance ?? 0) < HIGH_RELEVANCE) continue
    highRelevance++
    const listing = selectListing(listings, k)?.listing ?? null
    if (
      listing &&
      isCoveredInPrimaryFields(
        analyzeKeywordCoverage(k.keyword, listingMetadata(listing), k.platform),
      )
    ) {
      highRelevanceCovered++
    }
  }

  const primaryListing = listings.find((l) => l.platform === "ios") ?? listings[0] ?? null

  const health = evaluateAsoHealth({
    trackedKeywords: tracked.length,
    keywordsWithRelevance: tracked.filter((k) => k.relevance !== null).length,
    keywordsCheckedRecently: tracked.filter(
      (k) => k.latestRank && !isStale(new Date(k.latestRank.checkedAt), now, FRESHNESS_HOURS),
    ).length,
    freshnessHours: FRESHNESS_HOURS,
    listing: primaryListing
      ? {
          hasTitle: Boolean(primaryListing.title),
          hasSubtitle: Boolean(primaryListing.subtitle),
          hasKeywordField:
            primaryListing.platform === "ios" ? Boolean(primaryListing.keywordField) : null,
        }
      : null,
    highRelevanceKeywords: highRelevance,
    highRelevanceCovered,
    keywordsWithPopularity: tracked.filter((k) => measuredPopularity(k) !== null).length,
  })

  return {
    tracked: tracked.length,
    checked: checked.length,
    top10: checked.length > 0 ? inTop(10) : null,
    top50: checked.length > 0 ? inTop(50) : null,
    improved:
      comparable.length > 0
        ? comparable.filter((k) => rankChangeSortValue(k.change) > 0).length
        : null,
    declined:
      comparable.length > 0
        ? comparable.filter((k) => rankChangeSortValue(k.change) < 0).length
        : null,
    comparable: comparable.length,
    visibility: estimateSearchVisibility(
      tracked.map((k) => ({
        popularity: measuredPopularity(k),
        rank: k.latestRank?.value ?? null,
      })),
    ),
    distribution: RANK_BANDS.map((b) => ({ ...b, count: counts.get(b.band) ?? 0 })),
    outsideTop100: checked.filter((k) => isProvablyOutsideTop(k.latestRank!.value, 100)).length,
    unrankedUnproven: checked.filter(
      (k) =>
        k.latestRank!.value.kind === "unranked" && !isProvablyOutsideTop(k.latestRank!.value, 100),
    ).length,
    topOpportunities: tracked
      .filter((k) => k.opportunity.score !== null)
      .sort((a, b) => b.opportunity.score! - a.opportunity.score!)
      .slice(0, 6),
    movers: comparable
      .filter((k) => rankChangeSortValue(k.change) !== 0)
      .sort(
        (a, b) => Math.abs(rankChangeSortValue(b.change)) - Math.abs(rankChangeSortValue(a.change)),
      )
      .slice(0, 6),
    lastCheckedAt,
    health,
  }
}
