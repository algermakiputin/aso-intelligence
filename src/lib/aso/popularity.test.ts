import { describe, expect, it } from "vitest"
import { comparePopularity, popularityState } from "./popularity"

describe("popularityState", () => {
  it("keeps every no-value case distinct", () => {
    expect(popularityState({ status: "measured" }, false)).toBe("available")
    expect(popularityState({ status: "below_threshold" }, true)).toBe("not_returned")
    expect(popularityState(null, false)).toBe("not_connected")
    expect(popularityState(null, true)).toBe("unavailable")
  })
})

describe("comparePopularity", () => {
  it("orders measured scores and puts not-returned below them without a value", () => {
    const values: Array<number | null> = [40, null, 3, 88]
    expect([...values].sort(comparePopularity)).toEqual([null, 3, 40, 88])
    expect(comparePopularity(null, null)).toBe(0)
  })
})
