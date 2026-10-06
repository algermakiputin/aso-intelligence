/**
 * Rank semantics. Smaller rank numbers are better (1 = top result).
 *
 * An observation is either *ranked* (the app appeared at a position) or *unranked*
 * (the app was not among the results the provider returned). Unranked observations
 * are never converted to a number.
 *
 * Providers can return fewer results than requested without the list being complete
 * (Apple's Search API returns ~190 of 200 even for popular terms, and the tail varies
 * between requests). So an unranked observation only proves "not in the top N", where
 * N is the number of results actually seen. We display the largest round threshold
 * that is still provably true (193 results seen → ">100"). "Not found" is reserved
 * for searches that returned no results at all.
 */

export type RankValue =
  | { kind: "ranked"; position: number }
  | {
      kind: "unranked"
      /** How many results were requested. */
      searchDepth: number
      /** How many results the provider returned (null if unknown). */
      resultsSeen: number | null
    }

export interface RankObservationFields {
  rank: number | null
  resultCount: number | null
  searchDepth: number
}

export function toRankValue(observation: RankObservationFields): RankValue {
  const { rank, resultCount, searchDepth } = observation
  if (rank !== null && Number.isInteger(rank) && rank > 0) {
    return { kind: "ranked", position: rank }
  }
  return {
    kind: "unranked",
    searchDepth,
    resultsSeen: resultCount === null ? null : Math.max(0, Math.min(resultCount, searchDepth)),
  }
}

const ROUND_THRESHOLDS = [200, 100, 50, 20, 10] as const

/** Number of results the "not in the top N" claim is based on. */
export function visibleDepth(value: Extract<RankValue, { kind: "unranked" }>): number {
  return value.resultsSeen ?? value.searchDepth
}

/** Largest round threshold the app is provably outside of (or the exact count below 10). */
export function unrankedThreshold(value: Extract<RankValue, { kind: "unranked" }>): number {
  const seen = visibleDepth(value)
  return ROUND_THRESHOLDS.find((t) => t <= seen) ?? seen
}

/** Table/compact form: "18", ">100", "Not found". */
export function formatRank(value: RankValue): string {
  if (value.kind === "ranked") return String(value.position)
  return visibleDepth(value) === 0 ? "Not found" : `>${unrankedThreshold(value)}`
}

/** Sentence form used in tooltips. */
export function describeRank(value: RankValue): string {
  if (value.kind === "ranked") return `Position ${value.position}`
  const seen = visibleDepth(value)
  if (seen === 0) return "The search returned no results"
  return `Not among the ${seen} results returned (so outside the top ${unrankedThreshold(value)})`
}

export type RankBand = "top_3" | "top_10" | "top_50" | "top_100" | "beyond_100" | "unranked"

export const RANK_BANDS: ReadonlyArray<{ band: RankBand; label: string }> = [
  { band: "top_3", label: "1–3" },
  { band: "top_10", label: "4–10" },
  { band: "top_50", label: "11–50" },
  { band: "top_100", label: "51–100" },
  { band: "beyond_100", label: "101+" },
  { band: "unranked", label: "Not ranked" },
]

export function rankBand(value: RankValue): RankBand {
  if (value.kind === "unranked") return "unranked"
  const p = value.position
  if (p <= 3) return "top_3"
  if (p <= 10) return "top_10"
  if (p <= 50) return "top_50"
  if (p <= 100) return "top_100"
  return "beyond_100"
}

export function isInTop(value: RankValue | null, n: number): boolean {
  return value?.kind === "ranked" && value.position <= n
}

export type RankChange =
  | { kind: "improved"; positions: number }
  | { kind: "declined"; positions: number }
  | { kind: "unchanged" }
  | { kind: "entered"; position: number }
  | { kind: "dropped"; previousPosition: number }
  | { kind: "still_unranked" }
  | { kind: "no_baseline" }

/**
 * Movement from `previous` to `current`.
 *   50 → 20  = improved by 30 positions (displayed +30)
 *   20 → 50  = declined by 30 positions (displayed −30)
 */
export function computeRankChange(
  previous: RankValue | null,
  current: RankValue | null,
): RankChange {
  if (!previous || !current) return { kind: "no_baseline" }

  if (previous.kind === "ranked" && current.kind === "ranked") {
    const delta = previous.position - current.position
    if (delta > 0) return { kind: "improved", positions: delta }
    if (delta < 0) return { kind: "declined", positions: -delta }
    return { kind: "unchanged" }
  }
  if (previous.kind === "unranked" && current.kind === "ranked") {
    return { kind: "entered", position: current.position }
  }
  if (previous.kind === "ranked" && current.kind === "unranked") {
    return { kind: "dropped", previousPosition: previous.position }
  }
  return { kind: "still_unranked" }
}

/** Signed positions gained (+) or lost (−); null when movement isn't numeric. */
export function signedRankDelta(change: RankChange): number | null {
  switch (change.kind) {
    case "improved":
      return change.positions
    case "declined":
      return -change.positions
    case "unchanged":
      return 0
    default:
      return null
  }
}

export type RankDirection = "up" | "down" | "flat" | "none"

export function rankChangeDirection(change: RankChange): RankDirection {
  switch (change.kind) {
    case "improved":
    case "entered":
      return "up"
    case "declined":
    case "dropped":
      return "down"
    case "unchanged":
    case "still_unranked":
      return "flat"
    case "no_baseline":
      return "none"
  }
}

const MINUS = "−"

export function formatRankChange(change: RankChange): string {
  switch (change.kind) {
    case "improved":
      return `+${change.positions}`
    case "declined":
      return `${MINUS}${change.positions}`
    case "unchanged":
      return "0"
    case "entered":
      return "New"
    case "dropped":
      return "Lost"
    case "still_unranked":
    case "no_baseline":
      return "—"
  }
}

export function describeRankChange(change: RankChange): string {
  switch (change.kind) {
    case "improved":
      return `Up ${change.positions} ${change.positions === 1 ? "position" : "positions"}`
    case "declined":
      return `Down ${change.positions} ${change.positions === 1 ? "position" : "positions"}`
    case "unchanged":
      return "No change"
    case "entered":
      return `Entered the results at position ${change.position}`
    case "dropped":
      return `Dropped out of the results (was ${change.previousPosition})`
    case "still_unranked":
      return "Still not ranked"
    case "no_baseline":
      return "No earlier observation to compare"
  }
}

/**
 * Ascending comparator for sorting by rank: ranked positions first (1, 2, 3…), then
 * unranked, then never-checked (null).
 */
export function compareRankValues(a: RankValue | null, b: RankValue | null): number {
  const weight = (v: RankValue | null) =>
    v === null ? Number.MAX_SAFE_INTEGER : v.kind === "ranked" ? v.position : 1_000_000
  return weight(a) - weight(b)
}

/** Sort key for "biggest movers": positive = improvement. Non-numeric moves rank after numeric. */
export function rankChangeSortValue(change: RankChange): number {
  const delta = signedRankDelta(change)
  if (delta !== null) return delta
  if (change.kind === "entered") return 0.5
  if (change.kind === "dropped") return -0.5
  return 0
}
