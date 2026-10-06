/**
 * Storefronts and languages offered in pickers. Not a hard limit: the schema accepts any
 * ISO country code and BCP 47 tag; these are the common App Store / Play storefronts.
 */

export const STOREFRONT_COUNTRIES = [
  "US",
  "GB",
  "CA",
  "AU",
  "NZ",
  "IE",
  "DE",
  "FR",
  "ES",
  "IT",
  "NL",
  "BE",
  "AT",
  "CH",
  "SE",
  "NO",
  "DK",
  "FI",
  "PL",
  "PT",
  "CZ",
  "HU",
  "RO",
  "GR",
  "TR",
  "UA",
  "IL",
  "AE",
  "SA",
  "EG",
  "ZA",
  "NG",
  "KE",
  "IN",
  "PK",
  "SG",
  "MY",
  "ID",
  "PH",
  "TH",
  "VN",
  "JP",
  "KR",
  "CN",
  "HK",
  "TW",
  "BR",
  "MX",
  "AR",
  "CL",
  "CO",
  "PE",
] as const

export const LANGUAGES = [
  "en",
  "en-GB",
  "en-AU",
  "en-CA",
  "es",
  "es-MX",
  "fr",
  "fr-CA",
  "de",
  "it",
  "pt",
  "pt-BR",
  "nl",
  "sv",
  "no",
  "da",
  "fi",
  "pl",
  "cs",
  "hu",
  "ro",
  "el",
  "tr",
  "uk",
  "ru",
  "ar",
  "he",
  "hi",
  "id",
  "ms",
  "th",
  "vi",
  "ja",
  "ko",
  "zh-Hans",
  "zh-Hant",
  "fil",
] as const

const regionNames = new Intl.DisplayNames(["en"], { type: "region" })
const languageNames = new Intl.DisplayNames(["en"], { type: "language" })

export function countryName(code: string): string {
  try {
    return regionNames.of(code) ?? code
  } catch {
    return code
  }
}

export function languageName(tag: string): string {
  try {
    return languageNames.of(tag) ?? tag
  } catch {
    return tag
  }
}

/** Ensures the current value is always selectable even if it isn't in the common list. */
export function withValue<T extends string>(
  list: readonly T[],
  value: string | null | undefined,
): string[] {
  return value && !list.includes(value as T) ? [value, ...list] : [...list]
}
