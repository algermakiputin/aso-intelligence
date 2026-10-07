/**
 * Source registry: every stored observation carries a `source` id. This module is the
 * single place that knows what each id means: how to label it, whether it is official,
 * and whether it is synthetic demo data.
 */

export interface SourceInfo {
  id: string
  label: string
  description: string
  /** Official store data (e.g. Apple Ads popularity) vs. estimates / scraped / manual. */
  official: boolean
  demo: boolean
}

function source(
  id: string,
  label: string,
  description: string,
  official = false,
  demo = false,
): SourceInfo {
  return { id, label, description, official, demo }
}

export const DEMO_SOURCE = "demo"

const SOURCES: Record<string, SourceInfo> = {
  apple_itunes_search: source(
    "apple_itunes_search",
    "Apple iTunes Search API",
    "Position in Apple's public iTunes Search API results. Approximates App Store search, so it is an estimate.",
  ),
  apple_ads_search_term_popularity: source(
    "apple_ads_search_term_popularity",
    "Apple Ads",
    "Apple's relative search-term popularity (1–100) from the Apple Ads Platform API.",
    true,
  ),
  manual: source("manual", "Manual entry", "Entered by a workspace member."),
  apple_itunes_lookup: source(
    "apple_itunes_lookup",
    "App Store (public lookup)",
    "Imported from Apple's public iTunes Lookup API.",
  ),
  apple_app_store_connect_analytics: source(
    "apple_app_store_connect_analytics",
    "App Store Connect Analytics",
    "Official App Store analytics from the App Store Connect Analytics Reports API.",
    true,
  ),
  google_play_developer_api: source(
    "google_play_developer_api",
    "Google Play Console (API)",
    "Imported from the official Google Play Developer API.",
    true,
  ),
  listing_change: source(
    "listing_change",
    "Listing edit",
    "Recorded when the listing metadata was edited.",
  ),
  [DEMO_SOURCE]: source(
    DEMO_SOURCE,
    "Demo data",
    "Synthetic data for previewing the product. Not real.",
    false,
    true,
  ),
}

export function getSourceInfo(id: string | null | undefined): SourceInfo {
  if (!id) return source("unknown", "Unknown source", "No source recorded.")
  return SOURCES[id] ?? source(id, id.replaceAll("_", " "), "Unregistered source.")
}

export function isEstimatedRankSource(id: string | null | undefined): boolean {
  return !getSourceInfo(id).official
}

/** "Estimated Rank" for unofficial sources, "Rank" for official ones. */
export function rankLabel(id: string | null | undefined): string {
  return isEstimatedRankSource(id) ? "Estimated Rank" : "Rank"
}
