import { createHash, generateKeyPairSync, verify } from "node:crypto"
import { gzipSync } from "node:zlib"
import { describe, expect, it, vi } from "vitest"
import {
  aggregateReportFiles,
  DOWNLOADS_REPORT,
  ENGAGEMENT_REPORT,
  parseDelimited,
  sourceTypeKey,
} from "./apple/analytics-report-parser"
import {
  AppStoreConnectAnalyticsProvider,
  createAppStoreConnectToken,
} from "./apple/app-store-connect-analytics-provider"

const APP = "6761086056"

const engagementTsv = [
  "Date\tApp Name\tApp Apple Identifier\tEvent\tPage Type\tSource Type\tEngagement Type\tDevice\tPlatform Version\tTerritory\tCounts\tUnique Counts",
  `2026-10-01\tHunter Vault\t${APP}\tImpression\tNo page\tApp Store search\t\tiPhone\tiOS 26.0\tUS\t120\t90`,
  `2026-10-01\tHunter Vault\t${APP}\tImpression\tNo page\tApp Store search\t\tiPad\tiOS 26.0\tUS\t30\t25`,
  `2026-10-01\tHunter Vault\t${APP}\tImpression\tNo page\tApp Store browse\t\tiPhone\tiOS 26.0\tPH\t15\t15`,
  `2026-10-01\tHunter Vault\t${APP}\tPage view\tProduct page\tApp Store search\t\tiPhone\tiOS 26.0\tUS\t40\t35`,
  `2026-10-01\tHunter Vault\t${APP}\tPage view\tIn-app event\tApp Store browse\t\tiPhone\tiOS 26.0\tUS\t9\t9`,
  `2026-10-01\tHunter Vault\t${APP}\tTap\tProduct page\tApp Store search\tGet\tiPhone\tiOS 26.0\tUS\t12\t12`,
  `2026-10-02\tHunter Vault\t${APP}\tImpression\tNo page\tWeb referrer\t\tiPhone\tiOS 26.0\tUS\t5\t5`,
  `2026-10-02\tOther App\t999\tImpression\tNo page\tApp Store search\t\tiPhone\tiOS 26.0\tUS\t1000\t900`,
].join("\n")

const downloadsCsv = [
  "Date,App Name,App Apple Identifier,Download Type,App Version,Device,Platform Version,Source Type,Page Type,Pre-Order,Territory,Counts",
  `2026-10-01,"Hunter Vault, Inc",${APP},First-time download,6.7.4,iPhone,iOS 26.0,App Store search,Product page,No,US,7`,
  `2026-10-01,"Hunter Vault, Inc",${APP},Redownload,6.7.4,iPhone,iOS 26.0,App Store search,Product page,No,US,2`,
  `2026-10-01,"Hunter Vault, Inc",${APP},Auto-update,6.7.4,iPhone,iOS 26.0,Unavailable,No page,No,US,50`,
].join("\r\n")

describe("analytics report parser", () => {
  it("parses tab- and comma-separated files with quoted fields", () => {
    expect(parseDelimited('a\tb\n1\t"x\ty"\n')).toEqual([
      ["a", "b"],
      ["1", "x\ty"],
    ])
    expect(parseDelimited('﻿a,b\r\n"say ""hi""",2\r\n')).toEqual([
      ["a", "b"],
      ['say "hi"', "2"],
    ])
  })

  it("normalizes source types", () => {
    expect(sourceTypeKey("App Store search")).toBe("app_store_search")
    expect(sourceTypeKey(" Web referrer ")).toBe("web_referrer")
    expect(sourceTypeKey("")).toBe("unavailable")
  })

  it("sums additive counts for impressions and product page views only", () => {
    const result = aggregateReportFiles(ENGAGEMENT_REPORT, [engagementTsv], APP)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const find = (date: string, territory: string, source: string, metric: string) =>
      result.data.rows.find(
        (r) =>
          r.metricDate === date &&
          r.territory === territory &&
          r.sourceType === source &&
          r.metric === metric,
      )?.value
    // iPhone + iPad rows add up; unique counts are never used.
    expect(find("2026-10-01", "US", "app_store_search", "impressions")).toBe(150)
    expect(find("2026-10-01", "PH", "app_store_browse", "impressions")).toBe(15)
    // Only product page views count; in-app event page views and taps don't.
    expect(find("2026-10-01", "US", "app_store_search", "product_page_views")).toBe(40)
    expect(find("2026-10-01", "US", "app_store_browse", "product_page_views")).toBeUndefined()
    expect(find("2026-10-02", "US", "web_referrer", "impressions")).toBe(5)
    // Rows for another app are ignored.
    expect(result.data.rows.reduce((s, r) => s + r.value, 0)).toBe(150 + 15 + 40 + 5)
    expect(result.data).toMatchObject({ firstDate: "2026-10-01", lastDate: "2026-10-02" })
  })

  it("counts first-time downloads and redownloads, not updates", () => {
    const result = aggregateReportFiles(DOWNLOADS_REPORT, [downloadsCsv], APP)
    if (!result.ok) throw new Error(result.message)
    expect(result.data.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ metric: "first_time_downloads", value: 7 }),
        expect.objectContaining({ metric: "redownloads", value: 2 }),
      ]),
    )
    expect(result.data.rows).toHaveLength(2)
  })

  it("adds segments of one instance together and records the covered dates", () => {
    const [header, ...lines] = engagementTsv.split("\n")
    const result = aggregateReportFiles(
      ENGAGEMENT_REPORT,
      [[header, lines[0]].join("\n"), [header, lines[1]].join("\n")],
      APP,
    )
    if (!result.ok) throw new Error(result.message)
    expect(result.data.rows).toEqual([
      expect.objectContaining({ metric: "impressions", value: 150 }),
    ])
  })

  it("fails loudly on missing columns or malformed values instead of guessing", () => {
    expect(
      aggregateReportFiles(ENGAGEMENT_REPORT, ["Date\tCounts\n2026-10-01\t3"], APP),
    ).toMatchObject({
      ok: false,
    })
    const badCount = engagementTsv.replace("\t120\t90", "\tabc\t90")
    expect(aggregateReportFiles(ENGAGEMENT_REPORT, [badCount], APP)).toMatchObject({ ok: false })
    const badDate = engagementTsv.replace("2026-10-01\tHunter", "10/01/2026\tHunter")
    expect(aggregateReportFiles(ENGAGEMENT_REPORT, [badDate], APP)).toMatchObject({ ok: false })
  })
})

