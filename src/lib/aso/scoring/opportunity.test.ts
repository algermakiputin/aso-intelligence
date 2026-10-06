import { describe, expect, it } from "vitest"
import type { RankValue } from "../rank"
import {
  computeOpportunity,
  createWeightedStrategy,
  describeAvailableInputs,
  missingInputReasons,
  OPPORTUNITY_V1,
  type OpportunityInputs,
  opportunityTier,
} from "./opportunity"
import { RANK_OPPORTUNITY_UNRANKED, rankOpportunity } from "./rank-opportunity"

const ranked = (position: number): RankValue => ({ kind: "ranked", position })
const unranked: RankValue = { kind: "unranked", searchDepth: 200, resultsSeen: 200 }

describe("rankOpportunity", () => {
  it("peaks in striking distance of the top 10", () => {
    expect(rankOpportunity(ranked(20))).toBe(1)
    expect(rankOpportunity(ranked(30))).toBe(1)
    expect(rankOpportunity(ranked(15))).toBeGreaterThan(rankOpportunity(ranked(5)))
  })

  it("is low at the very top where headroom is small", () => {
    expect(rankOpportunity(ranked(1))).toBe(0.05)
    expect(rankOpportunity(ranked(3))).toBeCloseTo(0.2)
  })

  it("interpolates between anchors", () => {
    // halfway between 50 (0.80) and 100 (0.55)
    expect(rankOpportunity(ranked(75))).toBeCloseTo(0.675)
  })

  it("handles deep and unranked positions without a numeric rank", () => {
    expect(rankOpportunity(ranked(150))).toBe(0.45)
    expect(rankOpportunity(unranked)).toBe(RANK_OPPORTUNITY_UNRANKED)
  })
})

describe("computeOpportunity (opportunity_v1)", () => {
  const full: OpportunityInputs = {
    popularity: 34,
    relevance: 10,
    rank: ranked(46),
    difficulty: 30,
  }

  it("computes the documented weighted formula", () => {
    // rankOpportunity(46) = 1.0 + (46-30)/(50-30) × (0.80-1.0) = 0.84
    const expected = 100 * (0.3 * 0.34 + 0.3 * 1.0 + 0.25 * 0.84 + 0.15 * (1 - 0.3))
    const result = computeOpportunity(full)
    expect(result.status).toBe("complete")
    expect(result.missing).toEqual([])
    expect(result.coverage).toBeCloseTo(1)
    expect(result.score).toBe(Math.round(expected))
  })

  it("exposes a breakdown whose points sum to the score", () => {
    const result = computeOpportunity(full)
    const sum = result.components.reduce((s, c) => s + (c.points ?? 0), 0)
    expect(Math.round(sum)).toBe(result.score)
  })

  it("returns 100 for perfect inputs and stays within 0–100", () => {
    const perfect = computeOpportunity({
      popularity: 100,
      relevance: 10,
      rank: ranked(20),
      difficulty: 0,
    })
    expect(perfect.score).toBe(100)
    const worst = computeOpportunity({
      popularity: 0,
      relevance: 1,
      rank: ranked(1),
      difficulty: 100,
    })
    expect(worst.score).toBeGreaterThanOrEqual(0)
    expect(worst.score).toBeLessThan(20)
  })

  it("renormalizes and flags a partial score when popularity is missing", () => {
    const result = computeOpportunity({ ...full, popularity: null })
    expect(result.status).toBe("partial")
    expect(result.missing).toEqual(["popularity"])
    expect(result.coverage).toBeCloseTo(0.7)
    const expected = (100 * (0.3 * 1.0 + 0.25 * 0.84 + 0.15 * 0.7)) / 0.7
    expect(result.score).toBe(Math.round(expected))
  })

  it("requires relevance", () => {
    const result = computeOpportunity({ ...full, relevance: null })
    expect(result.status).toBe("insufficient_data")
    expect(result.score).toBeNull()
    expect(result.missing).toContain("relevance")
  })

  it("requires minimum weight coverage", () => {
    // relevance (0.30) + ease (0.15) = 0.45 < 0.55
    const result = computeOpportunity({
      popularity: null,
      relevance: 8,
      rank: null,
      difficulty: 20,
    })
    expect(result.status).toBe("insufficient_data")
    expect(result.score).toBeNull()
  })

  it("accepts exactly the minimum coverage (relevance + rank = 0.55)", () => {
    const result = computeOpportunity({
      popularity: null,
      relevance: 8,
      rank: ranked(20),
      difficulty: null,
    })
    expect(result.status).toBe("partial")
    expect(result.score).not.toBeNull()
  })

  it("ranks a high-popularity, high-relevance, striking-distance keyword above a top-ranked one", () => {
    const striking = computeOpportunity({
      popularity: 60,
      relevance: 9,
      rank: ranked(18),
      difficulty: 40,
    })
    const alreadyTop = computeOpportunity({
      popularity: 60,
      relevance: 9,
      rank: ranked(1),
      difficulty: 40,
    })
    expect(striking.score!).toBeGreaterThan(alreadyTop.score!)
  })

  it("supports replacing the strategy", () => {
    const relevanceOnly = createWeightedStrategy({
      id: "relevance_only",
      name: "Relevance only",
      description: "test",
      weights: { popularity: 0, relevance: 1, rankOpportunity: 0, ease: 0 },
      required: ["relevance"],
      minCoverage: 0,
    })
    const result = computeOpportunity({ ...full, relevance: 7 }, relevanceOnly)
    expect(result.strategyId).toBe("relevance_only")
    expect(result.score).toBe(70)
  })

  it("identifies itself", () => {
    expect(computeOpportunity(full).strategyId).toBe(OPPORTUNITY_V1.id)
  })
})

