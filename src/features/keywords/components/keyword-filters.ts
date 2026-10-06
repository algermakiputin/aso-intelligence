import { rankBand } from "@/lib/aso/rank"
import type { Platform } from "@/types/aso"
import type { KeywordRow } from "../model"

export type RankFilter = "all" | "top_10" | "top_50" | "top_100" | "outside_100" | "unchecked"
export type StatusFilter = "all" | "tracked" | "paused"

export interface KeywordFilterState {
  search: string
  platform: "all" | Platform
  country: "all" | string
  status: StatusFilter
  rank: RankFilter
}

export const DEFAULT_FILTERS: KeywordFilterState = {
  search: "",
  platform: "all",
  country: "all",
  status: "all",
  rank: "all",
}

export const RANK_FILTER_LABELS: Record<RankFilter, string> = {
  all: "Any rank",
  top_10: "Top 10",
  top_50: "Top 50",
  top_100: "Top 100",
  outside_100: "Outside top 100",
  unchecked: "Not checked yet",
}

function matchesRank(row: KeywordRow, filter: RankFilter): boolean {
  if (filter === "all") return true
  if (filter === "unchecked") return row.latestRank === null
  if (!row.latestRank) return false
  const band = rankBand(row.latestRank.value)
  switch (filter) {
    case "top_10":
      return band === "top_3" || band === "top_10"
    case "top_50":
      return band === "top_3" || band === "top_10" || band === "top_50"
    case "top_100":
      return band !== "beyond_100" && band !== "unranked"
    case "outside_100":
      return band === "beyond_100" || band === "unranked"
  }
}

export function filterKeywords(rows: KeywordRow[], filters: KeywordFilterState): KeywordRow[] {
  const needle = filters.search.trim().toLowerCase()
  return rows.filter(
    (row) =>
      (!needle ||
        row.keyword.includes(needle) ||
        (row.notes?.toLowerCase().includes(needle) ?? false)) &&
      (filters.platform === "all" || row.platform === filters.platform) &&
      (filters.country === "all" || row.country === filters.country) &&
      (filters.status === "all" || (filters.status === "tracked" ? row.tracked : !row.tracked)) &&
      matchesRank(row, filters.rank),
  )
}

export function isFiltered(filters: KeywordFilterState): boolean {
  return (Object.keys(DEFAULT_FILTERS) as Array<keyof KeywordFilterState>).some(
    (k) => filters[k] !== DEFAULT_FILTERS[k],
  )
}
