# ASO Intelligence

An App Store Optimization dashboard: which keywords to target, where the app ranks for them, how
that is changing, and what changed in the listing when it moved.

It is built as a multi-app, multi-workspace platform. Hunter Vault is the first app tracked with
it, but nothing in the core is specific to Hunter Vault.

**Ground rules the code enforces:**

- No fabricated metrics. Missing data shows "Waiting for data" or "Not connected". Synthetic data
  exists only in the seeded demo workspace, which is labelled "Demo data" on every page.
- Ranks from unofficial sources are labelled **Estimated Rank** and stored with source,
  confidence and timestamp.
- History is append-only. A database trigger rejects updates to observations.
- Nothing is ever published to App Store Connect or Google Play.
- Store credentials stay on the server. There is no browser database client.

## Contents

- [Current features (V0.1)](#current-features-v01)
- [Architecture](#architecture)
- [Local setup](#local-setup)
- [Supabase](#supabase)
- [Environment variables](#environment-variables)
- [Scripts](#scripts)
- [How rank providers work](#how-rank-providers-work)
- [Why public-API ranks are "estimated"](#why-public-api-ranks-are-estimated)
- [Opportunity Score](#opportunity-score)
- [Other derived metrics](#other-derived-metrics)
- [Scheduled jobs](#scheduled-jobs)
- [Testing](#testing)
- [Roadmap](#roadmap)
- [Known limitations](#known-limitations)

## Current features (V0.1)

| Area | What works |
|---|---|
| Accounts | Email and password sign-up and sign-in (Supabase Auth), workspaces with owner/admin/viewer roles, RLS on every table |
| Setup | Onboarding (create workspace, add app), iOS and/or Android listings, App Store ID or URL accepted, live listing import from the App Store |
| Overview | Tracked keywords, top 10/50, improved/declined, Estimated Search Visibility, ranking distribution, top opportunities, rank movement, ASO Health checklist, recent changes |
| Keywords | Dense sortable table with search and filters (platform, country, rank band, tracking), bulk pause/resume/priority/delete, add many keywords at once, mobile list layout |
| Rank tracking | Estimated iOS rank via Apple's public Search API, batched manual refresh with progress, append-only history, scheduler endpoint |
| Keyword detail | Rank history (7D/30D/90D/All) annotated with ASO events, popularity history plus manual entry, movement table, Opportunity Score breakdown, metadata coverage, top competing results, related events |
| Experiments | ASO change timeline: title, subtitle, keyword, description, screenshot and icon changes, releases, custom events |
| Settings | App details, listing metadata editor (keyword field counter), App Store sync that records detected changes, metadata history, integration status, scoring documentation |
| Coming next | Competitors, Analytics and Reviews pages describe what's planned. They contain no simulated data. |

## Architecture

Full details are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), and the plan for this phase is
in [docs/V0.1-PLAN.md](docs/V0.1-PLAN.md).

```
src/app            Routes (thin). Server Components read; Server Actions write.
src/components     UI: ui/ (shadcn), aso/ (rank, change, popularity…), charts/, dashboard/
src/features/*     Feature modules: data.ts (DB access), actions.ts (validated Server Actions),
                   model.ts (row → domain mapping), components/
src/lib/aso        Pure domain logic: rank semantics, scoring, coverage, normalization, scheduling
src/lib/stores     Store providers behind interfaces (Apple, Google), plus the registry
src/lib/http       fetch with timeout, retry, backoff and a per-host rate limiter
src/lib/supabase   Server, admin and proxy clients, plus generated types
supabase/          Migrations (schema `aso`), RLS, dev seed
```

Dependencies only point downward. `lib/aso` has no I/O, `lib/stores` knows nothing about the
database, and the rank collector (`features/rankings/collector.ts`) is the only place where
providers and persistence meet.

**Data model:** user → workspace (role) → apps → store listings (platform × country × language)
→ keywords → append-only rank, popularity and difficulty history. There are also competitor
tables (schema only), ASO events, metadata snapshots and collector runs.

**Stack:** Next.js 16 (App Router, Turbopack), React 19, TypeScript (strict, plus
`noUncheckedIndexedAccess`), Tailwind CSS 4, shadcn/ui (Radix, "mira" style), Lucide, Supabase
(Postgres 17 and Auth), Zod 4, Recharts 3, TanStack Table 9, Vitest.

Two versions are pinned deliberately:
- **TypeScript 6.0.** TypeScript 7 ships without the compiler API that typescript-eslint needs.
- **ESLint 9.** `eslint-plugin-react`, which `eslint-config-next` bundles, crashes on ESLint 10.

## Local setup

Prerequisites: Node 20.9+ (developed on Node 26), and Docker for local Supabase.

```bash
npm install
npm run db:start            # starts local Supabase, applies migrations, seeds dev data
cp .env.example .env.local  # then paste the keys printed by `npx supabase status`
npm run dev                 # http://localhost:3000
```

Sign in with the seeded dev account: **dev@example.com / aso-dev-password**.

The seed creates:
- **Hunter Vault** workspace → Hunter Vault app → iOS listing (App Store ID `6761086056`, bundle
  `com.hunter.vault`, US, en). It has no metrics. In Settings → Store listings, click
  **Sync from App Store** to import the live title and description. Then add keywords and click
  **Refresh rankings**.
- **Demo workspace** → "Budget Quest (demo)" with 90 days of synthetic history so you can see
  charts immediately. It is labelled "Demo data", and rank checks are disabled there.

Local Supabase uses ports **56321** (API), **56322** (Postgres), **56323** (Studio) and **56324**
(Mailpit). These avoid the default 543xx ports so the project can run alongside other local
Supabase projects.

## Supabase

### Migrations

| File | Contents |
|---|---|
| `20261005090000_aso_schema_and_tenancy.sql` | `aso` schema, enums, workspaces, members, apps, store listings, metadata snapshots (with trigger), access helpers, `create_workspace` RPC |
| `20261005090100_aso_keywords_and_history.sql` | keywords, rank/popularity/difficulty history, collector runs, append-only guard, `keyword_overview` view |
| `20261005090200_aso_competitors_and_events.sql` | competitors, competitor snapshots, ASO events |
| `20261005090300_aso_rls_and_grants.sql` | Grants and RLS policies for every table |

```bash
npm run db:migration:new <name>   # new migration file
npm run db:reset                  # re-apply all migrations + seed (local only)
npm run db:types                  # regenerate src/lib/supabase/database.types.ts
```

### Hosted project

1. Create a Supabase project, then run `npx supabase link --project-ref <ref>` and
   `npx supabase db push`. Pushing applies migrations only; the seed never runs remotely.
2. **Expose the `aso` schema.** Go to Project Settings → Data API → Exposed schemas and add
   `aso`. The local `config.toml` does this already.
3. Auth → URL Configuration: set the Site URL and add `https://<your-domain>/auth/callback` to
   the redirect URLs.
4. Set the environment variables below in your host.

## Environment variables

Validated at runtime with Zod (`src/lib/env`). Variables marked server-only are read only in
`server-only` modules, so importing them into client code fails the build.

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase API URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Anon/publishable key. Safe in the browser because RLS governs access. `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is also accepted. |
| `SUPABASE_SERVICE_ROLE_KEY` | for scheduled jobs | Server-only. Bypasses RLS. Used only by the cron endpoint. |
| `CRON_SECRET` | for scheduled jobs | At least 16 characters. Bearer token for `/api/jobs/rank-collection`. |
| `APPLE_ADS_CLIENT_ID`, `APPLE_ADS_TEAM_ID`, `APPLE_ADS_KEY_ID`, `APPLE_ADS_PRIVATE_KEY`, `APPLE_ADS_ACCOUNT_ID` | optional | Apple Ads search-term popularity. `APPLE_ADS_CLIENT_SECRET` (a pre-signed JWT) can replace team/key/private key. |
| `APPLE_CONNECT_*`, `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | not yet | Reserved for V0.2 |

Without the Apple Ads variables the app works normally and shows "Apple keyword popularity not
connected".

## Scripts

| Script | Does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint` | ESLint (flat config: Next core-web-vitals, TypeScript, Prettier) |
| `npm run typecheck` | `next typegen` + `tsc --noEmit` |
| `npm test` | Vitest (domain logic, providers, HTTP utilities) |
| `npm run check` | lint + typecheck + test |
| `npm run format` / `format:check` | Prettier (with Tailwind class sorting) |
| `npm run db:*` | Supabase CLI helpers (see above) |

## How rank providers work

The application depends on interfaces in `src/lib/stores/types.ts`: `KeywordRankProvider`,
`KeywordPopularityProvider`, `MetadataProvider`, plus `StoreAnalyticsProvider` and
`ReviewProvider` for later versions. Providers return a result union instead of throwing.

```ts
interface KeywordRankProvider {
  readonly id: string        // stored as `source`, e.g. "apple_itunes_search"
  readonly platform: "ios" | "android"
  readonly official: boolean
  status(): ProviderStatus   // ready | not_configured | unsupported
  getRank(q: { keyword; platform; country; language; appExternalId }):
    Promise<{ ok: true; data: KeywordRankResult } | { ok: false; error: ProviderError }>
}
// KeywordRankResult: rank | null, resultCount, searchDepth, source, confidence, checkedAt, topCompetitors
```

`src/lib/stores/registry.ts` is the only module that knows which concrete providers exist.

| Capability | iOS | Android |
|---|---|---|
| Estimated rank | `AppleItunesRankProvider`: public Search API, top 200 results | `GooglePlayRankProvider`: returns `unsupported` (see limitations) |
| Popularity | `AppleAdsPopularityProvider`: needs credentials | none |
| Listing metadata | `AppleItunesMetadataProvider`: public Lookup API | none |

To swap a provider, for example a licensed rank-data vendor, implement the interface and change
the registry. Nothing else changes, and observations keep their `source`, so old and new data
stay distinguishable.

The collector (`src/features/rankings/collector.ts`) works like this:
1. Pick due keywords: priority keywords every 20 h, normal ones every 60 h, and anything older
   than 6 h on a manual refresh.
2. Resolve the listing's App Store ID for each one and call the provider.
3. Append a rank observation and a difficulty estimate.
4. Record the run in `collector_runs`.

Apple's documented limit is about 20 requests per minute, so requests are spaced at least 3 s
apart. Failures retry with backoff, `Retry-After` is honoured, and a run stops on rate limiting.

### Apple Ads popularity

Apple publishes search-term popularity as a **ranked list of popular terms per genre and
storefront**, not as a lookup for any keyword. The provider fetches the list for the app's
category and matches tracked keywords against it. Terms that aren't in the list are recorded as
**below threshold**, meaning low popularity, not zero.

The provider implements Apple's OAuth flow: an ES256 client-secret JWT signed with `node:crypto`,
plus the `X-AP-Context` header. The request payload follows third-party documentation, so it is
**unverified against a live account**. Responses are schema-validated and rejected if they don't
match, so a mismatch fails loudly instead of storing bad data. Until it's connected, you can
record popularity manually from the keyword page. Those values are labelled "Manual entry".

## Why public-API ranks are "estimated"

The iTunes Search API is not App Store search:

- Its ordering approximates the store's but isn't identical. Personalization, search ads and
  App Store-only ranking factors are absent.
- It is **non-deterministic in the tail**. In testing, identical requests one minute apart put
  Hunter Vault at #120 for "budget tracker" and then didn't return it at all.
- It returns **fewer results than requested** even for popular terms (about 193 of 200), so a
  short list doesn't mean it's complete.

So every value is labelled **Estimated Rank** and stored with its `source`, a `confidence`
(`medium` for the top 50, `low` deeper or when unranked) and `checked_at`. When the app isn't
returned, the UI shows the largest round threshold the results prove (`>100` when 193 results
were returned without it) rather than a guessed number. "Not found" means the search returned
nothing. Unranked points are drawn in a separate "Not ranked" lane on charts and are never
plotted as a rank.

Movement treats smaller as better: 50 → 20 is **+30** (improved) and 20 → 50 is **−30**
(declined). Entering or leaving the results shows as **New** or **Lost**, never as a numeric
delta.

## Opportunity Score

This is our own heuristic, **not an industry standard**, implemented as a replaceable strategy
(`src/lib/aso/scoring/opportunity.ts`, id `opportunity_v1`).

```
score = 100 × (0.30·popularity + 0.30·relevance + 0.25·rankOpportunity + 0.15·(1 − difficulty))
```

| Input | Normalization (0–1) | Source |
|---|---|---|
| Popularity | `score / 100` | Apple Ads (measured only; "below threshold" counts as missing) or manual |
| Relevance | `relevance / 10` | You (1–10). **Required** |
| Rank opportunity | Curve below | Latest estimated rank |
| Difficulty | `difficulty / 100` | Estimated (see below) |

The rank opportunity curve is highest in striking distance of the top 10. Values between anchors
are interpolated linearly.

| Rank | 1 | 3 | 10 | 11 | 20–30 | 50 | 100 | 101+ | Not ranked |
|---|---|---|---|---|---|---|---|---|---|
| Value | 0.05 | 0.20 | 0.60 | 0.85 | 1.00 | 0.80 | 0.55 | 0.45 | 0.40 |

When inputs are missing, the available weights are renormalized and the score is marked
**partial**, provided they cover at least 55% of the total weight. Before Apple Ads is
connected, most scores are partial because popularity is missing. Without relevance, or below 55%
coverage, there's no score. Every score has a per-input breakdown in the UI. A new formula should
be a new strategy (`opportunity_v2`), not an edit to v1.

## Other derived metrics

- **Estimated difficulty** (`serp_strength_v1`) is calculated from the top 10 competing apps in
  the same search, with this app excluded. Each app's strength is
  log₁₀(1 + ratings) ÷ log₁₀(1 + 1,000,000), weighted by 1/√position, and empty slots count as
  zero. Bands: <20 very low, <40 low, <60 medium, <80 high, otherwise very high.
- **Estimated Search Visibility** is
  `100 × Σ(popularity × 1/rank) ÷ Σ popularity` over tracked keywords with popularity, counting
  ranks in the top 100. It's an index, not a traffic estimate.
- **Metadata coverage** checks whether the keyword is in the title, subtitle, keyword field or
  description, as an exact phrase, all words, some words or not at all. For iOS it also checks
  whether every word appears somewhere across title, subtitle and keyword field. It reports where
  the words are and makes no claim about field weight.
- **ASO Health** is a checklist of verifiable checks (shown as "N of M passing"), not a grade.

## Scheduled jobs

`GET|POST /api/jobs/rank-collection` with `Authorization: Bearer $CRON_SECRET` checks due
keywords for every non-demo app, within a 4-minute budget, using the service role.

Vercel Cron sends the `CRON_SECRET` bearer automatically:

```json
{ "crons": [{ "path": "/api/jobs/rank-collection", "schedule": "0 */6 * * *" }] }
```

Supabase `pg_cron` + `pg_net`, with the secret stored in Vault:

```sql
select cron.schedule('aso-rank-collection', '0 */6 * * *', $$
  select net.http_post(
    url := 'https://<your-domain>/api/jobs/rank-collection',
    headers := jsonb_build_object('Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'))
  );
$$);
```

Running every 6 hours is fine. The schedule policy decides what's actually due, so priority
keywords are checked about daily and the rest every 2–3 days. The rate limiter is per process,
so run the job from one scheduler.

## Testing

`npm test` runs 119 unit tests covering:
- rank values and movement (including unranked transitions and threshold labels);
- Opportunity Score maths, partial and insufficient cases, and strategy replacement;
- rank opportunity, difficulty, visibility and ASO Health;
- metadata coverage (phrases, word order, stop words, plurals, Android fields);
- keyword and text normalization;
- scheduling;
- overview aggregation;
- store-ID parsing;
- the Apple rank, metadata and Ads providers (with fake `fetch`, including ES256 signature
  verification);
- the retry and rate-limiter utilities.

The database model was checked against a running local Supabase:
- RLS isolates workspaces (another user sees nothing and can't insert or join);
- anon has no access;
- history rejects updates, even from the service role;
- cascades still work.

The UI flows were exercised end to end in a browser: sign-up, onboarding with a live App Store
import, adding keywords, live rank refreshes, editing, bulk actions, the timeline, settings, and
dark and mobile layouts.

## Roadmap

- **V0.1**: project foundation, app setup, keyword intelligence, estimated iOS rank tracking,
  rank history, Opportunity Score, metadata coverage, ASO event timeline *(this release)*
- **V0.2**: App Store Connect analytics, Google Play performance reports, search acquisition
  data, conversion metrics
- **V0.3**: competitor discovery (seeded from "top competing results"), competitor metadata
  monitoring, change detection
- **V0.4**: review intelligence, phrase extraction, keyword discovery
- **V0.5**: ASO experiments, before/after analytics, change impact analysis
- **V0.6**: AI ASO analyst, recommendation engine, weekly ASO report (suggestions only, always
  applied manually)
- **V1**: multi-app production readiness, team and workspace features (invites, member
  management), optional SaaS commercialization

## Known limitations

- **Android rank tracking is not implemented.** Google offers no search-rank API, and HTML
  scraping is brittle, so the provider honestly reports "unsupported". Android listings and
  keywords can still be managed.
- **The Apple Ads popularity integration is unverified** against a live account (see above).
- The iOS **subtitle and keyword field** aren't publicly available, so enter them in Settings.
- The rate limiter is per process. Scheduled collection should run from a single scheduler.
- Workspace invitations aren't built yet. Memberships can be added in SQL for now.
# aso-intelligence
