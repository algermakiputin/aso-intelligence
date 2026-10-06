/**
 * Estimated keyword difficulty (`serp_strength_v1`), 0–100.
 *
 * Derived from the apps competing in the same search results (our own app excluded).
 * An app's "strength" is its rating count on a log scale; strong apps near the top
 * count more than strong apps further down. Empty slots count as zero, so search terms
 * with few results come out easy.
 *
 *   strengthᵢ  = min(1, log10(1 + ratingCountᵢ) / log10(1 + 1,000,000))
 *   weightᵢ    = 1 / √i            (i = competitor position 1…10)
 *   difficulty = 100 × Σ weightᵢ·strengthᵢ / Σ_{i=1..10} weightᵢ
 *
 * This is an estimate from public data, not an Apple metric.
 */

import { clamp01, roundTo } from "../normalization/scales"

export const DIFFICULTY_METHOD = "serp_strength_v1"
export const DIFFICULTY_SAMPLE_SIZE = 10
export const DIFFICULTY_REFERENCE_RATINGS = 1_000_000

export interface CompetingResult {
  /** Rating count; null when the store didn't report one (treated as 0). */
  ratingCount: number | null
}

export interface DifficultyEstimate {
  method: typeof DIFFICULTY_METHOD
  score: number
  sampleSize: number
}

export function appStrength(ratingCount: number | null): number {
  if (ratingCount === null || !Number.isFinite(ratingCount) || ratingCount <= 0) return 0
  return clamp01(Math.log10(1 + ratingCount) / Math.log10(1 + DIFFICULTY_REFERENCE_RATINGS))
}

/** @param competitors competing results in search order, own app already removed. */
export function estimateDifficulty(
  competitors: ReadonlyArray<CompetingResult>,
): DifficultyEstimate {
  const sample = competitors.slice(0, DIFFICULTY_SAMPLE_SIZE)
  let weighted = 0
  let totalWeight = 0
  for (let i = 1; i <= DIFFICULTY_SAMPLE_SIZE; i++) {
    const weight = 1 / Math.sqrt(i)
    totalWeight += weight
    const competitor = sample[i - 1]
    if (competitor) weighted += weight * appStrength(competitor.ratingCount)
  }
  return {
    method: DIFFICULTY_METHOD,
    score: roundTo((100 * weighted) / totalWeight, 1),
    sampleSize: sample.length,
  }
}

export type DifficultyLevel = "very_low" | "low" | "medium" | "high" | "very_high"

export const DIFFICULTY_LEVEL_LABELS: Record<DifficultyLevel, string> = {
  very_low: "Very low",
  low: "Low",
  medium: "Medium",
  high: "High",
  very_high: "Very high",
}

export function difficultyLevel(score: number): DifficultyLevel {
  if (score < 20) return "very_low"
  if (score < 40) return "low"
  if (score < 60) return "medium"
  if (score < 80) return "high"
  return "very_high"
}

export function difficultyLabel(score: number): string {
  return DIFFICULTY_LEVEL_LABELS[difficultyLevel(score)]
}
