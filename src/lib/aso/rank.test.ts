import { describe, expect, it } from "vitest"
import {
  compareRankValues,
  describeRank,
  computeRankChange,
  formatRank,
  formatRankChange,
  isInTop,
  rankBand,
  rankChangeDirection,
  type RankValue,
  signedRankDelta,
  toRankValue,
} from "./rank"

const ranked = (position: number): RankValue => ({ kind: "ranked", position })
const beyond: RankValue = { kind: "unranked", searchDepth: 200, resultsSeen: 200 }
const notFound: RankValue = { kind: "unranked", searchDepth: 200, resultsSeen: 0 }

describe("toRankValue", () => {
  it("returns a ranked value for a positive rank", () => {
    expect(toRankValue({ rank: 46, resultCount: 200, searchDepth: 200 })).toEqual(ranked(46))
  })

  it("records how many results were seen when the app is absent", () => {
    expect(toRankValue({ rank: null, resultCount: 200, searchDepth: 200 })).toEqual(beyond)
    expect(toRankValue({ rank: null, resultCount: 193, searchDepth: 200 })).toEqual({
      kind: "unranked",
      searchDepth: 200,
      resultsSeen: 193,
    })
  })

  it("treats an empty result set as not found", () => {
    expect(toRankValue({ rank: null, resultCount: 0, searchDepth: 200 })).toEqual(notFound)
  })

  it("keeps an unknown result count unknown", () => {
    expect(toRankValue({ rank: null, resultCount: null, searchDepth: 200 })).toEqual({
      kind: "unranked",
      searchDepth: 200,
      resultsSeen: null,
    })
  })
})

describe("formatRank", () => {
  it("never turns unranked observations into numbers", () => {
    expect(formatRank(ranked(18))).toBe("18")
    expect(formatRank(beyond)).toBe(">200")
    expect(formatRank(notFound)).toBe("Not found")
  })

  it("only claims a threshold that the results actually seen support", () => {
    const seen = (n: number | null): RankValue => ({
      kind: "unranked",
      searchDepth: 200,
      resultsSeen: n,
    })
    expect(formatRank(seen(193))).toBe(">100") // Apple often returns < 200 results for popular terms
    expect(formatRank(seen(149))).toBe(">100")
    expect(formatRank(seen(60))).toBe(">50")
    expect(formatRank(seen(7))).toBe(">7")
    expect(formatRank(seen(null))).toBe(">200")
    expect(describeRank(seen(193))).toBe(
      "Not among the 193 results returned (so outside the top 100)",
    )
  })
})

describe("computeRankChange", () => {
  it("treats a smaller rank number as an improvement (50 → 20 = +30)", () => {
    const change = computeRankChange(ranked(50), ranked(20))
    expect(change).toEqual({ kind: "improved", positions: 30 })
    expect(signedRankDelta(change)).toBe(30)
    expect(formatRankChange(change)).toBe("+30")
    expect(rankChangeDirection(change)).toBe("up")
  })

  it("treats a larger rank number as a decline (20 → 50 = −30)", () => {
    const change = computeRankChange(ranked(20), ranked(50))
    expect(change).toEqual({ kind: "declined", positions: 30 })
    expect(signedRankDelta(change)).toBe(-30)
    expect(formatRankChange(change)).toBe("−30")
    expect(rankChangeDirection(change)).toBe("down")
  })

  it("reports no change for equal ranks", () => {
    const change = computeRankChange(ranked(7), ranked(7))
    expect(change).toEqual({ kind: "unchanged" })
    expect(signedRankDelta(change)).toBe(0)
  })

  it("reports entering the results without inventing a delta", () => {
    const change = computeRankChange(beyond, ranked(35))
    expect(change).toEqual({ kind: "entered", position: 35 })
    expect(signedRankDelta(change)).toBeNull()
    expect(formatRankChange(change)).toBe("New")
  })

  it("reports dropping out of the results without inventing a delta", () => {
    const change = computeRankChange(ranked(35), notFound)
    expect(change).toEqual({ kind: "dropped", previousPosition: 35 })
    expect(signedRankDelta(change)).toBeNull()
    expect(formatRankChange(change)).toBe("Lost")
    expect(rankChangeDirection(change)).toBe("down")
  })

  it("reports still unranked when both observations are unranked", () => {
    expect(computeRankChange(beyond, notFound)).toEqual({ kind: "still_unranked" })
  })

  it("has no baseline without a previous observation", () => {
    expect(computeRankChange(null, ranked(3))).toEqual({ kind: "no_baseline" })
    expect(computeRankChange(ranked(3), null)).toEqual({ kind: "no_baseline" })
  })
})

describe("rank bands", () => {
  it("assigns bands by position", () => {
    expect(rankBand(ranked(1))).toBe("top_3")
    expect(rankBand(ranked(10))).toBe("top_10")
    expect(rankBand(ranked(11))).toBe("top_50")
    expect(rankBand(ranked(100))).toBe("top_100")
    expect(rankBand(ranked(150))).toBe("beyond_100")
    expect(rankBand(beyond)).toBe("unranked")
  })

  it("checks top-N membership", () => {
    expect(isInTop(ranked(10), 10)).toBe(true)
    expect(isInTop(ranked(11), 10)).toBe(false)
    expect(isInTop(beyond, 10)).toBe(false)
    expect(isInTop(null, 10)).toBe(false)
  })
})

describe("compareRankValues", () => {
  it("sorts ranked ascending, then unranked, then never checked", () => {
    const values: Array<RankValue | null> = [null, beyond, ranked(40), ranked(2)]
    expect(values.sort(compareRankValues)).toEqual([ranked(2), ranked(40), beyond, null])
  })
})
