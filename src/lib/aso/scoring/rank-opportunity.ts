import { interpolate } from "../normalization/scales"
import type { RankValue } from "../rank"

/**
 * Rank opportunity: how much ranking headroom a keyword offers, 0–1.
 *
 * Highest in "striking distance" of the top 10 (ranks 11–30), where a metadata change
 * can plausibly move the app onto the first screen. Low near the top (little headroom
 * left) and moderate far down or unranked (headroom exists but there's no traction yet;
 * difficulty captures how hard the climb is).
 *
 * Values between anchors are linearly interpolated.
 */
export const RANK_OPPORTUNITY_ANCHORS: ReadonlyArray<readonly [number, number]> = [
  [1, 0.05],
  [3, 0.2],
  [10, 0.6],
  [11, 0.85],
  [20, 1.0],
  [30, 1.0],
  [50, 0.8],
  [100, 0.55],
]

/** Ranked, but deeper than the last anchor. */
export const RANK_OPPORTUNITY_BEYOND_100 = 0.45
/** Not present in the results we can see. */
export const RANK_OPPORTUNITY_UNRANKED = 0.4

export function rankOpportunity(value: RankValue): number {
  if (value.kind === "unranked") return RANK_OPPORTUNITY_UNRANKED
  if (value.position > 100) return RANK_OPPORTUNITY_BEYOND_100
  return interpolate(RANK_OPPORTUNITY_ANCHORS, value.position)
}
