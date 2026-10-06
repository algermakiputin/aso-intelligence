import { describe, expect, it } from "vitest"
import {
  compareRankValues,
  describeRank,
  computeRankChange,
  formatRank,
  formatRankChange,
  isInTop,
  isProvablyOutsideTop,
  rankBand,
  rankChangeDirection,
  rankChangeSortValue,
  type RankValue,
  signedRankDelta,
  toRankValue,
} from "./rank"

const ranked = (position: number): RankValue => ({ kind: "ranked", position })
const beyond: RankValue = { kind: "unranked", searchDepth: 200, resultsSeen: 200 }
const notFound: RankValue = { kind: "unranked", searchDepth: 200, resultsSeen: 0 }
const seen = (n: number | null): RankValue => ({
  kind: "unranked",
  searchDepth: 200,
  resultsSeen: n,
})

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
    expect(formatRank(seen(193))).toBe(">100") // Apple often returns < 200 results for popular terms
    expect(formatRank(seen(149))).toBe(">100")
    expect(formatRank(seen(60))).toBe(">50")
    expect(formatRank(seen(7))).toBe(">7")
    // An unknown result count proves nothing, so it isn't shown as ">200".
    expect(formatRank(seen(null))).toBe("Not ranked")
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
    expect(change).toEqual({ kind: "entered", position: 35, outsideTop: 200 })
    expect(signedRankDelta(change)).toBeNull()
    expect(formatRankChange(change)).toBe("New")
    expect(rankChangeDirection(change)).toBe("up")
  })

  it("reports dropping out of the results without inventing a delta", () => {
    const change = computeRankChange(ranked(35), seen(193))
    expect(change).toEqual({ kind: "dropped", previousPosition: 35, outsideTop: 193 })
    expect(signedRankDelta(change)).toBeNull()
    expect(formatRankChange(change)).toBe("Lost")
    expect(rankChangeDirection(change)).toBe("down")
  })

  it("doesn't call it Lost when the unranked check didn't see as deep as the previous rank", () => {
    // Apple returned 180 results; the app may still be at 195.
    const change = computeRankChange(ranked(195), seen(180))
    expect(change).toEqual({ kind: "inconclusive", resultsSeen: 180 })
    expect(formatRankChange(change)).toBe("—")
    expect(rankChangeDirection(change)).toBe("none")
    expect(rankChangeSortValue(change)).toBe(0)
  })

  it("doesn't call it New when the earlier check didn't see as deep as the new rank", () => {
    // Only 150 results earlier; the app may have been at 180 then too.
    const change = computeRankChange(seen(150), ranked(180))
    expect(change).toEqual({ kind: "inconclusive", resultsSeen: 150 })
    expect(rankChangeSortValue(change)).toBe(0)
  })

  it("treats an empty or unknown result list as inconclusive, not as Lost or New", () => {
    expect(computeRankChange(ranked(35), notFound).kind).toBe("inconclusive")
    expect(computeRankChange(notFound, ranked(30)).kind).toBe("inconclusive")
    expect(computeRankChange(ranked(35), seen(null)).kind).toBe("inconclusive")
  })

  it("sorts New and Lost by the smallest movement the observations prove", () => {
    expect(rankChangeSortValue(computeRankChange(ranked(35), seen(193)))).toBe(-159)
    expect(rankChangeSortValue(computeRankChange(seen(200), ranked(3)))).toBe(198)
    expect(rankChangeSortValue(computeRankChange(ranked(50), ranked(20)))).toBe(30)
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

  it("only counts unranked as outside the top N when at least N results were seen", () => {
    expect(isProvablyOutsideTop(ranked(150), 100)).toBe(true)
    expect(isProvablyOutsideTop(ranked(100), 100)).toBe(false)
    expect(isProvablyOutsideTop(seen(193), 100)).toBe(true)
    expect(isProvablyOutsideTop(seen(60), 100)).toBe(false)
    expect(isProvablyOutsideTop(notFound, 100)).toBe(false)
    expect(isProvablyOutsideTop(seen(null), 100)).toBe(false)
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
