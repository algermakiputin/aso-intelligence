/**
 * Provider registry: the only module that knows which concrete providers exist.
 * Instances are process-wide so the iTunes rate limiter and search cache are shared.
 */

import "server-only"

import { getServerEnv } from "@/lib/env/server"
import type { Platform } from "@/types/aso"
import { AppleAdsPopularityProvider } from "./apple/apple-ads-popularity-provider"
import { AppStoreConnectAnalyticsProvider } from "./apple/app-store-connect-analytics-provider"
import { ItunesClient } from "./apple/itunes-client"
import { AppleItunesMetadataProvider } from "./apple/itunes-metadata-provider"
import { AppleItunesRankProvider } from "./apple/itunes-rank-provider"
import { GooglePlayMetadataProvider } from "./google/google-play-metadata-provider"
import { GooglePlayRankProvider } from "./google/google-play-rank-provider"
import type {
  KeywordPopularityProvider,
  KeywordRankProvider,
  MetadataProvider,
  ProviderStatus,
  StoreAnalyticsProvider,
} from "./types"

interface Registry {
  rank: Record<Platform, KeywordRankProvider>
  popularity: Record<Platform, KeywordPopularityProvider | null>
  metadata: Record<Platform, MetadataProvider | null>
  analytics: Record<Platform, StoreAnalyticsProvider | null>
}

let registry: Registry | null = null

function build(): Registry {
  const env = getServerEnv()
  const itunes = new ItunesClient()
  return {
    rank: {
      ios: new AppleItunesRankProvider(itunes),
      android: new GooglePlayRankProvider(),
    },
    popularity: {
      ios: new AppleAdsPopularityProvider({
        clientId: env.APPLE_ADS_CLIENT_ID,
        teamId: env.APPLE_ADS_TEAM_ID,
        keyId: env.APPLE_ADS_KEY_ID,
        privateKey: env.APPLE_ADS_PRIVATE_KEY,
        clientSecret: env.APPLE_ADS_CLIENT_SECRET,
        accountId: env.APPLE_ADS_ACCOUNT_ID,
      }),
      android: null,
    },
    metadata: {
      ios: new AppleItunesMetadataProvider(itunes),
      android: new GooglePlayMetadataProvider(env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON),
    },
    analytics: {
      ios: new AppStoreConnectAnalyticsProvider({
        issuerId: env.APPLE_CONNECT_ISSUER_ID,
        keyId: env.APPLE_CONNECT_KEY_ID,
        privateKey: env.APPLE_CONNECT_PRIVATE_KEY,
      }),
      android: null,
    },
  }
}

function getRegistry(): Registry {
  registry ??= build()
  return registry
}

export function getRankProvider(platform: Platform): KeywordRankProvider {
  return getRegistry().rank[platform]
}

export function getPopularityProvider(platform: Platform): KeywordPopularityProvider | null {
  return getRegistry().popularity[platform]
}

export function getMetadataProvider(platform: Platform): MetadataProvider | null {
  return getRegistry().metadata[platform]
}

export function getAnalyticsProvider(platform: Platform): StoreAnalyticsProvider | null {
  return getRegistry().analytics[platform]
}

/** True when listings on `platform` can be imported from the store right now. */
export function canSyncListings(platform: Platform): boolean {
  return getMetadataProvider(platform)?.status().state === "ready"
}

export interface IntegrationStatus {
  key: string
  capability: string
  platform: Platform
  name: string
  official: boolean
  status: ProviderStatus
}

/** Everything the settings page shows, including integrations planned for later versions. */
export function describeIntegrations(): IntegrationStatus[] {
  const r = getRegistry()
  const planned = (detail: string): ProviderStatus => ({ state: "unsupported", detail })
  const entry = (
    key: string,
    capability: string,
    platform: Platform,
    p: { name: string; official: boolean; status(): ProviderStatus },
  ) => ({
    key,
    capability,
    platform,
    name: p.name,
    official: p.official,
    status: p.status(),
  })

  return [
    entry("rank-ios", "Estimated rank", "ios", r.rank.ios),
    entry("rank-android", "Estimated rank", "android", r.rank.android),
    ...(r.popularity.ios
      ? [entry("popularity-ios", "Keyword popularity", "ios", r.popularity.ios)]
      : []),
    ...(r.metadata.ios ? [entry("metadata-ios", "Listing metadata", "ios", r.metadata.ios)] : []),
    ...(r.metadata.android
      ? [entry("metadata-android", "Listing metadata", "android", r.metadata.android)]
      : []),
    ...(r.analytics.ios ? [entry("analytics-ios", "Store analytics", "ios", r.analytics.ios)] : []),
    {
      key: "play-reporting",
      capability: "Store analytics",
      platform: "android",
      name: "Google Play Console reporting",
      official: true,
      status: planned("Planned for V0.2"),
    },
  ]
}
