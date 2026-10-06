import "server-only"

import type { AsoClient } from "@/lib/supabase/types"
import { type AsoEvent, mapEventRow } from "./model"

export async function listEvents(
  db: AsoClient,
  appId: string,
  options: { since?: Date | null; limit?: number } = {},
): Promise<AsoEvent[]> {
  let query = db
    .from("aso_events")
    .select("*")
    .eq("app_id", appId)
    .order("happened_at", { ascending: false })
    .limit(options.limit ?? 500)
  if (options.since) query = query.gte("happened_at", options.since.toISOString())
  const { data, error } = await query
  if (error) throw new Error(`Failed to load ASO events: ${error.message}`)
  return data.map(mapEventRow)
}
