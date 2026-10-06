/**
 * Public App Store listing metadata via the iTunes Lookup API: title, description,
 * developer, category, icon, version and ratings. The subtitle and the private keyword
 * field are not exposed publicly and must be entered manually.
 */

import "server-only"

import {
  fail,
  ok,
  type ListingMetadataQuery,
  type MetadataProvider,
  type ProviderResult,
  type ProviderStatus,
  type StoreListingMetadata,
} from "../types"
import type { ItunesClient } from "./itunes-client"

export const ITUNES_LOOKUP_SOURCE = "apple_itunes_lookup"

export class AppleItunesMetadataProvider implements MetadataProvider {
  readonly id = ITUNES_LOOKUP_SOURCE
  readonly name = "Apple iTunes Lookup API"
  readonly platform = "ios" as const
  readonly official = false

  constructor(private readonly client: ItunesClient) {}

  status(): ProviderStatus {
    return {
      state: "ready",
      detail: "Public API. Subtitle and keyword field must be entered manually.",
    }
  }

  async getListing(query: ListingMetadataQuery): Promise<ProviderResult<StoreListingMetadata>> {
    if (query.platform !== "ios")
      return fail("unsupported", "The iTunes Lookup API only covers the App Store")
    if (!/^\d+$/.test(query.externalAppId))
      return fail("invalid_input", "App Store IDs are numeric")

    const result = await this.client.lookup({ id: query.externalAppId, country: query.country })
    if (!result.ok) return result
    const app = result.data
    if (!app) {
      return fail(
        "not_found",
        `No App Store app with ID ${query.externalAppId} in the ${query.country} storefront`,
      )
    }

    return ok({
      externalAppId: String(app.trackId),
      bundleId: app.bundleId ?? null,
      title: app.trackName ?? null,
      subtitle: null,
      description: app.description ?? null,
      developerName: app.sellerName ?? app.artistName ?? null,
      primaryCategory: app.primaryGenreName ?? null,
      iconUrl: app.artworkUrl512 ?? app.artworkUrl100 ?? null,
      version: app.version ?? null,
      rating: app.averageUserRating ?? null,
      ratingCount: app.userRatingCount ?? null,
      storeUrl: app.trackViewUrl ?? null,
      source: ITUNES_LOOKUP_SOURCE,
      fetchedAt: new Date(),
    })
  }
}