describe("AppStoreConnectAnalyticsProvider", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" })
  const config = {
    issuerId: "93d5e375-0000-4000-8000-000000000000",
    keyId: "ABC123DEFG",
    privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  }
  const API = "https://api.appstoreconnect.apple.com"
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
  const gz = gzipSync(Buffer.from(engagementTsv))
  const md5 = createHash("md5").update(gz).digest("hex")

  function fakeApple(routes: Record<string, () => Response>) {
    const calls: Array<{ method: string; url: string; auth: string | null; body: unknown }> = []
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? "GET"
      const headers = new Headers(init?.headers)
      calls.push({
        method,
        url,
        auth: headers.get("authorization"),
        body: typeof init?.body === "string" ? JSON.parse(init.body) : null,
      })
      const route = routes[`${method} ${url.replace(API, "")}`] ?? routes[`${method} ${url}`]
      return route ? route() : json({ errors: [{ status: "404" }] }, 404)
    })
    const provider = new AppStoreConnectAnalyticsProvider(config, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleep: async () => {},
      now: () => new Date("2026-10-07T00:00:00Z"),
    })
    return { provider, calls }
  }

  it("is not connected without the three values", () => {
    expect(new AppStoreConnectAnalyticsProvider({ keyId: "x" }).status()).toMatchObject({
      state: "not_configured",
      missing: ["APPLE_CONNECT_ISSUER_ID", "APPLE_CONNECT_PRIVATE_KEY"],
    })
  })

  it("signs a verifiable ES256 team-key token", () => {
    const token = createAppStoreConnectToken(config, new Date("2026-10-07T00:00:00Z"))
    const [header, payload, signature] = token.split(".")
    expect(JSON.parse(Buffer.from(header!, "base64url").toString())).toEqual({
      alg: "ES256",
      kid: "ABC123DEFG",
      typ: "JWT",
    })
    const claims = JSON.parse(Buffer.from(payload!, "base64url").toString())
    expect(claims).toMatchObject({ iss: config.issuerId, aud: "appstoreconnect-v1" })
    expect(claims.exp - claims.iat).toBeLessThanOrEqual(20 * 60)
    expect(
      verify(
        "sha256",
        Buffer.from(`${header}.${payload}`),
        { key: publicKey, dsaEncoding: "ieee-p1363" },
        Buffer.from(signature!, "base64url"),
      ),
    ).toBe(true)
  })

  it("reuses an active ONGOING request, and keeps snapshot requests too", async () => {
    const { provider, calls } = fakeApple({
      [`GET /v1/apps/${APP}/analyticsReportRequests?limit=200`]: () =>
        json({
          data: [
            { id: "old", attributes: { accessType: "ONGOING", stoppedDueToInactivity: true } },
            { id: "live", attributes: { accessType: "ONGOING", stoppedDueToInactivity: false } },
            { id: "snap", attributes: { accessType: "ONE_TIME_SNAPSHOT" } },
          ],
        }),
    })
    expect(await provider.ensureReporting(APP)).toEqual({
      ok: true,
      data: { requestIds: ["live", "snap"], created: false },
    })
    expect(calls.some((c) => c.method === "POST")).toBe(false)
  })

  it("creates the ONGOING request when none is active, and explains the Admin requirement", async () => {
    const created = fakeApple({
      [`GET /v1/apps/${APP}/analyticsReportRequests?limit=200`]: () => json({ data: [] }),
      "POST /v1/analyticsReportRequests": () => json({ data: { id: "new-req" } }, 201),
    })
    expect(await created.provider.ensureReporting(APP)).toEqual({
      ok: true,
      data: { requestIds: ["new-req"], created: true },
    })
    expect(created.calls.at(-1)!.body).toEqual({
      data: {
        type: "analyticsReportRequests",
        attributes: { accessType: "ONGOING" },
        relationships: { app: { data: { type: "apps", id: APP } } },
      },
    })

    const forbidden = fakeApple({
      [`GET /v1/apps/${APP}/analyticsReportRequests?limit=200`]: () => json({ data: [] }),
      "POST /v1/analyticsReportRequests": () => json({ errors: [] }, 403),
    })
    const result = await forbidden.provider.ensureReporting(APP)
    expect(result).toMatchObject({ ok: false, error: { code: "not_configured" } })
    if (!result.ok) expect(result.error.message).toContain("Admin")
  })

  it("lists daily instances of the two reports, following pagination", async () => {
    const names = encodeURIComponent(
      "App Store Discovery and Engagement Standard,App Downloads Standard",
    )
    const { provider } = fakeApple({
      [`GET /v1/analyticsReportRequests/live/reports?filter[name]=${names}&limit=200`]: () =>
        json({
          data: [
            { id: "r14", attributes: { name: "App Store Discovery and Engagement Standard" } },
            { id: "r3", attributes: { name: "App Downloads Standard" } },
          ],
        }),
      "GET /v1/analyticsReports/r14/instances?filter[granularity]=DAILY&limit=200": () =>
        json({
          data: [{ id: "i1", attributes: { granularity: "DAILY", processingDate: "2026-10-04" } }],
          links: { next: `${API}/v1/analyticsReports/r14/instances?cursor=2` },
        }),
      "GET /v1/analyticsReports/r14/instances?cursor=2": () =>
        json({
          data: [{ id: "i2", attributes: { granularity: "DAILY", processingDate: "2026-10-05" } }],
        }),
      "GET /v1/analyticsReports/r3/instances?filter[granularity]=DAILY&limit=200": () =>
        json({ data: [] }),
    })
    const result = await provider.listInstances(["live"])
    expect(result).toEqual({
      ok: true,
      data: [
        {
          externalId: "i1",
          report: ENGAGEMENT_REPORT,
          granularity: "daily",
          processingDate: "2026-10-04",
        },
        {
          externalId: "i2",
          report: ENGAGEMENT_REPORT,
          granularity: "daily",
          processingDate: "2026-10-05",
        },
      ],
    })
  })

  it("downloads gzipped segments without credentials and verifies size and checksum", async () => {
    const segmentUrl = "https://example-bucket.apple.com/segment-1.gz?sig=abc"
    const { provider, calls } = fakeApple({
      "GET /v1/analyticsReportInstances/i1/segments?limit=200": () =>
        json({
          data: [
            {
              id: "s1",
              attributes: { url: segmentUrl, checksum: md5, sizeInBytes: gz.length },
            },
          ],
        }),
      [`GET ${segmentUrl}`]: () => new Response(gz),
    })
    const instance = {
      externalId: "i1",
      report: ENGAGEMENT_REPORT,
      granularity: "daily" as const,
      processingDate: "2026-10-04",
    }
    const result = await provider.getInstance(instance, APP)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(
      result.data.rows.find(
        (r) =>
          r.metric === "impressions" && r.territory === "US" && r.sourceType === "app_store_search",
      )?.value,
    ).toBe(150)
    // The pre-signed download carries no Authorization header; API calls do.
    expect(calls.find((c) => c.url === segmentUrl)!.auth).toBeNull()
    expect(calls[0]!.auth).toMatch(/^Bearer /)

    const corrupt = fakeApple({
      "GET /v1/analyticsReportInstances/i1/segments?limit=200": () =>
        json({ data: [{ id: "s1", attributes: { url: segmentUrl, checksum: "0".repeat(32) } }] }),
      [`GET ${segmentUrl}`]: () => new Response(gz),
    })
    expect(await corrupt.provider.getInstance(instance, APP)).toMatchObject({
      ok: false,
      error: { code: "bad_response" },
    })
  })
})
