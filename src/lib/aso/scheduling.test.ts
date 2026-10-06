import { describe, expect, it } from "vitest"
import { isKeywordDue, isStale, selectDueKeywords } from "./scheduling"

const now = new Date("2026-10-05T12:00:00Z")
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000)

const candidate = (
  id: string,
  lastCheckedHoursAgo: number | null,
  isPriority = false,
  tracked = true,
) => ({
  id,
  tracked,
  isPriority,
  lastCheckedAt: lastCheckedHoursAgo === null ? null : hoursAgo(lastCheckedHoursAgo),
})

describe("isKeywordDue", () => {
  it("checks never-checked keywords immediately", () => {
    expect(isKeywordDue(candidate("a", null), now, "scheduled")).toBe(true)
  })

  it("skips untracked keywords", () => {
    expect(isKeywordDue(candidate("a", null, false, false), now, "manual")).toBe(false)
  })

  it("checks priority keywords roughly daily and normal keywords every 2–3 days", () => {
    expect(isKeywordDue(candidate("p", 21, true), now, "scheduled")).toBe(true)
    expect(isKeywordDue(candidate("p", 19, true), now, "scheduled")).toBe(false)
    expect(isKeywordDue(candidate("n", 30), now, "scheduled")).toBe(false)
    expect(isKeywordDue(candidate("n", 61), now, "scheduled")).toBe(true)
  })

  it("lets manual refresh re-check anything older than 6 hours", () => {
    expect(isKeywordDue(candidate("n", 7), now, "manual")).toBe(true)
    expect(isKeywordDue(candidate("n", 2), now, "manual")).toBe(false)
  })
})

describe("selectDueKeywords", () => {
  it("orders never-checked, then priority, then oldest, and applies the limit", () => {
    const selected = selectDueKeywords(
      [
        candidate("old", 100),
        candidate("fresh", 1),
        candidate("new", null),
        candidate("prio", 25, true),
        candidate("older", 200),
      ],
      { now, mode: "scheduled", limit: 3 },
    )
    expect(selected.map((c) => c.id)).toEqual(["new", "prio", "older"])
  })
})

describe("isStale", () => {
  it("treats missing timestamps as stale", () => {
    expect(isStale(null, now, 72)).toBe(true)
    expect(isStale(hoursAgo(10), now, 72)).toBe(false)
    expect(isStale(hoursAgo(80), now, 72)).toBe(true)
  })
})
