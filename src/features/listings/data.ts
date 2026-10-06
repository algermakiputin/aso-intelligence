import "server-only"

import type { AsoClient } from "@/lib/supabase/types"
import { type Listing, mapListingRow } from "./model"

export async function listListings(db: AsoClient, appId: string): Promise<Listing[]> {
  const { data, error } = await db
    .from("store_listings")
    .select("*")
    .eq("app_id", appId)
    .order("platform")
    .order("country")
  if (error) throw new Error(`Failed to load listings: ${error.message}`)
  return data.map(mapListingRow)
}

export async function getListing(
  db: AsoClient,
  appId: string,
  listingId: string,
): Promise<Listing | null> {
  const { data, error } = await db
    .from("store_listings")
    .select("*")
    .eq("app_id", appId)
    .eq("id", listingId)
    .maybeSingle()
  if (error) throw new Error(`Failed to load listing: ${error.message}`)
  return data ? mapListingRow(data) : null
}

export interface MetadataSnapshot {
  id: number
  title: string | null
  subtitle: string | null
  keywordField: string | null
  version: string | null
  source: string
  capturedAt: string
}

export async function listMetadataSnapshots(
  db: AsoClient,
  listingId: string,
  limit = 10,
): Promise<MetadataSnapshot[]> {
  const { data, error } = await db
    .from("metadata_snapshots")
    .select("id, title, subtitle_or_short_description, keyword_field, version, source, captured_at")
    .eq("store_listing_id", listingId)
    .order("captured_at", { ascending: false })
    .limit(limit)
  if (error) throw new Error(`Failed to load metadata history: ${error.message}`)
  return data.map((s) => ({
    id: s.id,
    title: s.title,
    subtitle: s.subtitle_or_short_description,
    keywordField: s.keyword_field,
    version: s.version,
    source: s.source,
    capturedAt: s.captured_at,
  }))
}
