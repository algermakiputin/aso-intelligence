# Architecture

ASO Intelligence is a multi-app App Store Optimization analytics platform. Hunter Vault is the
first app tracked with it, but nothing in the core is specific to Hunter Vault: every app lives
inside a workspace, and every store-facing concept hangs off an app's store listings.

This document describes the system as built for V0.1 and the seams that later versions plug into.

## Principles

1. **Never fabricate data.** Every number shown in the UI comes from a stored observation with a
   `source` and a timestamp. When data is missing the UI says so ("Waiting for data",
   "Not connected") instead of inventing a value. Demo data exists only inside workspaces flagged
   `is_demo`, created by the local development seed, and the UI labels it on every page.
2. **Provenance is part of the data.** Rank observations from unofficial sources (Apple's public
   iTunes Search API) are labelled **Estimated Rank** and carry `source`, `confidence` and
   `checked_at`. Popularity is labelled **Popularity**, never "search volume".
3. **Append-only history.** Rank, popularity and difficulty observations are inserted and
   never updated. A database trigger rejects `UPDATE` on history tables.
4. **Replaceable providers.** Each store integration sits behind an interface in `src/lib/stores`.
   The application depends on the interface, so a scraping-based provider can be swapped for an
   official API without touching UI or persistence code.
5. **Pure domain logic.** Scoring, rank-change semantics, normalization and metadata coverage are
   pure TypeScript functions in `src/lib/aso`. They have no I/O and no React, and they are unit-tested.
6. **Manual approval for anything outward-facing.** The platform never publishes metadata to App
   Store Connect or Google Play. Recommendations, when added, will be suggestions a human applies.
7. **Credentials stay on the server.** There is no browser Supabase client; all reads happen in
   Server Components and all writes in Server Actions or Route Handlers. Store credentials are read
   from server-only environment variables.

