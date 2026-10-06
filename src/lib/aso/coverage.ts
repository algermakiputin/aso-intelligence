/**
 * Metadata coverage: does a tracked keyword appear in the listing's metadata?
 *
 * Reports coverage per field only. It deliberately makes no claim about how much each
 * field contributes to ranking; it says where the words are, not what they're worth.
 *
 * Matching is case-, diacritic- and punctuation-insensitive. Common stop words are
 * ignored when deciding whether "all words" are present. A simple plural variant
 * (budget ↔ budgets, category ↔ categories) counts as a variant match.
 */

import type { Platform } from "@/types/aso"
import { tokenize } from "./normalization/text"

export type MetadataField = "title" | "subtitle" | "keyword_field" | "description"

export interface ListingMetadata {
  title?: string | null
  subtitle?: string | null
  keywordField?: string | null
  description?: string | null
}

export type FieldMatch = "exact_phrase" | "all_terms" | "partial" | "none" | "empty"

export interface FieldCoverage {
  field: MetadataField
  label: string
  match: FieldMatch
  matchedTerms: string[]
  missingTerms: string[]
  /** Terms matched only through a plural/singular variant. */
  variantTerms: string[]
}

export type CoverageSummary =
  | { kind: "targeted"; field: MetadataField; label: string; match: "exact_phrase" | "all_terms" }
  | { kind: "combined" }
  | { kind: "description_only" }
  | { kind: "partial" }
  | { kind: "not_targeted" }
  | { kind: "no_metadata" }

export interface KeywordCoverage {
  keyword: string
  /** Significant terms used for "all words" matching. */
  terms: string[]
  fields: FieldCoverage[]
  /** iOS only: are all terms present somewhere across title + subtitle + keyword field? */
  combined: { match: "all_terms" | "partial" | "none"; missingTerms: string[] } | null
  summary: CoverageSummary
}

export const STOP_WORDS: ReadonlySet<string> = new Set([
  "a",
  "an",
  "and",
  "at",
  "by",
  "for",
  "from",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
])

const FIELD_LABELS: Record<Platform, Partial<Record<MetadataField, string>>> = {
  ios: {
    title: "Title",
    subtitle: "Subtitle",
    keyword_field: "Keyword field",
    description: "Description",
  },
  android: {
    title: "Title",
    subtitle: "Short description",
    description: "Full description",
  },
}

const PRIMARY_FIELDS: MetadataField[] = ["title", "subtitle", "keyword_field"]

export function fieldsForPlatform(platform: Platform): MetadataField[] {
  return (Object.keys(FIELD_LABELS[platform]) as MetadataField[]).filter(Boolean)
}

export function fieldLabel(platform: Platform, field: MetadataField): string {
  return FIELD_LABELS[platform][field] ?? field
}

/** Simple English singularization used only for variant matching. */
export function singularize(token: string): string {
  if (token.length > 4 && token.endsWith("ies")) return `${token.slice(0, -3)}y`
  if (token.length > 3 && token.endsWith("s") && !token.endsWith("ss")) return token.slice(0, -1)
  return token
}

function fieldText(metadata: ListingMetadata, field: MetadataField): string | null | undefined {
  switch (field) {
    case "title":
      return metadata.title
    case "subtitle":
      return metadata.subtitle
    case "keyword_field":
      return metadata.keywordField
    case "description":
      return metadata.description
  }
}

function containsPhrase(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false
  outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer
    }
    return true
  }
  return false
}

interface TermMatch {
  matched: string[]
  missing: string[]
  variants: string[]
}

function matchTerms(terms: string[], tokens: string[]): TermMatch {
  const exact = new Set(tokens)
  const singular = new Set(tokens.map(singularize))
  const result: TermMatch = { matched: [], missing: [], variants: [] }
  for (const term of terms) {
    if (exact.has(term)) {
      result.matched.push(term)
    } else if (singular.has(singularize(term))) {
      result.matched.push(term)
      result.variants.push(term)
    } else {
      result.missing.push(term)
    }
  }
  return result
}

export function significantTerms(keywordTokens: string[]): string[] {
  const unique = [...new Set(keywordTokens)]
  const significant = unique.filter((t) => !STOP_WORDS.has(t))
  return significant.length > 0 ? significant : unique
}

export function analyzeKeywordCoverage(
  keyword: string,
  metadata: ListingMetadata,
  platform: Platform,
): KeywordCoverage {
  const keywordTokens = tokenize(keyword)
  const terms = significantTerms(keywordTokens)

  const fields: FieldCoverage[] = fieldsForPlatform(platform).map((field) => {
    const tokens = tokenize(fieldText(metadata, field))
    const label = fieldLabel(platform, field)
    if (tokens.length === 0) {
      return {
        field,
        label,
        match: "empty",
        matchedTerms: [],
        missingTerms: terms,
        variantTerms: [],
      }
    }
    const { matched, missing, variants } = matchTerms(terms, tokens)
    let match: FieldMatch
    if (containsPhrase(tokens, keywordTokens)) match = "exact_phrase"
    else if (missing.length === 0) match = "all_terms"
    else if (matched.length > 0) match = "partial"
    else match = "none"
    return {
      field,
      label,
      match,
      matchedTerms: matched,
      missingTerms: missing,
      variantTerms: variants,
    }
  })

  let combined: KeywordCoverage["combined"] = null
  if (platform === "ios") {
    const indexedTokens = PRIMARY_FIELDS.flatMap((f) => tokenize(fieldText(metadata, f)))
    if (indexedTokens.length > 0) {
      const { matched, missing } = matchTerms(terms, indexedTokens)
      combined = {
        match: missing.length === 0 ? "all_terms" : matched.length > 0 ? "partial" : "none",
        missingTerms: missing,
      }
    } else {
      combined = { match: "none", missingTerms: terms }
    }
  }

  return { keyword, terms, fields, combined, summary: summarize(fields, combined) }
}

function summarize(
  fields: FieldCoverage[],
  combined: KeywordCoverage["combined"],
): CoverageSummary {
  if (fields.every((f) => f.match === "empty")) return { kind: "no_metadata" }

  for (const field of PRIMARY_FIELDS) {
    const coverage = fields.find((f) => f.field === field)
    if (coverage && (coverage.match === "exact_phrase" || coverage.match === "all_terms")) {
      return { kind: "targeted", field, label: coverage.label, match: coverage.match }
    }
  }
  if (combined?.match === "all_terms") return { kind: "combined" }

  const description = fields.find((f) => f.field === "description")
  if (description && (description.match === "exact_phrase" || description.match === "all_terms")) {
    return { kind: "description_only" }
  }
  if (fields.some((f) => f.match === "partial") || combined?.match === "partial") {
    return { kind: "partial" }
  }
  return { kind: "not_targeted" }
}

/** True when every significant term is in a primary (non-description) field or across them. */
export function isCoveredInPrimaryFields(coverage: KeywordCoverage): boolean {
  return coverage.summary.kind === "targeted" || coverage.summary.kind === "combined"
}

export function describeCoverageSummary(summary: CoverageSummary): string {
  switch (summary.kind) {
    case "targeted":
      return summary.match === "exact_phrase" ? `${summary.label} (exact phrase)` : summary.label
    case "combined":
      return "Across title, subtitle and keyword field"
    case "description_only":
      return "Description only"
    case "partial":
      return "Some words present"
    case "not_targeted":
      return "Not targeted"
    case "no_metadata":
      return "No listing metadata"
  }
}
