/**
 * Estimated Search Visibility: a 0–100 index of how visible the app is across its
 * tracked keywords, weighted by popularity. Not a traffic or impressions estimate.
 *
 *   visibility = 100 × Σ popularityₖ × (1 / rankₖ) / Σ popularityₖ
 *
 * Only keywords with a measured popularity contribute. A keyword ranked outside the top
 * 100 (or not ranked) contributes 0 to the numerator but still counts in the
 * denominator, so losing a popular keyword lowers visibility.
 */

import { roundTo } from "../normalization/scales"
import type { RankValue } from "../rank"

export const VISIBILITY_MAX_RANK = 100

export interface VisibilityInput {
  popularity: number | null
  rank: RankValue | null
}

export type VisibilityResult =
  | { status: "ok"; score: number; keywordsUsed: number; keywordsTotal: number }
  | {
      status: "insufficient_data"
      reason: "no_keywords" | "no_popularity" | "no_rank"
      keywordsTotal: number
    }

export function positionWeight(rank: RankValue): number {
  if (rank.kind !== "ranked" || rank.position > VISIBILITY_MAX_RANK) return 0
  return 1 / rank.position
}

export function estimateSearchVisibility(items: ReadonlyArray<VisibilityInput>): VisibilityResult {
  const keywordsTotal = items.length
  if (keywordsTotal === 0)
    return { status: "insufficient_data", reason: "no_keywords", keywordsTotal }

  const withPopularity = items.filter(
    (i): i is { popularity: number; rank: RankValue | null } =>
      typeof i.popularity === "number" && Number.isFinite(i.popularity) && i.popularity > 0,
  )
  if (withPopularity.length === 0) {
    return { status: "insufficient_data", reason: "no_popularity", keywordsTotal }
  }

  const usable = withPopularity.filter(
    (i): i is { popularity: number; rank: RankValue } => i.rank !== null,
  )
  if (usable.length === 0) return { status: "insufficient_data", reason: "no_rank", keywordsTotal }

  let numerator = 0
  let denominator = 0
  for (const item of usable) {
    numerator += item.popularity * positionWeight(item.rank)
    denominator += item.popularity
  }

  return {
    status: "ok",
    score: roundTo((100 * numerator) / denominator, 1),
    keywordsUsed: usable.length,
    keywordsTotal,
  }
}
