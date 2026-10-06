import type { TableRow } from "@/lib/supabase/types"
import type { ListingMetadata } from "@/lib/aso/coverage"
import type { Platform } from "@/types/aso"

export interface Listing {
  id: string
  appId: string
  platform: Platform
  externalAppId: string
  packageOrBundleId: string | null
  country: string
  language: string
  title: string | null
  subtitle: string | null
  keywordField: string | null
  description: string | null
  developerName: string | null
  primaryCategory: string | null
  metadataSource: string
  version: string | null
  rating: number | null
  ratingCount: number | null
  storeUrl: string | null
  lastSyncedAt: string | null
  updatedAt: string
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null
}

export function mapListingRow(row: TableRow<"store_listings">): Listing {
  const metadata = (row.metadata ?? {}) as Record<string, unknown>
  return {
    id: row.id,
    appId: row.app_id,
    platform: row.platform,
    externalAppId: row.external_app_id,
    packageOrBundleId: row.package_or_bundle_id,
    country: row.country,
    language: row.language,
    title: row.title,
    subtitle: row.subtitle_or_short_description,
    keywordField: row.keyword_field,
    description: row.description,
    developerName: row.developer_name,
    primaryCategory: row.primary_category,
    metadataSource: row.metadata_source,
    version: stringOrNull(metadata.version),
    rating: numberOrNull(metadata.rating),
    ratingCount: numberOrNull(metadata.rating_count),
    storeUrl: stringOrNull(metadata.store_url),
    lastSyncedAt: row.last_synced_at,
    updatedAt: row.updated_at,
  }
}

export function listingMetadata(listing: Listing | null): ListingMetadata {
  return listing
    ? {
        title: listing.title,
        subtitle: listing.subtitle,
        keywordField: listing.keywordField,
        description: listing.description,
      }
    : {}
}

export type ListingMatch = "exact" | "country" | "platform"

/**
 * The listing whose metadata applies to a keyword's storefront: exact
 * platform+country+language, else same country, else any listing on the platform
 * (iOS app IDs are global, so rank checks work with any of them).
 */
export function selectListing(
  listings: ReadonlyArray<Listing>,
  target: { platform: Platform; country: string; language: string },
): { listing: Listing; match: ListingMatch } | null {
  const onPlatform = listings.filter((l) => l.platform === target.platform)
  const exact = onPlatform.find(
    (l) => l.country === target.country && l.language === target.language,
  )
  if (exact) return { listing: exact, match: "exact" }
  const sameCountry = onPlatform.find((l) => l.country === target.country)
  if (sameCountry) return { listing: sameCountry, match: "country" }
  const any = onPlatform[0]
  return any ? { listing: any, match: "platform" } : null
}

export function storeUrlFor(
  listing: Pick<Listing, "platform" | "externalAppId" | "country" | "storeUrl">,
): string {
  if (listing.storeUrl) return listing.storeUrl
  return listing.platform === "ios"
    ? `https://apps.apple.com/${listing.country.toLowerCase()}/app/id${listing.externalAppId}`
    : `https://play.google.com/store/apps/details?id=${encodeURIComponent(listing.externalAppId)}`
}