describe("partial inputs", () => {
  const base = { relevance: 8, rank: ranked(20), difficulty: 40 }

  it("never treats missing popularity as zero", () => {
    const missing = computeOpportunity({ ...base, popularity: null })
    const zero = computeOpportunity({ ...base, popularity: 0 })
    expect(missing.status).toBe("partial")
    expect(missing.missing).toEqual(["popularity"])
    expect(zero.status).toBe("complete")
    expect(missing.score).not.toBe(zero.score)
    expect(missing.components.find((c) => c.key === "popularity")).toMatchObject({
      value: null,
      points: null,
    })
  })

  it("explains why each input is missing", () => {
    const result = computeOpportunity({
      popularity: null,
      relevance: 8,
      rank: ranked(20),
      difficulty: null,
    })
    expect(missingInputReasons(result, "not_returned")).toEqual({
      popularity: "popularity_not_returned",
      ease: "difficulty_not_estimated",
    })
    expect(missingInputReasons(result, "not_connected").popularity).toBe("popularity_not_connected")
    expect(missingInputReasons(result, "unavailable").popularity).toBe("popularity_unavailable")

    const noRelevance = computeOpportunity({
      popularity: 50,
      relevance: null,
      rank: null,
      difficulty: 30,
    })
    expect(missingInputReasons(noRelevance, "available")).toEqual({
      relevance: "relevance_not_set",
      rankOpportunity: "rank_not_checked",
    })
  })

  it("documents which inputs a score is based on", () => {
    const result = computeOpportunity({
      popularity: null,
      relevance: 8,
      rank: ranked(20),
      difficulty: null,
    })
    expect(describeAvailableInputs(result)).toBe(
      "Based on relevance and rank opportunity (55% of the weight).",
    )
  })
})

describe("opportunityTier", () => {
  it("buckets scores", () => {
    expect(opportunityTier(80)).toBe("high")
    expect(opportunityTier(50)).toBe("medium")
    expect(opportunityTier(10)).toBe("low")
  })
})
