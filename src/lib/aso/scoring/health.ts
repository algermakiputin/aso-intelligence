/**
 * ASO Health: a checklist of things we can actually verify, not a synthetic grade.
 * Each check passes, fails, or can't be evaluated yet. The dashboard reports
 * "N of M checks passing" with the list.
 */

export type HealthCheckStatus = "pass" | "fail" | "unknown"

export interface HealthCheck {
  id: string
  label: string
  status: HealthCheckStatus
  detail: string
}

export interface HealthInput {
  trackedKeywords: number
  keywordsWithRelevance: number
  /** Tracked keywords with a rank observation inside the freshness window. */
  keywordsCheckedRecently: number
  freshnessHours: number
  /** null when the app has no listing on the platform being evaluated. */
  listing: { hasTitle: boolean; hasSubtitle: boolean; hasKeywordField: boolean | null } | null
  /** Tracked keywords with relevance ≥ HIGH_RELEVANCE. */
  highRelevanceKeywords: number
  /** …of which every word appears in title / subtitle / keyword field. */
  highRelevanceCovered: number
  keywordsWithPopularity: number
}

export const MIN_TRACKED_KEYWORDS = 10
export const HIGH_RELEVANCE = 8
export const HIGH_RELEVANCE_COVERAGE_TARGET = 0.7

export interface HealthReport {
  checks: HealthCheck[]
  passed: number
  evaluated: number
}

export function evaluateAsoHealth(input: HealthInput): HealthReport {
  const checks: HealthCheck[] = []
  const tracked = input.trackedKeywords

  checks.push({
    id: "keyword_set",
    label: `Track at least ${MIN_TRACKED_KEYWORDS} keywords`,
    status: tracked >= MIN_TRACKED_KEYWORDS ? "pass" : "fail",
    detail: `${tracked} tracked`,
  })

  checks.push(
    tracked === 0
      ? {
          id: "relevance",
          label: "Relevance set for every keyword",
          status: "unknown",
          detail: "No tracked keywords",
        }
      : {
          id: "relevance",
          label: "Relevance set for every keyword",
          status: input.keywordsWithRelevance >= tracked ? "pass" : "fail",
          detail: `${input.keywordsWithRelevance} of ${tracked} assessed`,
        },
  )

  const days = Math.round(input.freshnessHours / 24)
  checks.push(
    tracked === 0
      ? {
          id: "freshness",
          label: `Rankings checked in the last ${days} days`,
          status: "unknown",
          detail: "No tracked keywords",
        }
      : {
          id: "freshness",
          label: `Rankings checked in the last ${days} days`,
          status: input.keywordsCheckedRecently >= tracked ? "pass" : "fail",
          detail: `${input.keywordsCheckedRecently} of ${tracked} up to date`,
        },
  )

  if (input.listing === null) {
    checks.push({
      id: "metadata",
      label: "Listing metadata recorded",
      status: "fail",
      detail: "No store listing",
    })
  } else {
    const missing: string[] = []
    if (!input.listing.hasTitle) missing.push("title")
    if (!input.listing.hasSubtitle) missing.push("subtitle")
    if (input.listing.hasKeywordField === false) missing.push("keyword field")
    checks.push({
      id: "metadata",
      label: "Listing metadata recorded",
      status: missing.length === 0 ? "pass" : "fail",
      detail:
        missing.length === 0
          ? "Title, subtitle and keywords recorded"
          : `Missing ${missing.join(", ")}`,
    })
  }

  checks.push(
    input.highRelevanceKeywords === 0
      ? {
          id: "coverage",
          label: "High-relevance keywords in title, subtitle or keyword field",
          status: "unknown",
          detail: `No keywords with relevance ≥ ${HIGH_RELEVANCE}`,
        }
      : {
          id: "coverage",
          label: "High-relevance keywords in title, subtitle or keyword field",
          status:
            input.highRelevanceCovered / input.highRelevanceKeywords >=
            HIGH_RELEVANCE_COVERAGE_TARGET
              ? "pass"
              : "fail",
          detail: `${input.highRelevanceCovered} of ${input.highRelevanceKeywords} covered (target ${Math.round(HIGH_RELEVANCE_COVERAGE_TARGET * 100)}%)`,
        },
  )

  checks.push({
    id: "popularity",
    label: "Popularity data available",
    status: input.keywordsWithPopularity > 0 ? "pass" : "fail",
    detail:
      input.keywordsWithPopularity > 0
        ? `${input.keywordsWithPopularity} keywords with popularity`
        : "Connect Apple Ads or record popularity manually",
  })

  const evaluated = checks.filter((c) => c.status !== "unknown").length
  const passed = checks.filter((c) => c.status === "pass").length
  return { checks, passed, evaluated }
}
