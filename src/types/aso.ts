/**
 * Core domain vocabulary shared by every layer. These mirror the Postgres enums in the
 * `aso` schema; `src/lib/supabase/types.ts` asserts at compile time that they stay in sync.
 */

export const PLATFORMS = ["ios", "android"] as const
export type Platform = (typeof PLATFORMS)[number]

export const WORKSPACE_ROLES = ["owner", "admin", "viewer"] as const
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number]

export const DATA_CONFIDENCE = ["low", "medium", "high"] as const
export type DataConfidence = (typeof DATA_CONFIDENCE)[number]

export const ASO_EVENT_TYPES = [
  "title_change",
  "subtitle_change",
  "keyword_change",
  "description_change",
  "screenshot_change",
  "icon_change",
  "release",
  "custom",
] as const
export type AsoEventType = (typeof ASO_EVENT_TYPES)[number]

export const POPULARITY_STATUSES = ["measured", "below_threshold"] as const
export type PopularityStatus = (typeof POPULARITY_STATUSES)[number]

export const POPULARITY_GRANULARITIES = ["point", "daily", "weekly", "monthly"] as const
export type PopularityGranularity = (typeof POPULARITY_GRANULARITIES)[number]

export const PLATFORM_LABELS: Record<Platform, string> = {
  ios: "iOS",
  android: "Android",
}

export function canEdit(role: WorkspaceRole): boolean {
  return role === "owner" || role === "admin"
}
