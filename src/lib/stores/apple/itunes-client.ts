/**
 * Client for Apple's public iTunes Search and Lookup APIs.
 * https://performance-partners.apple.com/search-api
 *
 * Apple documents a limit of roughly 20 calls per minute. Every request goes through a
 * process-wide limiter (≥ 3 s spacing), has a 20 s timeout (a 200-result search is
 * about 1 MB), and is retried with backoff on 429/5xx/network errors.
 */

import "server-only"

import { z } from "zod"
import { fetchWithRetry, type FetchFailure, type RetryOptions } from "@/lib/http/fetch-with-retry"
import { getSharedRateLimiter, type MinIntervalRateLimiter } from "@/lib/http/rate-limiter"
import { createLogger, type Logger } from "@/lib/logger"
import { fail, ok, type ProviderResult } from "../types"

export const ITUNES_BASE_URL = "https://itunes.apple.com"
export const ITUNES_MIN_INTERVAL_MS = 3_000
/** Maximum `limit` accepted by the Search API. */
export const ITUNES_MAX_LIMIT = 200

const itunesAppSchema = z.object({
  trackId: z.number(),
  trackName: z.string().optional(),
  bundleId: z.string().optional(),
  sellerName: z.string().optional(),
  artistName: z.string().optional(),
  averageUserRating: z.number().optional(),
  userRatingCount: z.number().optional(),
  artworkUrl100: z.string().optional(),
  artworkUrl512: z.string().optional(),
  description: z.string().optional(),
  primaryGenreName: z.string().optional(),
  version: z.string().optional(),
  trackViewUrl: z.string().optional(),
})

export type ItunesApp = z.infer<typeof itunesAppSchema>

const envelopeSchema = z.object({
  resultCount: z.number(),
  results: z.array(z.unknown()),
})

export interface ItunesSearchResponse {
  resultCount: number
  /** Results in API order. Entries that don't parse as apps are kept as null to preserve positions. */
  results: Array<ItunesApp | null>
  fetchedAt: Date
}

export interface ItunesClientOptions {
  fetchImpl?: typeof fetch
  limiter?: MinIntervalRateLimiter
  logger?: Logger
  timeoutMs?: number
  retries?: number
  baseDelayMs?: number
  maxDelayMs?: number
  sleep?: RetryOptions["sleep"]
  now?: () => Date
}

function failureToResult<T>(failure: FetchFailure): ProviderResult<T> {
  switch (failure.kind) {
    case "timeout":
      return fail("timeout", `Apple did not respond within ${failure.timeoutMs / 1000}s`, true)
    case "network":
      return fail("network", `Network error contacting Apple: ${failure.message}`, true)
    case "http":
      // Apple's public endpoints answer throttled clients with 429, sometimes 403.
      if (failure.status === 429 || failure.status === 403) {
        return fail("rate_limited", `Apple rate-limited the request (HTTP ${failure.status})`, true)
      }
      return fail("bad_response", `Apple returned HTTP ${failure.status}`, failure.status >= 500)
  }
}

export class ItunesClient {
  private readonly limiter: MinIntervalRateLimiter
  private readonly logger: Logger
  private readonly now: () => Date

  constructor(private readonly options: ItunesClientOptions = {}) {
    this.limiter =
      options.limiter ?? getSharedRateLimiter("itunes.apple.com", ITUNES_MIN_INTERVAL_MS)
    this.logger = options.logger ?? createLogger("itunes")
    this.now = options.now ?? (() => new Date())
  }

  async search(params: { term: string; country: string; limit?: number }) {
    const url = new URL("/search", ITUNES_BASE_URL)
    url.searchParams.set("term", params.term)
    url.searchParams.set("country", params.country.toLowerCase())
    url.searchParams.set("entity", "software")
    url.searchParams.set(
      "limit",
      String(Math.min(params.limit ?? ITUNES_MAX_LIMIT, ITUNES_MAX_LIMIT)),
    )
    return this.request(url)
  }

  async lookup(params: { id: string; country: string }): Promise<ProviderResult<ItunesApp | null>> {
    const url = new URL("/lookup", ITUNES_BASE_URL)
    url.searchParams.set("id", params.id)
    url.searchParams.set("country", params.country.toLowerCase())
    const result = await this.request(url)
    if (!result.ok) return result
    return ok(result.data.results.find((r): r is ItunesApp => r !== null) ?? null)
  }

  private async request(url: URL): Promise<ProviderResult<ItunesSearchResponse>> {
    const startedAt = Date.now()
    const outcome = await fetchWithRetry(
      url.toString(),
      { headers: { Accept: "application/json" }, cache: "no-store" },
      {
        retries: this.options.retries ?? 3,
        baseDelayMs: this.options.baseDelayMs ?? 2_000,
        maxDelayMs: this.options.maxDelayMs ?? 30_000,
        timeoutMs: this.options.timeoutMs ?? 20_000,
        schedule: (attempt) => this.limiter.schedule(attempt),
        fetchImpl: this.options.fetchImpl,
        sleep: this.options.sleep,
        logger: this.logger,
        onRetry: ({ status, delayMs }) => {
          if (status === 429 || status === 403) this.limiter.penalize(delayMs)
        },
      },
    )

    const path = url.pathname
    if (!outcome.ok) {
      this.logger.warn("request_failed", {
        path,
        failure: outcome.failure,
        attempts: outcome.attempts,
      })
      return failureToResult(outcome.failure)
    }

    let body: unknown
    try {
      body = await outcome.response.json()
    } catch {
      return fail("bad_response", "Apple returned a response that is not JSON")
    }

    const envelope = envelopeSchema.safeParse(body)
    if (!envelope.success) {
      return fail("bad_response", "Apple returned an unexpected response shape")
    }

    const results = envelope.data.results.map((raw) => {
      const parsed = itunesAppSchema.safeParse(raw)
      return parsed.success ? parsed.data : null
    })

    this.logger.debug("request_ok", {
      path,
      resultCount: envelope.data.resultCount,
      attempts: outcome.attempts,
      ms: Date.now() - startedAt,
    })

    return ok({ resultCount: envelope.data.resultCount, results, fetchedAt: this.now() })
  }
}
