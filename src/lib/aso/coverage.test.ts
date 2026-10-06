import { describe, expect, it } from "vitest"
import {
  analyzeKeywordCoverage,
  describeCoverageSummary,
  isCoveredInPrimaryFields,
  singularize,
} from "./coverage"

const hunterVault = {
  title: "Budget Tracker: Hunter Vault",
  subtitle: "Gamified expense tracker RPG",
  keywordField: "budget,game,money,planner,savings,finance",
  description:
    "Hunter Vault turns your personal finance journey into an RPG. Pay down debt and level up.",
}

function fieldMatch(keyword: string, field: string, metadata = hunterVault) {
  return analyzeKeywordCoverage(keyword, metadata, "ios").fields.find((f) => f.field === field)!
    .match
}

describe("analyzeKeywordCoverage", () => {
  it("detects an exact phrase in the title", () => {
    const coverage = analyzeKeywordCoverage("budget tracker", hunterVault, "ios")
    expect(fieldMatch("budget tracker", "title")).toBe("exact_phrase")
    expect(coverage.summary).toEqual({
      kind: "targeted",
      field: "title",
      label: "Title",
      match: "exact_phrase",
    })
    expect(describeCoverageSummary(coverage.summary)).toBe("Title (exact phrase)")
  })

  it("is case, punctuation and diacritic insensitive", () => {
    expect(fieldMatch("BUDGET   tracker", "title")).toBe("exact_phrase")
    expect(
      analyzeKeywordCoverage("cafe budget", { title: "Café Budget!" }, "ios").fields[0]!.match,
    ).toBe("exact_phrase")
  })

  it("detects a subtitle phrase", () => {
    const coverage = analyzeKeywordCoverage("expense tracker", hunterVault, "ios")
    expect(coverage.summary).toMatchObject({ kind: "targeted", field: "subtitle" })
  })

  it("distinguishes all words (any order) from the exact phrase", () => {
    expect(fieldMatch("tracker budget", "title")).toBe("all_terms")
  })

  it("reports words spread across title, subtitle and keyword field (iOS)", () => {
    const coverage = analyzeKeywordCoverage("rpg savings planner", hunterVault, "ios")
    expect(coverage.combined).toEqual({ match: "all_terms", missingTerms: [] })
    expect(coverage.summary).toEqual({ kind: "combined" })
    expect(isCoveredInPrimaryFields(coverage)).toBe(true)
  })

  it("reports description-only coverage without treating it as targeted", () => {
    const coverage = analyzeKeywordCoverage("debt", hunterVault, "ios")
    expect(coverage.summary).toEqual({ kind: "description_only" })
    expect(isCoveredInPrimaryFields(coverage)).toBe(false)
  })

  it("reports not targeted when no field contains the words", () => {
    const coverage = analyzeKeywordCoverage("habit streaks", hunterVault, "ios")
    expect(coverage.summary).toEqual({ kind: "not_targeted" })
  })

  it("reports partial coverage", () => {
    const coverage = analyzeKeywordCoverage("budget calculator", hunterVault, "ios")
    expect(fieldMatch("budget calculator", "title")).toBe("partial")
    expect(coverage.summary).toEqual({ kind: "partial" })
    expect(coverage.fields[0]!.missingTerms).toEqual(["calculator"])
  })

  it("ignores stop words when matching all words", () => {
    expect(fieldMatch("tracker for budget", "title")).toBe("all_terms")
  })

  it("matches simple plural variants and reports them", () => {
    const coverage = analyzeKeywordCoverage("budgets", hunterVault, "ios")
    const title = coverage.fields.find((f) => f.field === "title")!
    expect(title.match).toBe("all_terms")
    expect(title.variantTerms).toEqual(["budgets"])
  })

  it("marks empty fields and reports missing metadata", () => {
    const coverage = analyzeKeywordCoverage("budget", {}, "ios")
    expect(coverage.fields.every((f) => f.match === "empty")).toBe(true)
    expect(coverage.summary).toEqual({ kind: "no_metadata" })
  })

  it("uses Android field names and has no keyword field", () => {
    const coverage = analyzeKeywordCoverage(
      "budget",
      { title: "Budget", subtitle: "Plan money" },
      "android",
    )
    expect(coverage.fields.map((f) => f.label)).toEqual([
      "Title",
      "Short description",
      "Full description",
    ])
    expect(coverage.combined).toBeNull()
  })
})

describe("singularize", () => {
  it("handles common plural forms conservatively", () => {
    expect(singularize("budgets")).toBe("budget")
    expect(singularize("categories")).toBe("category")
    expect(singularize("glass")).toBe("glass")
    expect(singularize("bus")).toBe("bus")
  })
})
