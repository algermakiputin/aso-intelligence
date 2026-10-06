/**
 * Serializes tasks and spaces their start times at least `minIntervalMs` apart.
 * `penalize` pushes the next slot back, e.g. after a 429.
 *
 * Scope: one process. Multiple serverless instances each get their own limiter, so
 * scheduled collection should run from a single worker (see docs/ARCHITECTURE.md).
 */

export type Sleep = (ms: number) => Promise<void>

export const defaultSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export class MinIntervalRateLimiter {
  private nextSlotAt = 0
  private tail: Promise<unknown> = Promise.resolve()

  constructor(
    readonly minIntervalMs: number,
    private readonly now: () => number = Date.now,
    private readonly sleep: Sleep = defaultSleep,
  ) {}

  schedule<T>(task: () => Promise<T>): Promise<T> {
    const run = async () => {
      const wait = this.nextSlotAt - this.now()
      if (wait > 0) await this.sleep(wait)
      this.nextSlotAt = this.now() + this.minIntervalMs
      return task()
    }
    const result = this.tail.then(run, run)
    this.tail = result.catch(() => undefined)
    return result
  }

  penalize(ms: number): void {
    this.nextSlotAt = Math.max(this.nextSlotAt, this.now() + ms)
  }
}

const limiters = new Map<string, MinIntervalRateLimiter>()

/** Process-wide limiter per key (usually a host name). */
export function getSharedRateLimiter(key: string, minIntervalMs: number): MinIntervalRateLimiter {
  let limiter = limiters.get(key)
  if (!limiter) {
    limiter = new MinIntervalRateLimiter(minIntervalMs)
    limiters.set(key, limiter)
  }
  return limiter
}
