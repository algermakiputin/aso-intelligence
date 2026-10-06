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
 * for searches that returned no results at all. When the result count wasn't recorded,
 * nothing is proven and the value reads "Not ranked".
 *
 * The same rule applies to movement: a transition between ranked and unranked is only
 * reported as "New" or "Lost" when the unranked check saw deep enough to prove it.
 * Otherwise the change is `inconclusive`, never a guessed number or direction.
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

/**
 * Number of results the "not in the top N" claim is based on. 0 when the result count
 * is unknown, because then nothing is proven.
 */
export function visibleDepth(value: Extract<RankValue, { kind: "unranked" }>): number {
  return value.resultsSeen ?? 0
}

function roundThreshold(seen: number): number {
  return ROUND_THRESHOLDS.find((t) => t <= seen) ?? seen
}

/** Largest round threshold the app is provably outside of (or the exact count below 10). */
export function unrankedThreshold(value: Extract<RankValue, { kind: "unranked" }>): number {
  return roundThreshold(visibleDepth(value))
}

/** True when the app is provably outside the top `n` (ranked deeper, or unranked with ≥ n seen). */
export function isProvablyOutsideTop(value: RankValue, n: number): boolean {
  return value.kind === "ranked" ? value.position > n : visibleDepth(value) >= n
}

/** Table/compact form: "18", ">100", "Not found", "Not ranked". */
export function formatRank(value: RankValue): string {
  if (value.kind === "ranked") return String(value.position)
  if (value.resultsSeen === null) return "Not ranked"
  return value.resultsSeen === 0 ? "Not found" : `>${unrankedThreshold(value)}`
}

/** Sentence form used in tooltips. */
export function describeRank(value: RankValue): string {
  if (value.kind === "ranked") return `Position ${value.position}`
  if (value.resultsSeen === null) return "Not among the results returned (result count unknown)"
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
  /** Was provably outside the top `outsideTop`, now ranked within it. */
  | { kind: "entered"; position: number; outsideTop: number }
  /** Was ranked, now provably outside the top `outsideTop` (≥ the previous position). */
  | { kind: "dropped"; previousPosition: number; outsideTop: number }
  /** A ranked ↔ unranked transition the unranked check didn't see deep enough to prove. */
  | { kind: "inconclusive"; resultsSeen: number | null }
  | { kind: "still_unranked" }
  | { kind: "no_baseline" }

/**
 * Movement from `previous` to `current`.
 *   50 → 20             = improved by 30 positions (displayed +30)
 *   20 → 50             = declined by 30 positions (displayed −30)
 *   >100 (193 seen) → 40 = entered (displayed New)
 *   35 → >100 (193 seen) = dropped (displayed Lost)
 *   195 → >100 (180 seen) = inconclusive: the app may still be at 195
 *   >100 (150 seen) → 180 = inconclusive: it may have been at 180 before too
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
    const seen = visibleDepth(previous)
    return current.position <= seen
      ? { kind: "entered", position: current.position, outsideTop: seen }
      : { kind: "inconclusive", resultsSeen: previous.resultsSeen }
  }
  if (previous.kind === "ranked" && current.kind === "unranked") {
    const seen = visibleDepth(current)
    return seen >= previous.position
      ? { kind: "dropped", previousPosition: previous.position, outsideTop: seen }
      : { kind: "inconclusive", resultsSeen: current.resultsSeen }
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
    case "inconclusive":
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
    case "inconclusive":
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
      return `Entered the results at position ${change.position} (previously outside the top ${roundThreshold(change.outsideTop)})`
    case "dropped":
      return `Dropped out of the top ${change.outsideTop} results (was ${change.previousPosition})`
    case "inconclusive":
      return change.resultsSeen === null
        ? "Can't compare: the result count of one check is unknown"
        : `Can't compare: Apple returned only ${change.resultsSeen} results, too few to tell where the app ranked`
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

/**
 * Sort key for "biggest movers": positive = improvement. Entering or dropping out uses
 * the smallest movement the observations prove (e.g. 35 → outside the top 193 is at
 * least −159). Inconclusive and unranked-to-unranked moves are 0. Never displayed.
 */
export function rankChangeSortValue(change: RankChange): number {
  const delta = signedRankDelta(change)
  if (delta !== null) return delta
  if (change.kind === "entered") return change.outsideTop + 1 - change.position
  if (change.kind === "dropped") return -(change.outsideTop + 1 - change.previousPosition)
  return 0
}
