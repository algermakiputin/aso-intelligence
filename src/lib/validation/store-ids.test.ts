import { describe, expect, it } from "vitest"
import { normalizeLanguageTag } from "./common"
import { parseAppStoreId, parsePlayPackage } from "./store-ids"

describe("parseAppStoreId", () => {
  it("accepts bare ids and App Store URLs", () => {
    expect(parseAppStoreId("6761086056")).toBe("6761086056")
    expect(parseAppStoreId("https://apps.apple.com/us/app/hunter-vault/id6761086056")).toBe(
      "6761086056",
    )
    expect(parseAppStoreId("https://apps.apple.com/us/app/id6761086056?platform=iphone")).toBe(
      "6761086056",
    )
  })

  it("rejects bundle ids and junk", () => {
    expect(parseAppStoreId("com.hunter.vault")).toBeNull()
    expect(parseAppStoreId("12")).toBeNull()
  })
})

describe("parsePlayPackage", () => {
  it("accepts package names and Play Store URLs", () => {
    expect(parsePlayPackage("com.hunter.vault")).toBe("com.hunter.vault")
    expect(
      parsePlayPackage("https://play.google.com/store/apps/details?id=com.hunter.vault&hl=en"),
    ).toBe("com.hunter.vault")
  })

  it("rejects invalid values and other hosts", () => {
    expect(parsePlayPackage("hunter")).toBeNull()
    expect(parsePlayPackage("https://evil.example/?id=com.hunter.vault")).toBeNull()
  })
})

describe("normalizeLanguageTag", () => {
  it("normalizes case and separators", () => {
    expect(normalizeLanguageTag("EN-us")).toBe("en-US")
    expect(normalizeLanguageTag("zh_hans")).toBe("zh-Hans")
    expect(normalizeLanguageTag("pt-br")).toBe("pt-BR")
    expect(normalizeLanguageTag("en")).toBe("en")
  })
})

describe("normalizeText", () => {
  it("converts browser CRLF line endings so unchanged text compares equal", async () => {
    const { normalizeText } = await import("./common")
    expect(normalizeText("Line one\r\nLine two\r\n")).toBe("Line one\nLine two")
    expect(normalizeText("Line one\rLine two")).toBe("Line one\nLine two")
    expect(normalizeText("  same  ")).toBe("same")
  })
})
