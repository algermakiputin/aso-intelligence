/**
 * Accept what people actually paste: a bare ID or a store URL.
 *   https://apps.apple.com/us/app/hunter-vault/id6761086056 → 6761086056
 *   https://play.google.com/store/apps/details?id=com.hunter.vault → com.hunter.vault
 */

export function parseAppStoreId(input: string): string | null {
  const value = input.trim()
  if (/^\d{5,12}$/.test(value)) return value
  const fromUrl = value.match(/\/id(\d{5,12})(?:[/?#]|$)/)
  return fromUrl?.[1] ?? null
}

const PACKAGE_NAME = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/

export function parsePlayPackage(input: string): string | null {
  const value = input.trim()
  if (PACKAGE_NAME.test(value)) return value
  try {
    const url = new URL(value)
    if (!url.hostname.endsWith("play.google.com")) return null
    const id = url.searchParams.get("id")
    return id && PACKAGE_NAME.test(id) ? id : null
  } catch {
    return null
  }
}
