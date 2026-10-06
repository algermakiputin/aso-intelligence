import { z } from "zod"
import { PLATFORMS } from "@/types/aso"

export const platformSchema = z.enum(PLATFORMS, { message: "Choose a platform" })

export const countryCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, "Use a two-letter country code, e.g. US")

/** Normalizes "EN-us" → "en-US"; script subtags keep title case ("zh-hans" → "zh-Hans"). */
export function normalizeLanguageTag(tag: string): string {
  const [language = "", ...rest] = tag.trim().replace(/_/g, "-").split("-")
  const parts = rest.map((part) =>
    part.length === 2
      ? part.toUpperCase()
      : part.length === 4
        ? part[0]!.toUpperCase() + part.slice(1).toLowerCase()
        : part,
  )
  return [language.toLowerCase(), ...parts].join("-")
}

export const languageSchema = z
  .string()
  .trim()
  .transform(normalizeLanguageTag)
  .pipe(
    z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/, "Use a language code, e.g. en or en-GB"),
  )

export const uuidSchema = z.uuid({ message: "Invalid id" })

export const relevanceSchema = z.coerce.number().int().min(1).max(10)

/** Normalizes user/store text for storage and comparison: LF line endings, trimmed. */
export function normalizeText(value: string): string {
  // Browsers submit textarea values with CRLF line endings; stores use LF.
  return value.replace(/\r\n?/g, "\n").trim()
}

/** Reads a FormData entry as normalized text ("" when absent). */
export function formString(formData: FormData, key: string): string {
  const value = formData.get(key)
  return typeof value === "string" ? normalizeText(value) : ""
}

export function formOptionalString(formData: FormData, key: string): string | undefined {
  const value = formString(formData, key)
  return value === "" ? undefined : value
}

export function formBoolean(formData: FormData, key: string): boolean {
  const value = formData.get(key)
  return value === "on" || value === "true" || value === "1"
}
