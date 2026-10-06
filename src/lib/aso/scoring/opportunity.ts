/**
 * Opportunity Score. Our own documented heuristic, not an industry standard.
 *
 * A strategy turns a keyword's inputs into a 0–100 score plus a per-component breakdown,
 * so the UI can always explain where a number came from. Strategies are replaceable:
 * a new formula is a new strategy with a new id, never an edit to an existing one.
 *
 * opportunity_v1:
 *   score = 100 × Σ(weightᵢ × valueᵢ) / Σ(weightᵢ)   over available components
 *
 *   popularity       0.30   popularity / 100            (Apple relative popularity)
 *   relevance        0.30   relevance / 10              (user-assigned, required)
 *   rankOpportunity  0.25   see rank-opportunity.ts     (estimated rank headroom)
 *   ease             0.15   1 − difficulty / 100        (estimated difficulty)
 *
 * When inputs are missing the remaining weights are renormalized, as long as they cover
 * at least `minCoverage` of the total weight; the result is then flagged `partial`.
 */

import {
  clamp01,
  normalizeDifficulty,
  normalizePopularity,
  normalizeRelevance,
} from "../normalization/scales"
import type { RankValue } from "../rank"
import { rankOpportunity } from "./rank-opportunity"

export type OpportunityComponentKey = "popularity" | "relevance" | "rankOpportunity" | "ease"

export interface OpportunityInputs {
  /** Apple relative popularity, 0–100. */
  popularity: number | null
  /** User-assigned relevance, 1–10. */
  relevance: number | null
  /** Latest estimated rank. */
  rank: RankValue | null
  /** Estimated difficulty, 0–100. */
  difficulty: number | null
}

export interface OpportunityComponent {
  key: OpportunityComponentKey
  label: string
  weight: number
  /** Normalized 0–1 input, or null when the input is missing. */
  value: number | null
  /** Points contributed to the final 0–100 score (after renormalization). */
  points: number | null
}

export type OpportunityStatus = "complete" | "partial" | "insufficient_data"

export interface OpportunityResult {
  strategyId: string
  status: OpportunityStatus
  /** Integer 0–100; null when status is insufficient_data. */
  score: number | null
  components: OpportunityComponent[]
  missing: OpportunityComponentKey[]
  /** Share of total weight backed by real inputs, 0–1. */
  coverage: number
}

export interface OpportunityStrategy {
  id: string
  name: string
  description: string
  compute(inputs: OpportunityInputs): OpportunityResult
}

export const OPPORTUNITY_COMPONENT_LABELS: Record<OpportunityComponentKey, string> = {
  popularity: "Popularity",
  relevance: "Relevance",
  rankOpportunity: "Rank opportunity",
  ease: "Ease (1 − difficulty)",
}

interface WeightedStrategyConfig {
  id: string
  name: string
  description: string
  weights: Record<OpportunityComponentKey, number>
  required: OpportunityComponentKey[]
  minCoverage: number
}

const COMPONENT_ORDER: OpportunityComponentKey[] = [
  "popularity",
  "relevance",
  "rankOpportunity",
  "ease",
]

function normalizedInputs(
  inputs: OpportunityInputs,
): Record<OpportunityComponentKey, number | null> {
  const difficulty = normalizeDifficulty(inputs.difficulty)
  return {
    popularity: normalizePopularity(inputs.popularity),
    relevance: normalizeRelevance(inputs.relevance),
    rankOpportunity: inputs.rank ? rankOpportunity(inputs.rank) : null,
    ease: difficulty === null ? null : 1 - difficulty,
  }
}

export function createWeightedStrategy(config: WeightedStrategyConfig): OpportunityStrategy {
  const totalWeight = COMPONENT_ORDER.reduce((sum, key) => sum + config.weights[key], 0)

  return {
    id: config.id,
    name: config.name,
    description: config.description,
    compute(inputs) {
      const values = normalizedInputs(inputs)
      const available = COMPONENT_ORDER.filter((key) => values[key] !== null)
      const missing = COMPONENT_ORDER.filter((key) => values[key] === null)
      const availableWeight = available.reduce((sum, key) => sum + config.weights[key], 0)
      const coverage = totalWeight > 0 ? availableWeight / totalWeight : 0

      const insufficient =
        config.required.some((key) => values[key] === null) ||
        coverage + 1e-9 < config.minCoverage ||
        availableWeight <= 0

      const components: OpportunityComponent[] = COMPONENT_ORDER.map((key) => {
        const value = values[key]
        const points =
          insufficient || value === null
            ? null
            : (100 * config.weights[key] * clamp01(value)) / availableWeight
        return {
          key,
          label: OPPORTUNITY_COMPONENT_LABELS[key],
          weight: config.weights[key],
          value,
          points,
        }
      })

      if (insufficient) {
        return {
          strategyId: config.id,
          status: "insufficient_data",
          score: null,
          components,
          missing,
          coverage,
        }
      }

      const raw = components.reduce((sum, c) => sum + (c.points ?? 0), 0)
      return {
        strategyId: config.id,
        status: missing.length === 0 ? "complete" : "partial",
        score: Math.round(Math.min(100, Math.max(0, raw))),
        components,
        missing,
        coverage,
      }
    },
  }
}

export const OPPORTUNITY_V1 = createWeightedStrategy({
  id: "opportunity_v1",
  name: "Opportunity Score v1",
  description:
    "Weighted blend of popularity (30%), relevance (30%), rank opportunity (25%) and ease (15%), normalized to 0–100.",
  weights: { popularity: 0.3, relevance: 0.3, rankOpportunity: 0.25, ease: 0.15 },
  required: ["relevance"],
  minCoverage: 0.55,
})

export const DEFAULT_OPPORTUNITY_STRATEGY: OpportunityStrategy = OPPORTUNITY_V1

export function computeOpportunity(
  inputs: OpportunityInputs,
  strategy: OpportunityStrategy = DEFAULT_OPPORTUNITY_STRATEGY,
): OpportunityResult {
  return strategy.compute(inputs)
}

export type OpportunityTier = "high" | "medium" | "low"

export function opportunityTier(score: number): OpportunityTier {
  if (score >= 65) return "high"
  if (score >= 40) return "medium"
  return "low"
}

export function describeMissingInputs(missing: OpportunityComponentKey[]): string {
  if (missing.length === 0) return ""
  const labels = missing.map((key) =>
    key === "ease" ? "difficulty" : key === "rankOpportunity" ? "rank" : key,
  )
  return `Missing ${labels.join(", ")}`
}
