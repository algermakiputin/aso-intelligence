import { describe, expect, it } from "vitest"
import { computeRankChange, type RankValue } from "@/lib/aso/rank"
import { computeOpportunity } from "@/lib/aso/scoring/opportunity"
import type { KeywordRow } from "../keywords/model"
import type { Listing } from "../listings/model"
import { summarizeOverview } from "./summary"

const now = new Date("2026-10-05T12:00:00Z")
const ranked = (position: number): RankValue => ({ kind: "ranked", position })

type KeywordOverrides = Omit<Partial<KeywordRow>, "popularity"> & {
  latest?: RankValue | null
  previous?: RankValue | null
  popularity?: number | null
}

function keyword(overrides: KeywordOverrides = {}): KeywordRow {
  const latest = overrides.latest ?? null
  const previous = overrides.previous ?? null
  const relevance = overrides.relevance ?? 8
  return {
    id: crypto.randomUUID(),
    appId: "app",
    keyword: overrides.keyword ?? "budget game",
    platform: "ios",
    country: "US",
    language: "en",
    tracked: overrides.tracked ?? true,
    isPriority: false,
    relevance,
    notes: null,
    createdAt: now.toISOString(),
    latestRank: latest
      ? {
          value: latest,
          checkedAt: "2026-10-05T10:00:00Z",
          source: "apple_itunes_search",
          confidence: "medium",
        }
      : null,
    previousRank: previous ? { value: previous, checkedAt: "2026-10-04T10:00:00Z" } : null,
    change: computeRankChange(previous, latest),
    popularity:
      overrides.popularity != null
        ? {
            status: "measured",
            score: overrides.popularity,
            source: "manual",
            measuredAt: now.toISOString(),
            granularity: "point",
            periodStart: null,
            periodEnd: null,
            genre: null,
          }
        : null,
    difficulty: null,
    recentRanks: [],
    opportunity: computeOpportunity({
      popularity: overrides.popularity ?? null,
      relevance,
      rank: latest,
      difficulty: null,
    }),
  }
}

const listing: Listing = {
  id: "l1",
  appId: "app",
  platform: "ios",
  externalAppId: "6761086056",
  packageOrBundleId: "com.hunter.vault",
  country: "US",
  language: "en",
  title: "Hunter Vault: Budget Game",
  subtitle: null,
  keywordField: null,
  description: null,
  developerName: null,
  primaryCategory: null,
  metadataSource: "manual",
  version: null,
  rating: null,
  ratingCount: null,
  storeUrl: null,
  lastSyncedAt: null,
  updatedAt: now.toISOString(),
}

describe("summarizeOverview", () => {
  it("reports waiting-for-data (null) rather than zero when nothing has been checked", () => {
    const summary = summarizeOverview(
      [keyword(), keyword({ keyword: "money rpg" })],
      [listing],
      now,
    )
    expect(summary.tracked).toBe(2)
    expect(summary.top10).toBeNull()
    expect(summary.top50).toBeNull()
    expect(summary.improved).toBeNull()
    expect(summary.declined).toBeNull()
    expect(summary.visibility.status).toBe("insufficient_data")
    expect(summary.lastCheckedAt).toBeNull()
  })

  it("counts top 10/50 and movement correctly (smaller rank = better)", () => {
    const summary = summarizeOverview(
      [
        keyword({ latest: ranked(4), previous: ranked(9) }), // improved
        keyword({ latest: ranked(46), previous: ranked(30) }), // declined
        keyword({ latest: ranked(120), previous: ranked(120) }), // unchanged
        keyword({ latest: { kind: "unranked", searchDepth: 200, resultsSeen: 200 } }), // no baseline
        keyword({ latest: ranked(2), tracked: false }), // untracked: excluded
      ],
      [listing],
      now,
    )
    expect(summary.tracked).toBe(4)
    expect(summary.top10).toBe(1)
    expect(summary.top50).toBe(2)
    expect(summary.improved).toBe(1)
    expect(summary.declined).toBe(1)
    expect(summary.comparable).toBe(3)
    expect(summary.distribution.find((d) => d.band === "unranked")!.count).toBe(1)
    expect(summary.movers[0]!.change).toEqual({ kind: "declined", positions: 16 })
  })

  it("doesn't count unprovable New/Lost transitions as movement", () => {
    const seen = (n: number): RankValue => ({ kind: "unranked", searchDepth: 200, resultsSeen: n })
    const summary = summarizeOverview(
      [
        keyword({ latest: seen(180), previous: ranked(195) }), // may still be at 195
        keyword({ latest: ranked(180), previous: seen(150) }), // may have been at 180 before
        keyword({ latest: seen(193), previous: ranked(35) }), // provably lost
        keyword({ latest: ranked(12), previous: seen(200) }), // provably new
      ],
      [listing],
      now,
    )
    expect(summary.improved).toBe(1)
    expect(summary.declined).toBe(1)
    expect(summary.movers.map((k) => k.change.kind)).toEqual(["entered", "dropped"])
  })

  it("only counts unranked keywords as outside the top 100 when 100+ results were seen", () => {
    const seen = (n: number): RankValue => ({ kind: "unranked", searchDepth: 200, resultsSeen: n })
    const summary = summarizeOverview(
      [
        keyword({ latest: ranked(150) }),
        keyword({ latest: seen(193) }),
        keyword({ latest: seen(60) }), // ">50": not provably outside the top 100
        keyword({ latest: seen(0) }), // "Not found"
      ],
      [listing],
      now,
    )
    expect(summary.outsideTop100).toBe(2)
    expect(summary.unrankedUnproven).toBe(2)
  })

  it("computes visibility only from keywords with popularity", () => {
    const summary = summarizeOverview(
      [keyword({ latest: ranked(2), popularity: 50 }), keyword({ latest: ranked(1) })],
      [listing],
      now,
    )
    expect(summary.visibility).toMatchObject({ status: "ok", score: 50, keywordsUsed: 1 })
  })

  it("feeds metadata coverage into the health checklist", () => {
    const summary = summarizeOverview(
      [
        keyword({ keyword: "budget game", relevance: 9 }),
        keyword({ keyword: "habit tracker", relevance: 9 }),
      ],
      [listing],
      now,
    )
    const coverage = summary.health.checks.find((c) => c.id === "coverage")!
    expect(coverage.detail).toBe("1 of 2 covered (target 70%)")
    expect(coverage.status).toBe("fail")
  })
})
