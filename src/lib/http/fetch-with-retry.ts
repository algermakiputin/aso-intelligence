/**
 * fetch with per-attempt timeout, exponential backoff with jitter, and Retry-After
 * support. Returns a result union instead of throwing for HTTP/network failures.
 *
 * Retries: network errors, timeouts, 429 and 5xx (except 501). Other 4xx responses
 * are returned immediately. A Retry-After longer than `maxDelayMs` stops retrying so a
 * caller can surface "rate limited" rather than block for minutes.
 */

import type { Logger } from "@/lib/logger"
import { silentLogger } from "@/lib/logger"
import { defaultSleep, type Sleep } from "./rate-limiter"

export interface RetryOptions {
  retries: number
  baseDelayMs: number
  maxDelayMs: number
  timeoutMs: number
  /** Wraps each attempt, e.g. a rate limiter's schedule(). */
  schedule?: <T>(attempt: () => Promise<T>) => Promise<T>
  fetchImpl?: typeof fetch
  sleep?: Sleep
  random?: () => number
  logger?: Logger
  /** Called with the delay before each retry (useful to penalize a limiter on 429). */
  onRetry?: (info: { attempt: number; delayMs: number; reason: string; status?: number }) => void
}

export type FetchFailure =
  | { kind: "timeout"; timeoutMs: number }
  | { kind: "network"; message: string }
  | { kind: "http"; status: number; retryAfterMs: number | null }

export type FetchOutcome =
  | { ok: true; response: Response; attempts: number }
  | { ok: false; failure: FetchFailure; attempts: number }

export function parseRetryAfter(header: string | null, now: number = Date.now()): number | null {
  if (!header) return null
  const seconds = Number(header)
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000)
  const date = Date.parse(header)
  if (Number.isNaN(date)) return null
  return Math.max(0, date - now)
}

export function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status !== 501)
}

export function backoffDelay(
  attempt: number,
  base: number,
  max: number,
  random: () => number,
): number {
  const exponential = Math.min(max, base * 2 ** (attempt - 1))
  // "Equal jitter": half fixed, half random. Avoids synchronized retries.
  return Math.round(exponential / 2 + (random() * exponential) / 2)
}

const immediate = <T>(attempt: () => Promise<T>) => attempt()

export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  options: RetryOptions,
): Promise<FetchOutcome> {
  const fetchImpl = options.fetchImpl ?? fetch
  const sleep = options.sleep ?? defaultSleep
  const random = options.random ?? Math.random
  const schedule = options.schedule ?? immediate
  const logger = options.logger ?? silentLogger
  const maxAttempts = options.retries + 1

  let lastFailure: FetchFailure = { kind: "network", message: "No attempt made" }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let retryAfterMs: number | null = null
    try {
      const response = await schedule(() =>
        fetchImpl(url, { ...init, signal: AbortSignal.timeout(options.timeoutMs) }),
      )
      if (response.ok) return { ok: true, response, attempts: attempt }

      retryAfterMs = parseRetryAfter(response.headers.get("retry-after"))
      lastFailure = { kind: "http", status: response.status, retryAfterMs }
      // Release the connection; the body of an error response isn't needed.
      await response.body?.cancel().catch(() => undefined)

      if (!isRetryableStatus(response.status)) {
        return { ok: false, failure: lastFailure, attempts: attempt }
      }
      if (retryAfterMs !== null && retryAfterMs > options.maxDelayMs) {
        logger.warn("retry_after_exceeds_budget", { status: response.status, retryAfterMs })
        return { ok: false, failure: lastFailure, attempts: attempt }
      }
    } catch (error) {
      const name = error instanceof Error ? error.name : ""
      lastFailure =
        name === "TimeoutError" || name === "AbortError"
          ? { kind: "timeout", timeoutMs: options.timeoutMs }
          : { kind: "network", message: error instanceof Error ? error.message : String(error) }
    }

    if (attempt === maxAttempts) break

    const delayMs = Math.max(
      retryAfterMs ?? 0,
      backoffDelay(attempt, options.baseDelayMs, options.maxDelayMs, random),
    )
    const reason = lastFailure.kind === "http" ? `http_${lastFailure.status}` : lastFailure.kind
    logger.warn("retrying_request", { attempt, delayMs, reason })
    options.onRetry?.({
      attempt,
      delayMs,
      reason,
      status: lastFailure.kind === "http" ? lastFailure.status : undefined,
    })
    await sleep(delayMs)
  }

  return { ok: false, failure: lastFailure, attempts: maxAttempts }
}
