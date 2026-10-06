/**
 * Google Play keyword rank: not implemented.
 *
 * Google offers no official search-rank API, and public HTML scraping is brittle and
 * against the spirit of "never fabricate". Rather than ship something that silently
 * breaks, this provider reports `unsupported`. The schema, collector and UI already
 * handle Android keywords; a real provider (e.g. a licensed data vendor) can be dropped
 * in here without changes elsewhere.
 */

import { fail, type KeywordRankProvider, type ProviderStatus } from "../types"

export class GooglePlayRankProvider implements KeywordRankProvider {
  readonly id = "google_play_rank_unavailable"
  readonly name = "Google Play rank tracking"
  readonly platform = "android" as const
  readonly official = false

  status(): ProviderStatus {
    return { state: "unsupported", detail: "Google Play rank tracking is not available yet" }
  }

  async getRank() {
    return fail("unsupported", "Google Play rank tracking is not available yet")
  }
}
