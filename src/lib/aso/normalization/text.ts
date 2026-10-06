/**
 * Text normalization for keywords and listing metadata.
 *
 * Two distinct forms:
 * - `normalizeKeyword` is the canonical *stored* form of a tracked keyword. It keeps the
 *   user's characters (including diacritics and punctuation inside the phrase) but
 *   standardizes case and whitespace so duplicates collapse.
 * - `normalizeForMatching` is an aggressive *comparison* form used by the coverage
 *   analyzer: case-, diacritic- and punctuation-insensitive.
 */

export const MAX_KEYWORD_LENGTH = 100

const ZERO_WIDTH = /[​-‍⁠﻿]/g
const SURROUNDING_QUOTES = /^["'“”‘’`]+|["'“”‘’`]+$/g
const COMBINING_MARKS = /\p{M}+/gu
const APOSTROPHES = /['’`]/g
const NON_WORD = /[^\p{L}\p{N}]+/gu

export function normalizeKeyword(raw: string): string {
  return raw
    .normalize("NFKC")
    .replace(ZERO_WIDTH, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(SURROUNDING_QUOTES, "")
    .trim()
}

export interface ParsedKeywordList {
  /** Normalized, de-duplicated keywords in input order. */
  keywords: string[]
  /** Normalized entries that appeared more than once in the input. */
  duplicates: string[]
  /** Raw entries rejected as too long. */
  tooLong: string[]
}

/** Parses free text (one keyword per line, or comma/semicolon/tab separated). */
export function parseKeywordList(input: string): ParsedKeywordList {
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  const keywords: string[] = []
  const tooLong: string[] = []

  for (const part of input.split(/[\n\r,;\t]+/)) {
    const keyword = normalizeKeyword(part)
    if (!keyword) continue
    if (keyword.length > MAX_KEYWORD_LENGTH) {
      tooLong.push(part.trim())
      continue
    }
    if (seen.has(keyword)) {
      duplicates.add(keyword)
      continue
    }
    seen.add(keyword)
    keywords.push(keyword)
  }

  return { keywords, duplicates: [...duplicates], tooLong }
}

export function normalizeForMatching(text: string): string {
  return text
    .normalize("NFKD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(APOSTROPHES, "")
    .replace(NON_WORD, " ")
    .trim()
}

export function tokenize(text: string | null | undefined): string[] {
  if (!text) return []
  const normalized = normalizeForMatching(text)
  return normalized ? normalized.split(" ") : []
}

/** Converts a display name to a URL slug: "Hunter Vault" → "hunter-vault". */
export function slugify(name: string): string {
  const slug = normalizeForMatching(name).replace(/\s+/g, "-").slice(0, 80).replace(/-+$/, "")
  return slug || "app"
}
