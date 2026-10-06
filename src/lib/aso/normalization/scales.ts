/**
 * Scale normalization. Every scoring input is converted to a 0–1 value before it is
 * weighted. Each function returns `null` for missing or non-finite input so callers
 * can distinguish "unknown" from "zero".
 */

export function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

/** Apple relative popularity (1–100) → 0–1. */
export function normalizePopularity(score: number | null | undefined): number | null {
  return finite(score) ? clamp01(score / 100) : null
}

/** User-assigned relevance (1–10) → 0–1. */
export function normalizeRelevance(score: number | null | undefined): number | null {
  return finite(score) ? clamp01(score / 10) : null
}

/** Estimated difficulty (0–100) → 0–1. */
export function normalizeDifficulty(score: number | null | undefined): number | null {
  return finite(score) ? clamp01(score / 100) : null
}

/** 0–1 → integer 0–100. */
export function toScore100(value: number): number {
  return Math.round(clamp01(value) * 100)
}

/** Rounds to a fixed number of decimals without floating-point artifacts. */
export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round((value + Number.EPSILON) * factor) / factor
}

/** Linear interpolation across sorted [x, y] anchor points; clamps outside the range. */
export function interpolate(anchors: ReadonlyArray<readonly [number, number]>, x: number): number {
  const first = anchors[0]
  const last = anchors[anchors.length - 1]
  if (!first || !last) throw new Error("interpolate requires at least one anchor")
  if (x <= first[0]) return first[1]
  if (x >= last[0]) return last[1]
  for (let i = 1; i < anchors.length; i++) {
    const right = anchors[i]!
    const left = anchors[i - 1]!
    if (x <= right[0]) {
      const t = (x - left[0]) / (right[0] - left[0])
      return left[1] + t * (right[1] - left[1])
    }
  }
  return last[1]
}
