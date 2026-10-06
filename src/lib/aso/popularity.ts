/**
 * Popularity states. Apple's Search Term Popularity only covers the terms in its dataset,
 * so "no number" has several distinct meanings. None of them is zero.
 *
 *   available      a measured value (Apple Ads or a manual entry)
 *   not_returned   the provider's dataset for the period didn't include the term
 *                  (stored as status `below_threshold`)
 *   not_connected  nothing recorded, and no popularity provider is configured
 *   unavailable    nothing recorded yet, although a provider is configured
 *
 * Provider failures (`error`) aren't stored per keyword; a failed sync records nothing,
 * so the keyword keeps its previous state.
 */

import type { PopularityStatus } from "@/types/aso"

export type PopularityState = "available" | "not_returned" | "not_connected" | "unavailable"

export function popularityState(
  popularity: { status: PopularityStatus } | null,
  connected: boolean,
): PopularityState {
  if (popularity?.status === "measured") return "available"
  if (popularity?.status === "below_threshold") return "not_returned"
  return connected ? "unavailable" : "not_connected"
}

export const POPULARITY_STATE_LABELS: Record<PopularityState, string> = {
  available: "Available",
  not_returned: "Not returned",
  not_connected: "Not connected",
  unavailable: "Waiting for data",
}

export const POPULARITY_STATE_DESCRIPTIONS: Record<PopularityState, string> = {
  available: "Apple's relative popularity score (1–100), not search volume.",
  not_returned:
    "Apple's Search Term Popularity data for this period didn't include the term. Apple only reports terms above its eligibility threshold, so this is not a zero, and it isn't used as one.",
  not_connected:
    "Apple keyword popularity not connected. Connect Apple Ads or record a value manually on the keyword page.",
  unavailable: "No popularity recorded for this keyword yet.",
}

/**
 * Ascending comparator over measured scores, where `null` means "not returned". A term
 * Apple didn't return sorts below every measured score without being given a value.
 */
export function comparePopularity(a: number | null, b: number | null): number {
  if (a === null || b === null) return a === b ? 0 : a === null ? -1 : 1
  return a - b
}
