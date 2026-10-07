import "server-only"

import type { AsoClient } from "@/lib/supabase/types"
import { type AnalyticsBreakdown, parseBreakdown } from "./model"

/**
 * Aggregates for the Analytics page in one call (a JSON value, so the API row limit
 * doesn't apply): daily totals from `seriesFrom` to `to`, and source/territory totals
 * from `from` to `to`, plus which dates each report covers.
 */
export async function getAnalyticsBreakdown(
  db: AsoClient,
  appId: string,
  source: string,
  range: { from: string; to: string; seriesFrom: string },
): Promise<AnalyticsBreakdown> {
  const { data, error } = await db.rpc("store_analytics_breakdown", {
    p_app_id: appId,
    p_source: source,
    p_from: range.from,
    p_to: range.to,
    p_series_from: range.seriesFrom,
  })
  if (error) throw new Error(`Failed to load analytics: ${error.message}`)
  return parseBreakdown(data)
}
