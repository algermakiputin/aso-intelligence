import { describe, expect, it } from "vitest"
import type { RankValue } from "../rank"
import { appStrength, difficultyLabel, estimateDifficulty } from "./difficulty"
import { evaluateAsoHealth, type HealthInput } from "./health"
import { estimateSearchVisibility } from "./visibility"

const ranked = (position: number): RankValue => ({ kind: "ranked", position })

describe("estimateDifficulty (serp_strength_v1)", () => {
  it("scores 0 when there are no competing results", () => {
    expect(estimateDifficulty([])).toEqual({ method: "serp_strength_v1", score: 0, sampleSize: 0 })
  })

  it("scores 100 when all ten slots hold apps at the reference strength", () => {
    const strong = Array.from({ length: 10 }, () => ({ ratingCount: 1_000_000 }))
    expect(estimateDifficulty(strong).score).toBe(100)
  })

  it("treats empty slots as zero so sparse result sets read as easier", () => {
    const strong = { ratingCount: 1_000_000 }
    const sparse = estimateDifficulty([strong, strong])
    const dense = estimateDifficulty(Array.from({ length: 10 }, () => strong))
    expect(sparse.score).toBeLessThan(dense.score)
    expect(sparse.sampleSize).toBe(2)
  })

  it("weights top positions more heavily", () => {
    const strongFirst = estimateDifficulty([{ ratingCount: 500_000 }, { ratingCount: 10 }])
    const strongSecond = estimateDifficulty([{ ratingCount: 10 }, { ratingCount: 500_000 }])
    expect(strongFirst.score).toBeGreaterThan(strongSecond.score)
  })

  it("uses a log scale for rating counts", () => {
    expect(appStrength(null)).toBe(0)
    expect(appStrength(0)).toBe(0)
    expect(appStrength(1_000)).toBeCloseTo(0.5, 1)
    expect(appStrength(10_000_000)).toBe(1)
  })

  it("labels difficulty bands", () => {
    expect(difficultyLabel(5)).toBe("Very low")
    expect(difficultyLabel(30)).toBe("Low")
    expect(difficultyLabel(50)).toBe("Medium")
    expect(difficultyLabel(70)).toBe("High")
    expect(difficultyLabel(92)).toBe("Very high")
  })
})

describe("estimateSearchVisibility", () => {
  it("needs keywords and popularity", () => {
    expect(estimateSearchVisibility([])).toMatchObject({ reason: "no_keywords" })
    expect(estimateSearchVisibility([{ popularity: null, rank: ranked(1) }])).toMatchObject({
      status: "insufficient_data",
      reason: "no_popularity",
    })
  })

  it("is 100 when every popular keyword ranks first", () => {
    const result = estimateSearchVisibility([
      { popularity: 50, rank: ranked(1) },
      { popularity: 20, rank: ranked(1) },
    ])
    expect(result).toEqual({ status: "ok", score: 100, keywordsUsed: 2, keywordsTotal: 2 })
  })

  it("weights by popularity and reciprocal rank", () => {
    const result = estimateSearchVisibility([
      { popularity: 80, rank: ranked(2) },
      { popularity: 20, rank: { kind: "unranked", searchDepth: 200, resultsSeen: 200 } },
    ])
    // (80 × 0.5 + 20 × 0) / 100 = 0.4
    expect(result).toMatchObject({ status: "ok", score: 40, keywordsUsed: 2 })
  })

  it("ignores keywords without popularity", () => {
    const result = estimateSearchVisibility([
      { popularity: 40, rank: ranked(4) },
      { popularity: null, rank: ranked(1) },
    ])
    expect(result).toMatchObject({ status: "ok", score: 25, keywordsUsed: 1, keywordsTotal: 2 })
  })
})

describe("evaluateAsoHealth", () => {
  const base: HealthInput = {
    trackedKeywords: 12,
    keywordsWithRelevance: 12,
    keywordsCheckedRecently: 12,
    freshnessHours: 72,
    listing: { hasTitle: true, hasSubtitle: true, hasKeywordField: true },
    highRelevanceKeywords: 5,
    highRelevanceCovered: 4,
    keywordsWithPopularity: 3,
  }

  it("passes every check for a well-maintained app", () => {
    const report = evaluateAsoHealth(base)
    expect(report.passed).toBe(report.checks.length)
    expect(report.evaluated).toBe(report.checks.length)
  })

  it("reports unknown instead of failing when there is nothing to evaluate", () => {
    const report = evaluateAsoHealth({
      ...base,
      trackedKeywords: 0,
      keywordsWithRelevance: 0,
      keywordsCheckedRecently: 0,
      highRelevanceKeywords: 0,
      highRelevanceCovered: 0,
    })
    const statuses = Object.fromEntries(report.checks.map((c) => [c.id, c.status]))
    expect(statuses).toMatchObject({
      keyword_set: "fail",
      relevance: "unknown",
      freshness: "unknown",
      coverage: "unknown",
    })
    expect(report.evaluated).toBeLessThan(report.checks.length)
  })

  it("explains missing metadata", () => {
    const report = evaluateAsoHealth({
      ...base,
      listing: { hasTitle: true, hasSubtitle: false, hasKeywordField: false },
    })
    const metadata = report.checks.find((c) => c.id === "metadata")!
    expect(metadata.status).toBe("fail")
    expect(metadata.detail).toBe("Missing subtitle, keyword field")
  })

  it("does not require a keyword field where the platform has none", () => {
    const report = evaluateAsoHealth({
      ...base,
      listing: { hasTitle: true, hasSubtitle: true, hasKeywordField: null },
    })
    expect(report.checks.find((c) => c.id === "metadata")!.status).toBe("pass")
  })
})
