# Supabase Edge Functions

None yet, by design.

Rank collection runs inside the Next.js app (`src/features/rankings/collector.ts`) so the same
code serves manual refreshes and scheduled jobs. Schedulers call
`POST /api/jobs/rank-collection` with `Authorization: Bearer $CRON_SECRET` (see the README's
"Scheduled jobs" section for Vercel Cron and `pg_cron` + `pg_net` examples).

Edge Functions become useful when a job needs to run close to the database without the web
app, for example store-analytics ingestion in V0.2. Shared domain logic in `src/lib/aso` is pure
TypeScript with no Node-only APIs, so it can be imported from Deno when that happens.
