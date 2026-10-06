import type { TableRow } from "@/lib/supabase/types"
import type { AsoEventType, Platform } from "@/types/aso"

export interface AsoEvent {
  id: string
  appId: string
  platform: Platform | null
  country: string | null
  type: AsoEventType
  title: string
  description: string | null
  before: string | null
  after: string | null
  happenedAt: string
  source: string
}

export const EVENT_TYPE_LABELS: Record<AsoEventType, string> = {
  title_change: "Title change",
  subtitle_change: "Subtitle change",
  keyword_change: "Keyword change",
  description_change: "Description change",
  screenshot_change: "Screenshot change",
  icon_change: "Icon change",
  release: "Release",
  custom: "Custom event",
}

/** Default event titles, used when the user doesn't type one. */
export const EVENT_DEFAULT_TITLES: Record<AsoEventType, string> = {
  title_change: "Title changed",
  subtitle_change: "Subtitle changed",
  keyword_change: "Keyword field updated",
  description_change: "Description changed",
  screenshot_change: "Screenshots updated",
  icon_change: "Icon updated",
  release: "New version released",
  custom: "Custom event",
}

/** Event types whose before/after is a piece of text worth showing as a diff. */
export const TEXT_CHANGE_TYPES: ReadonlySet<AsoEventType> = new Set([
  "title_change",
  "subtitle_change",
  "keyword_change",
  "description_change",
])

function readText(data: unknown): string | null {
  if (!data || typeof data !== "object") return null
  const record = data as Record<string, unknown>
  const value = record.text ?? record.version
  return typeof value === "string" ? value : null
}

export function mapEventRow(row: TableRow<"aso_events">): AsoEvent {
  return {
    id: row.id,
    appId: row.app_id,
    platform: row.platform,
    country: row.country,
    type: row.event_type,
    title: row.title,
    description: row.description,
    before: readText(row.before_data),
    after: readText(row.after_data),
    happenedAt: row.happened_at,
    source: row.source,
  }
}

/** Events relevant to a keyword's storefront: same or unspecified platform/country. */
export function eventsForStorefront(
  events: AsoEvent[],
  target: { platform: Platform; country: string },
): AsoEvent[] {
  return events.filter(
    (e) =>
      (e.platform === null || e.platform === target.platform) &&
      (e.country === null || e.country === target.country),
  )
}