## Layers

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ src/app            Routes. Thin: resolve context, call feature data/actions. │
│ src/components     Presentational UI (ui/ = shadcn, aso/, charts/, dashboard/)│
├──────────────────────────────────────────────────────────────────────────────┤
│ src/features/*     Feature modules                                            │
│   data.ts          Database access (server-only), maps rows → domain types    │
│   actions.ts       Server Actions: auth → validate (zod) → data/service       │
│   schemas.ts       Zod input schemas                                          │
│   components/      Feature-specific UI                                        │
│ src/features/rankings/collector.ts  Rank collection orchestration            │
├──────────────────────────────────────────────────────────────────────────────┤
│ src/lib/aso        Pure domain logic: rank semantics, scoring, coverage,      │
│                    normalization, scheduling policy, source registry          │
│ src/lib/stores     External store providers behind interfaces                 │
│ src/lib/http       fetch with timeout/retry/backoff, per-host rate limiter     │
│ src/lib/supabase   Server/admin clients, session proxy, generated DB types    │
│ src/lib/auth       Session + workspace role helpers                           │
│ src/lib/env.ts     Zod-validated environment                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│ supabase/          Migrations (schema `aso`), RLS, dev seed                   │
└──────────────────────────────────────────────────────────────────────────────┘
```

Dependency direction is strictly downward. `src/lib/aso` imports nothing from features, stores
or Supabase. `src/lib/stores` knows nothing about the database. The collector is the only place
where providers and persistence meet.

### Directory layout

```
src/
  app/
    (auth)/login, (auth)/signup     Email + password auth (Supabase Auth)
    auth/callback/route.ts          PKCE code exchange for email links
    onboarding/                     Create workspace → add first app
    dashboard/
      page.tsx                      Overview
      keywords/                     Keyword intelligence table
      keywords/[keywordId]/         Keyword detail
      experiments/                  ASO change timeline
      competitors/ analytics/ reviews/   "Coming next" states (no fake features)
      apps/ apps/new/               App list and add app
      settings/                     App, listings, integrations, workspace
    api/jobs/rank-collection/       Scheduler entry point (bearer CRON_SECRET)
  components/{ui,aso,charts,dashboard}
  features/{workspaces,apps,listings,keywords,rankings,popularity,experiments,overview}
  lib/{aso,stores,http,supabase,auth,validation}
  proxy.ts                          Session refresh + route protection (Next 16 proxy)
supabase/{migrations,seed.sql,functions}
docs/
```

Competitors, analytics, reviews and recommendations don't have feature modules yet. Their
tables exist in the schema; their code arrives with the versions that use them (see roadmap).

## Tenancy model

```
auth.users ─┬─< workspace_members >─ workspaces ─< apps ─┬─< store_listings ─< metadata_snapshots
            │        (role)                              ├─< keywords ─┬─< keyword_rank_history
            │                                            │             ├─< keyword_popularity_history
            │                                            │             └─< keyword_difficulty_history
            │                                            ├─< competitors ─< competitor_snapshots
            │                                            ├─< aso_events
            │                                            └─< collector_runs
```

- A **workspace** is the tenant boundary and the future billing unit.
- **Roles**: `owner` (everything, including members), `admin` (manage apps, keywords and events),
  `viewer` (read-only). Enforced by RLS; the UI hides controls the role can't use.
- An **app** is a product (Hunter Vault). It has zero or more **store listings**, one per
  platform + storefront country + language. An app can be iOS-only, Android-only or both.
- The **active app** is stored in a cookie (`aso_active_app`) and validated against the user's
  memberships on every request. Routes stay short (`/dashboard/keywords`) while the data stays multi-app.

## Database

All tables live in the `aso` Postgres schema, which is exposed to PostgREST. Migrations are in
`supabase/migrations`. Generated types are in `src/lib/supabase/database.types.ts`.

| Table | Purpose | Notes |
|---|---|---|
| `workspaces` | Tenant | `is_demo` marks seeded demo workspaces |
| `workspace_members` | User ↔ workspace with role | PK `(workspace_id, user_id)` |
| `apps` | Product within a workspace | unique `(workspace_id, slug)` |
| `store_listings` | Platform/storefront listing | unique `(app_id, platform, country, language)`; `keyword_field` is iOS-only (≤100 chars) |
| `metadata_snapshots` | History of our own listing metadata | Written by trigger whenever listing metadata changes |
| `keywords` | Tracked search terms | unique `(app_id, platform, country, language, keyword)`; keyword stored normalized; `relevance_score` 1–10 set by the user |
| `keyword_rank_history` | Append-only rank observations | `rank` NULL = not found within `search_depth`; `source`, `confidence`, `checked_at` |
| `keyword_popularity_history` | Append-only popularity observations | `status` = `measured` or `below_threshold`; `granularity` and period |
| `keyword_difficulty_history` | Append-only difficulty estimates | `method` names the algorithm; `details` holds the top results it was computed from |
| `competitors` / `competitor_snapshots` | Competitor tracking | Schema only in V0.1 |
| `aso_events` | Annotated ASO changes (title change, release…) | `before_data`/`after_data` JSONB because payloads vary by event type |
| `collector_runs` | Audit log of rank collection runs | Status, counts, errors; powers "last refreshed" |

JSONB is used only where payloads vary (`store_listings.metadata`, event before/after,
difficulty details, competitor snapshot metadata). Everything filterable or sortable is a column.

**View:** `keyword_overview` (`security_invoker = true`, so RLS applies) joins each keyword to its
latest and previous rank, latest popularity, latest difficulty and its last 14 rank observations
(for sparklines). The keyword table and overview read from it in a single query.

**Indexes** cover the dashboard access paths: `keywords(app_id, tracked)`,
`*_history(keyword_id, <time> desc)`, `aso_events(app_id, happened_at desc)`,
`collector_runs(app_id, started_at desc)`, `workspace_members(user_id)`.

### Row-level security

Every `aso` table has RLS enabled. Policies call `SECURITY DEFINER` helper functions
(`aso.is_workspace_member`, `aso.has_workspace_role`, `aso.can_read_app`, `aso.can_write_app`,
`aso.can_read_keyword`, `aso.can_write_keyword`) so they don't recurse through
`workspace_members` policies, and so `auth.uid()` is evaluated once per statement.

- Members can read everything in their workspace.
- `owner`/`admin` can write apps, listings, keywords, events and history inserts.
- Only owners manage memberships. Creating a workspace goes through the
  `aso.create_workspace(name)` RPC, which inserts the workspace and the owner membership in one
  transaction. There is no client insert policy on `workspaces`.
- No `UPDATE`/`DELETE` policies exist on history tables. Rows disappear only through the
  `ON DELETE CASCADE` of their keyword.
- `anon` has schema usage but no table privileges.

The scheduled collector uses the service-role key (bypasses RLS) and runs only server-side,
behind a bearer secret.

## Store providers

`src/lib/stores/types.ts` defines the provider contracts:

```ts
interface KeywordRankProvider {
  readonly source: RankSource;          // e.g. "apple_itunes_search"
  readonly platform: Platform;
  status(): ProviderStatus;             // ready | not_configured | unsupported
  getRank(query: KeywordRankQuery): Promise<ProviderResult<KeywordRankResult>>;
}
interface KeywordPopularityProvider { … getPopularity(query) }
interface MetadataProvider          { … getListing(query) }
interface StoreAnalyticsProvider    { … }   // contract only (V0.2)
interface ReviewProvider            { … }   // contract only (V0.4)
```

`ProviderResult<T>` is a discriminated union (`{ ok: true, data } | { ok: false, error }`).
Error codes (`not_configured`, `unsupported`, `rate_limited`, `timeout`, `network`,
`bad_response`, `not_found`) tell the caller whether to retry, skip or stop. Providers never throw
for expected failures.

`src/lib/stores/registry.ts` maps `(platform, capability)` to a provider instance. It is the only
place that knows which concrete providers exist.

| Capability | iOS | Android |
|---|---|---|
| Estimated rank | `AppleItunesRankProvider` (public iTunes Search API) | `GooglePlayRankProvider` → `unsupported` |
| Popularity | `AppleAdsPopularityProvider` (needs Apple Ads credentials) | none |
| Listing metadata | `AppleItunesMetadataProvider` (public iTunes Lookup API) | none |

### Apple estimated rank

- `GET https://itunes.apple.com/search?term=…&country=…&entity=software&limit=200`
- The app's 1-based position in the result list is its **estimated rank**. The public Search API's
  ordering approximates App Store search but is not the same system. Results are stored with
  `source = apple_itunes_search`.
- **Confidence** is `medium` for positions 1–50 and `low` deeper down or when the app wasn't
  returned. Testing against live data showed the tail of the list (beyond roughly position 100)
  varies between identical requests: one request had Hunter Vault at #120 for "budget tracker",
  and the next didn't return it at all.
- **Unranked observations** are stored as `rank = NULL` with `result_count` and `search_depth`.
  They are never turned into a sentinel number. Apple often returns fewer results than requested
  (about 193 of 200 for popular terms), so a short list doesn't mean the list is complete.
  An unranked observation therefore only proves "not in the top N", where N is the number of
  results actually returned. The UI shows the largest round threshold that's provably true, so
  193 results without the app reads `>100`. "Not found" is reserved for searches that returned
  nothing.
- The same response yields the top 10 competing results. They feed the difficulty estimate and
  the "Top competing results" panel, so no second request is made.
- Traffic controls:
  - A process-wide limiter spaces requests at least 3 s apart (Apple documents roughly 20 calls
    per minute).
  - Each request has a 20 s timeout (a 200-result response is about 1 MB).
  - 429, 403, 5xx and network errors are retried with exponential backoff and jitter, and
    `Retry-After` is honoured.
  - A rate limit that survives retries stops the run.
  - Identical `(term, country)` searches within 10 minutes are served from a cache.
  - Keywords checked in the last 6 hours are skipped by manual refreshes.

### Apple Ads popularity

Apple's Ads Platform API exposes search-term popularity as a **ranked list of popular terms per
genre and country** (weekly or monthly), not as a lookup for arbitrary keywords. The provider
therefore fetches the list for the app's genre and storefront and matches tracked keywords against
it. A keyword absent from the list is stored as `below_threshold`, not as zero.

Without credentials the provider reports `not_configured` and the UI shows
"Apple keyword popularity not connected". Users can also record popularity manually
(`source = manual`), for example a value read from the Apple Ads UI. The request payload follows
third-party documentation of the API, so treat the provider as unverified until it has run against
a real account.

### Android

`GooglePlayRankProvider` returns `unsupported`. We will not ship brittle HTML scraping to tick a
box. The interface, schema (`platform = android`) and UI already handle Android listings and
keywords; only the provider implementation is missing.

## Domain logic (`src/lib/aso`)

| Module | Responsibility |
|---|---|
| `rank.ts` | `RankValue` (ranked / unranked with depth / not found), formatting, bands, `computeRankChange` |
| `scoring/opportunity.ts` | Opportunity Score strategy interface and the `opportunity_v1` strategy |
| `scoring/rank-opportunity.ts` | Rank → headroom curve used by the Opportunity Score |
| `scoring/difficulty.ts` | `serp_strength_v1` difficulty estimate from top results |
| `scoring/visibility.ts` | Estimated Search Visibility index |
| `scoring/health.ts` | ASO Health checklist |
| `coverage.ts` | Metadata coverage analyzer |
| `normalization/` | Keyword and text normalization, scale normalization (0–1) |
| `scheduling.ts` | Which keywords are due for a rank check |
| `sources.ts` | Source registry: label, official or estimated, demo flag |

### Rank semantics

Smaller rank numbers are better. `computeRankChange(previous, current)` returns:

| Previous → current | Result | Display |
|---|---|---|
| 50 → 20 | `improved`, 30 positions | `+30` (green, up arrow) |
| 20 → 50 | `declined`, 30 positions | `−30` (red, down arrow) |
| 20 → 20 | `unchanged` | `0` |
| not ranked → 35 | `entered` | `New` |
| 35 → not ranked | `dropped` | `Lost` |
| not ranked → not ranked | `still_unranked` | `—` |
| no previous | `no_baseline` | `—` |

"Change" in the table compares the latest observation with the previous one. The keyword detail
page also shows change across the selected range.

### Opportunity Score (`opportunity_v1`)

Our own heuristic, not an industry standard. Inputs are normalized to 0–1:

| Component | Weight | Normalization |
|---|---|---|
| Popularity | 0.30 | `popularity / 100` (Apple's relative 1–100 scale) |
| Relevance | 0.30 | `relevance / 10` (user-assigned 1–10) |
| Rank opportunity | 0.25 | Piecewise curve over the estimated rank (below) |
| Ease (1 − difficulty) | 0.15 | `1 − difficulty / 100` |

```
score = 100 × Σ(weightᵢ × valueᵢ) / Σ(weightᵢ)   over available components
```

Rank opportunity curve (linear interpolation between anchors). The shape is highest in "striking
distance" of the top 10:

| Rank | 1 | 3 | 10 | 11 | 20–30 | 50 | 100 | >100 ranked | not ranked |
|---|---|---|---|---|---|---|---|---|---|
| Value | 0.05 | 0.20 | 0.60 | 0.85 | 1.00 | 0.80 | 0.55 | 0.45 | 0.40 |

Missing inputs:
- Relevance is required. Without it the result is `insufficient_data`.
- Otherwise the available weights are renormalized, provided they cover at least 0.55 of the total
  weight. The result is then marked **partial** and lists what's missing. It is typical before
  popularity is connected.
- Below 0.55 coverage the result is `insufficient_data`.

Strategies implement `OpportunityStrategy`. A v2 (adding conversion potential, for example) is a
new strategy, not an edit to v1.

### Estimated difficulty (`serp_strength_v1`)

Derived from the top 10 competing apps in the same search response (our own app excluded):

```
strengthᵢ = min(1, log10(1 + ratingCountᵢ) / log10(1 + 1,000,000))
weightᵢ   = 1 / √i                    (i = competitor position 1…10)
difficulty = 100 × Σ weightᵢ·strengthᵢ / Σ_{i=1..10} weightᵢ
```

Empty slots contribute zero, so terms with few results score as easy. Bands: <20 Very low,
<40 Low, <60 Medium, <80 High, ≥80 Very high. This is an estimate from public data, not Apple's.

### Estimated Search Visibility

An index (0–100), not a traffic estimate:
`100 × Σ popularityₖ × (1 / rankₖ) / Σ popularityₖ` over tracked keywords that have both a measured
popularity and an estimated rank in the top 100. Without popularity data it shows "Waiting for data".

### Metadata coverage

For each keyword it checks title, subtitle (iOS) or short description (Android), the iOS keyword
field and the description. Each field gets one of: exact phrase, all words, some words or not
present. For iOS it also reports whether every word appears somewhere across title + subtitle +
keyword field. Matching is case- and diacritic-insensitive and ignores a short stop-word list. A
simple plural variant (`budget`/`budgets`) counts as a variant match. Coverage is reported per field
with no claims about ranking weight.

## Rank collection

`src/features/rankings/collector.ts` runs one collection pass:

1. Load the app's listings and the candidate keywords.
2. Pick due keywords with `selectDueKeywords`. Priority keywords are due after 20 h and normal
   keywords after 60 h. Manual refresh treats anything older than 6 h as due.
3. Open a `collector_runs` row.
4. For each keyword, resolve the listing's external app ID and call the platform's rank provider.
   Insert a rank observation, plus a difficulty estimate when top results are present. Skip
   unsupported platforms or keywords with no listing, recording why. Stop early on rate limiting.
5. Close the run with counts and status (`succeeded`, `partial`, `failed`).

There are two entry points:
- **Manual**: the "Refresh rankings" button calls a Server Action in batches of 5 keywords, so the
  UI can show progress and each request stays short. It runs as the signed-in user under RLS.
  Keywords that can't be checked (no listing, provider unsupported) are reported but never
  batched, so a refresh always terminates. The client also stops on rate limiting, when a batch
  makes no progress, or when the user presses Stop.
- **Scheduled**: `POST /api/jobs/rank-collection` with `Authorization: Bearer $CRON_SECRET` uses the
  service-role client. Vercel Cron, Supabase `pg_cron` + `pg_net`, or any external scheduler can call it.

## Auth flow

Supabase Auth with email and password via `@supabase/ssr` cookies. `src/proxy.ts` refreshes the
session on each request and redirects unauthenticated requests away from `/dashboard` and
`/onboarding`. Every Server Action re-checks the user and the user's role. Proxy checks are
optimistic only.

## UI system

- Typeface: IBM Plex Sans throughout. Tabular figures in table columns and axes; proportional
  figures for standalone values.
- Neutral, slightly cool greys. Blue is reserved for data and selection. Green and red mean only
  rank movement and always come with an arrow and a sign. Amber means stale, partial or attention.
- Density: compact controls (shadcn "mira" style), tables as the main surface, stat strips instead
  of a grid of large cards.
- Every metric shows its provenance on hover: source, whether it is estimated, and when it was observed.
- Charts follow the project's data-visualization rules. Rank axes are inverted (1 at the top).
  Unranked observations are drawn as markers in a separate "not ranked" lane, never plotted as a
  fake rank. ASO events appear as vertical annotations.
- Light and dark themes are both designed (`next-themes`, class strategy).
