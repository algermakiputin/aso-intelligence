import { describe, expect, it, vi } from "vitest"
import {
  backoffDelay,
  fetchWithRetry,
  isRetryableStatus,
  parseRetryAfter,
} from "./fetch-with-retry"
import { MinIntervalRateLimiter } from "./rate-limiter"

const noSleep = vi.fn(async () => {})
const opts = {
  retries: 3,
  baseDelayMs: 100,
  maxDelayMs: 1_000,
  timeoutMs: 1_000,
  sleep: noSleep,
  random: () => 0.5,
}

function responses(...statuses: Array<number | Error>) {
  const queue = [...statuses]
  return vi.fn(async () => {
    const next = queue.shift()
    if (next instanceof Error) throw next
    return new Response(JSON.stringify({ ok: true }), { status: next ?? 200 })
  })
}

describe("fetchWithRetry", () => {
  it("returns the first successful response", async () => {
    const fetchImpl = responses(200)
    const result = await fetchWithRetry("https://x.test", {}, { ...opts, fetchImpl })
    expect(result).toMatchObject({ ok: true, attempts: 1 })
  })

  it("retries 429 and 5xx, then succeeds", async () => {
    const fetchImpl = responses(429, 503, 200)
    const result = await fetchWithRetry("https://x.test", {}, { ...opts, fetchImpl })
    expect(result).toMatchObject({ ok: true, attempts: 3 })
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it("does not retry other 4xx responses", async () => {
    const fetchImpl = responses(404)
    const result = await fetchWithRetry("https://x.test", {}, { ...opts, fetchImpl })
    expect(result).toEqual({
      ok: false,
      failure: { kind: "http", status: 404, retryAfterMs: null },
      attempts: 1,
    })
  })

  it("retries network errors and reports the last failure", async () => {
    const fetchImpl = responses(
      new TypeError("fetch failed"),
      new TypeError("fetch failed"),
      new TypeError("fetch failed"),
      new TypeError("fetch failed"),
    )
    const result = await fetchWithRetry("https://x.test", {}, { ...opts, fetchImpl })
    expect(result).toMatchObject({ ok: false, failure: { kind: "network" }, attempts: 4 })
  })

  it("maps aborts to timeouts", async () => {
    const timeout = Object.assign(new Error("timed out"), { name: "TimeoutError" })
    const fetchImpl = responses(timeout, 200)
    const result = await fetchWithRetry("https://x.test", {}, { ...opts, fetchImpl })
    expect(result).toMatchObject({ ok: true, attempts: 2 })
  })

  it("stops when Retry-After exceeds the delay budget", async () => {
    const fetchImpl = vi.fn(
      async () => new Response("", { status: 429, headers: { "retry-after": "120" } }),
    )
    const result = await fetchWithRetry("https://x.test", {}, { ...opts, fetchImpl })
    expect(result).toMatchObject({
      ok: false,
      failure: { kind: "http", status: 429, retryAfterMs: 120_000 },
      attempts: 1,
    })
  })

  it("waits at least Retry-After before retrying", async () => {
    const sleep = vi.fn(async () => {})
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 429, headers: { "retry-after": "0.8" } }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
    await fetchWithRetry("https://x.test", {}, { ...opts, fetchImpl, sleep })
    expect(sleep).toHaveBeenCalledWith(800)
  })

  it("runs each attempt through the scheduler", async () => {
    let scheduled = 0
    const schedule = <T>(attempt: () => Promise<T>) => {
      scheduled++
      return attempt()
    }
    await fetchWithRetry(
      "https://x.test",
      {},
      { ...opts, fetchImpl: responses(500, 200), schedule },
    )
    expect(scheduled).toBe(2)
  })
})

describe("retry helpers", () => {
  it("parses Retry-After seconds and dates", () => {
    expect(parseRetryAfter("5")).toBe(5_000)
    expect(parseRetryAfter(null)).toBeNull()
    expect(
      parseRetryAfter("Mon, 05 Oct 2026 12:00:10 GMT", Date.parse("2026-10-05T12:00:00Z")),
    ).toBe(10_000)
    expect(parseRetryAfter("soon")).toBeNull()
  })

  it("classifies retryable statuses", () => {
    expect(isRetryableStatus(429)).toBe(true)
    expect(isRetryableStatus(503)).toBe(true)
    expect(isRetryableStatus(501)).toBe(false)
    expect(isRetryableStatus(400)).toBe(false)
  })

  it("grows backoff exponentially with jitter and caps it", () => {
    expect(backoffDelay(1, 1_000, 30_000, () => 0)).toBe(500)
    expect(backoffDelay(1, 1_000, 30_000, () => 1)).toBe(1_000)
    expect(backoffDelay(3, 1_000, 30_000, () => 1)).toBe(4_000)
    expect(backoffDelay(10, 1_000, 30_000, () => 1)).toBe(30_000)
  })
})

describe("MinIntervalRateLimiter", () => {
  it("spaces task start times and serializes execution", async () => {
    let clock = 0
    const starts: number[] = []
    const limiter = new MinIntervalRateLimiter(
      3_000,
      () => clock,
      async (ms) => {
        clock += ms
      },
    )
    await Promise.all([1, 2, 3].map(() => limiter.schedule(async () => void starts.push(clock))))
    expect(starts).toEqual([0, 3_000, 6_000])
  })

  it("pushes the next slot back when penalized", async () => {
    let clock = 0
    const limiter = new MinIntervalRateLimiter(
      1_000,
      () => clock,
      async (ms) => void (clock += ms),
    )
    await limiter.schedule(async () => {})
    limiter.penalize(10_000)
    let startedAt = -1
    await limiter.schedule(async () => void (startedAt = clock))
    expect(startedAt).toBe(10_000)
  })

  it("keeps working after a task fails", async () => {
    const limiter = new MinIntervalRateLimiter(0)
    await expect(limiter.schedule(async () => Promise.reject(new Error("boom")))).rejects.toThrow(
      "boom",
    )
    await expect(limiter.schedule(async () => "ok")).resolves.toBe("ok")
  })
})
