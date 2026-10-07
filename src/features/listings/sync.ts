import "server-only"

import { createLogger } from "@/lib/logger"
import { getMetadataProvider } from "@/lib/stores/registry"
import type { Json } from "@/lib/supabase/database.types"
import type { AsoClient, TableInsert } from "@/lib/supabase/types"
import { normalizeText } from "@/lib/validation/common"
import type { Listing } from "./model"

const logger = createLogger("listing-sync")

export type SyncOutcome = { ok: true; detectedChanges: string[] } | { ok: false; message: string }

/**
 * Imports listing metadata from the store: the public App Store listing, or the official
 * Google Play listing. Fields the store doesn't provide (e.g. the iOS subtitle and keyword
 * field) keep their stored values. When a previously stored value differs from the
 * store's current value, the change is recorded on the ASO timeline (source = provider
 * id) so it can annotate rank charts. First imports record nothing.
 */
export async function syncListingFromStore(
  db: AsoClient,
  listing: Listing,
  options: { userId: string | null },
): Promise<SyncOutcome> {
  const provider = getMetadataProvider(listing.platform)
  if (!provider)
    return { ok: false, message: "Metadata import isn't available for this platform yet." }

  const result = await provider.getListing({
    platform: listing.platform,
    externalAppId: listing.externalAppId,
    country: listing.country,
    language: listing.language,
  })
  if (!result.ok) {
    logger.warn("sync_failed", { listingId: listing.id, code: result.error.code })
    return { ok: false, message: result.error.message }
  }
  const store = result.data

  const { data: current, error: loadError } = await db
    .from("store_listings")
    .select("metadata")
    .eq("id", listing.id)
    .single()
  if (loadError) return { ok: false, message: "Couldn't load the listing." }

  // Only overwrite stored extras with values the store actually returned.
  const extras: Record<string, Json> = Object.fromEntries(
    Object.entries({
      version: store.version,
      rating: store.rating,
      rating_count: store.ratingCount,
      store_url: store.storeUrl,
      listing_language: store.listingLanguage ?? null,
    }).filter((entry): entry is [string, string | number] => entry[1] != null),
  )

  const { error: updateError } = await db
    .from("store_listings")
    .update({
      title: store.title ?? listing.title,
      subtitle_or_short_description: store.subtitle ?? listing.subtitle,
      description: store.description ?? listing.description,
      developer_name: store.developerName ?? listing.developerName,
      primary_category: store.primaryCategory ?? listing.primaryCategory,
      package_or_bundle_id: listing.packageOrBundleId ?? store.bundleId,
      metadata_source: store.source,
      last_synced_at: store.fetchedAt.toISOString(),
      metadata: { ...((current.metadata ?? {}) as Record<string, Json>), ...extras },
    })
    .eq("id", listing.id)
  if (updateError) return { ok: false, message: "Couldn't save the imported metadata." }

  if (store.iconUrl?.startsWith("https://")) {
    await db.from("apps").update({ icon_url: store.iconUrl }).eq("id", listing.appId)
  }

  const differs = (stored: string | null, live: string | null) =>
    stored !== null && live !== null && normalizeText(stored) !== normalizeText(live)
  const events: TableInsert<"aso_events">[] = []
  const base = {
    app_id: listing.appId,
    platform: listing.platform,
    country: listing.country,
    happened_at: store.fetchedAt.toISOString(),
    source: store.source,
    created_by: options.userId,
  }
  const detected = "Detected when importing the live listing from the store."

  if (differs(listing.title, store.title)) {
    events.push({
      ...base,
      event_type: "title_change",
      title: "Title changed",
      description: detected,
      before_data: { text: listing.title! },
      after_data: { text: store.title! },
    })
  }
  if (differs(listing.subtitle, store.subtitle)) {
    const label = listing.platform === "ios" ? "Subtitle changed" : "Short description changed"
    events.push({
      ...base,
      event_type: "subtitle_change",
      title: label,
      description: detected,
      before_data: { text: listing.subtitle! },
      after_data: { text: store.subtitle! },
    })
  }
  if (differs(listing.description, store.description)) {
    events.push({
      ...base,
      event_type: "description_change",
      title: "Description changed",
      description: detected,
      before_data: { text: listing.description! },
      after_data: { text: store.description! },
    })
  }
  if (differs(listing.version, store.version)) {
    events.push({
      ...base,
      event_type: "release",
      title: `Version ${store.version} released`,
      description: detected,
      before_data: { version: listing.version! },
      after_data: { version: store.version! },
    })
  }
  if (events.length > 0) {
    const { error } = await db.from("aso_events").insert(events)
    if (error) logger.warn("event_insert_failed", { listingId: listing.id, message: error.message })
  }

  return { ok: true, detectedChanges: events.map((e) => e.title) }
}
