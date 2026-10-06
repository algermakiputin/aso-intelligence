import { describe, expect, it } from "vitest"
import {
  clamp01,
  interpolate,
  normalizeDifficulty,
  normalizePopularity,
  normalizeRelevance,
  roundTo,
  toScore100,
} from "./scales"
import { normalizeForMatching, normalizeKeyword, parseKeywordList, slugify, tokenize } from "./text"

describe("normalizeKeyword", () => {
  it("lower-cases, trims and collapses whitespace", () => {
    expect(normalizeKeyword("  Budget   Tracker \n")).toBe("budget tracker")
  })

  it("strips surrounding quotes and zero-width characters", () => {
    expect(normalizeKeyword('"budget​ game"')).toBe("budget game")
  })

  it("keeps diacritics and inner punctuation", () => {
    expect(normalizeKeyword("Café Budget-App")).toBe("café budget-app")
  })

  it("applies NFKC so full-width characters collapse", () => {
    expect(normalizeKeyword("ＢＵＤＧＥＴ")).toBe("budget")
  })
})

describe("parseKeywordList", () => {
  it("splits on newlines, commas, semicolons and tabs", () => {
    expect(
      parseKeywordList("budget game\nmoney rpg, savings;debt payoff\tfinance").keywords,
    ).toEqual(["budget game", "money rpg", "savings", "debt payoff", "finance"])
  })

  it("de-duplicates after normalization and reports duplicates", () => {
    const parsed = parseKeywordList("Budget Game\nbudget game\n\n  BUDGET GAME ")
    expect(parsed.keywords).toEqual(["budget game"])
    expect(parsed.duplicates).toEqual(["budget game"])
  })

  it("rejects keywords longer than 100 characters", () => {
    const parsed = parseKeywordList(`ok\n${"x".repeat(101)}`)
    expect(parsed.keywords).toEqual(["ok"])
    expect(parsed.tooLong).toHaveLength(1)
  })
})

describe("normalizeForMatching / tokenize", () => {
  it("removes diacritics, punctuation and apostrophes", () => {
    expect(normalizeForMatching("Kid's Café: Budget-Planner!")).toBe("kids cafe budget planner")
  })

  it("tokenizes comma-separated keyword fields", () => {
    expect(tokenize("budget,game, money")).toEqual(["budget", "game", "money"])
    expect(tokenize(null)).toEqual([])
    expect(tokenize("  ")).toEqual([])
  })
})

describe("slugify", () => {
  it("creates URL-safe slugs", () => {
    expect(slugify("Hunter Vault")).toBe("hunter-vault")
    expect(slugify("Budget Quest: Money RPG!")).toBe("budget-quest-money-rpg")
    expect(slugify("!!!")).toBe("app")
  })
})

describe("scale normalization", () => {
  it("maps each input scale to 0–1", () => {
    expect(normalizePopularity(88)).toBeCloseTo(0.88)
    expect(normalizeRelevance(10)).toBe(1)
    expect(normalizeRelevance(5)).toBe(0.5)
    expect(normalizeDifficulty(25)).toBe(0.25)
  })

  it("returns null for missing or non-finite input instead of zero", () => {
    expect(normalizePopularity(null)).toBeNull()
    expect(normalizeRelevance(undefined)).toBeNull()
    expect(normalizeDifficulty(Number.NaN)).toBeNull()
  })

  it("clamps out-of-range values", () => {
    expect(normalizePopularity(150)).toBe(1)
    expect(normalizeDifficulty(-5)).toBe(0)
    expect(clamp01(Number.NaN)).toBe(0)
    expect(toScore100(1.2)).toBe(100)
  })

  it("rounds without floating point artifacts", () => {
    expect(roundTo(1.005, 2)).toBe(1.01)
    expect(roundTo(0.1 + 0.2, 1)).toBe(0.3)
  })

  it("interpolates between anchors and clamps outside them", () => {
    const anchors = [
      [0, 0],
      [10, 1],
    ] as const
    expect(interpolate(anchors, 5)).toBe(0.5)
    expect(interpolate(anchors, -1)).toBe(0)
    expect(interpolate(anchors, 20)).toBe(1)
  })
})
