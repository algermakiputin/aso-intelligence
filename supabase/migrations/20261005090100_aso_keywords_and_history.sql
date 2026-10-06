-- ASO Intelligence: tracked keywords, append-only observation history and
-- collector run audit log.

-- ---------------------------------------------------------------------------
-- Keywords
-- ---------------------------------------------------------------------------

create table aso.keywords (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references aso.apps (id) on delete cascade,
  keyword text not null,
  platform aso.platform not null,
  country text not null check (country ~ '^[A-Z]{2}$'),
  language text not null check (language ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$'),
  tracked boolean not null default true,
  is_priority boolean not null default false,
  relevance_score smallint check (relevance_score between 1 and 10),
  notes text check (char_length(notes) <= 2000),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint keywords_keyword_normalized check (
    char_length(keyword) between 1 and 100
    and keyword = btrim(keyword)
    and keyword !~ '\s\s'
  ),
  constraint keywords_storefront_keyword_key unique (app_id, platform, country, language, keyword)
);

comment on table aso.keywords is 'Search terms tracked for an app in a specific storefront (platform × country × language).';
comment on column aso.keywords.keyword is 'Normalized by the application: lower case, trimmed, single spaces.';
comment on column aso.keywords.relevance_score is 'User-assigned relevance of the term to the app, 1–10. NULL = not assessed yet.';
comment on column aso.keywords.is_priority is 'Priority keywords are checked more often by scheduled collection.';

create index keywords_app_tracked_idx on aso.keywords (app_id, tracked);
create index keywords_platform_country_keyword_idx on aso.keywords (platform, country, keyword);

create trigger keywords_set_updated_at
  before update on aso.keywords
  for each row execute function aso.set_updated_at();

create or replace function aso.can_read_keyword(target_keyword_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from aso.keywords k
    join aso.apps a on a.id = k.app_id
    join aso.workspace_members m on m.workspace_id = a.workspace_id
    where k.id = target_keyword_id
      and m.user_id = (select auth.uid())
  );
$$;

create or replace function aso.can_write_keyword(target_keyword_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from aso.keywords k
    join aso.apps a on a.id = k.app_id
    join aso.workspace_members m on m.workspace_id = a.workspace_id
    where k.id = target_keyword_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin')
  );
$$;

-- ---------------------------------------------------------------------------
-- Collector runs (audit log for rank / popularity collection)
-- ---------------------------------------------------------------------------

create type aso.collector_run_status as enum ('running', 'succeeded', 'partial', 'failed');

create table aso.collector_runs (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references aso.apps (id) on delete cascade,
  job_type text not null check (job_type in ('keyword_ranks', 'keyword_popularity')),
  trigger text not null check (trigger in ('manual', 'scheduled')),
  status aso.collector_run_status not null default 'running',
  items_total integer not null default 0 check (items_total >= 0),
  items_succeeded integer not null default 0 check (items_succeeded >= 0),
  items_failed integer not null default 0 check (items_failed >= 0),
  items_skipped integer not null default 0 check (items_skipped >= 0),
  error_summary text,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  triggered_by uuid references auth.users (id) on delete set null,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index collector_runs_app_started_idx on aso.collector_runs (app_id, started_at desc);

-- ---------------------------------------------------------------------------
-- Observation history (append-only)
-- ---------------------------------------------------------------------------

create table aso.keyword_rank_history (
  id bigint generated always as identity primary key,
  keyword_id uuid not null references aso.keywords (id) on delete cascade,
  rank integer check (rank > 0),
  result_count integer check (result_count >= 0),
  search_depth integer not null check (search_depth > 0),
  source text not null check (source ~ '^[a-z0-9_]+$'),
  confidence aso.data_confidence not null,
  checked_at timestamptz not null default now(),
  collector_run_id uuid references aso.collector_runs (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint keyword_rank_history_rank_within_depth check (rank is null or rank <= search_depth)
);

comment on table aso.keyword_rank_history is 'Append-only rank observations. Never updated; one row per check.';
comment on column aso.keyword_rank_history.rank is
  'Position in the search results (1 = top). NULL = app not present within search_depth results.';
comment on column aso.keyword_rank_history.result_count is
  'Number of results the provider returned. result_count < search_depth means the result set was exhaustive.';
comment on column aso.keyword_rank_history.source is
  'Provider id, e.g. apple_itunes_search (unofficial → shown as Estimated Rank).';

create index keyword_rank_history_keyword_checked_idx
  on aso.keyword_rank_history (keyword_id, checked_at desc, id desc);

create table aso.keyword_popularity_history (
  id bigint generated always as identity primary key,
  keyword_id uuid not null references aso.keywords (id) on delete cascade,
  status text not null default 'measured' check (status in ('measured', 'below_threshold')),
  popularity_score numeric(5, 2) check (popularity_score between 0 and 100),
  source text not null check (source ~ '^[a-z0-9_]+$'),
  granularity text not null check (granularity in ('point', 'daily', 'weekly', 'monthly')),
  period_start date,
  period_end date,
  measured_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint keyword_popularity_history_score_matches_status
    check ((status = 'measured') = (popularity_score is not null)),
  constraint keyword_popularity_history_period_order
    check (period_start is null or period_end is null or period_end >= period_start)
);

comment on table aso.keyword_popularity_history is
  'Append-only popularity observations (Apple relative popularity, 1–100). Not search volume.';
comment on column aso.keyword_popularity_history.status is
  'below_threshold = the term was absent from the provider''s popular-terms dataset for that period (not zero).';

create index keyword_popularity_history_keyword_measured_idx
  on aso.keyword_popularity_history (keyword_id, measured_at desc, id desc);

create unique index keyword_popularity_history_period_key
  on aso.keyword_popularity_history (keyword_id, source, granularity, period_start)
  where period_start is not null;

create table aso.keyword_difficulty_history (
  id bigint generated always as identity primary key,
  keyword_id uuid not null references aso.keywords (id) on delete cascade,
  difficulty_score numeric(5, 2) not null check (difficulty_score between 0 and 100),
  method text not null check (method ~ '^[a-z0-9_]+$'),
  source text not null check (source ~ '^[a-z0-9_]+$'),
  sample_size integer not null check (sample_size >= 0),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  measured_at timestamptz not null default now(),
  collector_run_id uuid references aso.collector_runs (id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table aso.keyword_difficulty_history is
  'Append-only estimated difficulty (0–100). method names the algorithm; details holds its inputs.';

create index keyword_difficulty_history_keyword_measured_idx
  on aso.keyword_difficulty_history (keyword_id, measured_at desc, id desc);

-- Observations are immutable. The only permitted UPDATE is the FK action that
-- nulls collector_run_id when a run is deleted.
create or replace function aso.reject_observation_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (to_jsonb(new) - 'collector_run_id') is distinct from (to_jsonb(old) - 'collector_run_id') then
    raise exception '% is append-only: observations cannot be modified', tg_table_name
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger keyword_rank_history_append_only
  before update on aso.keyword_rank_history
  for each row execute function aso.reject_observation_changes();

create trigger keyword_popularity_history_append_only
  before update on aso.keyword_popularity_history
  for each row execute function aso.reject_observation_changes();

create trigger keyword_difficulty_history_append_only
  before update on aso.keyword_difficulty_history
  for each row execute function aso.reject_observation_changes();

-- ---------------------------------------------------------------------------
-- keyword_overview: one row per keyword with its latest observations.
-- security_invoker so the caller's RLS applies to every underlying table.
-- ---------------------------------------------------------------------------

create view aso.keyword_overview
with (security_invoker = true)
as
select
  k.id,
  k.app_id,
  k.keyword,
  k.platform,
  k.country,
  k.language,
  k.tracked,
  k.is_priority,
  k.relevance_score,
  k.notes,
  k.created_at,
  k.updated_at,
  latest_rank.rank as latest_rank,
  latest_rank.result_count as latest_result_count,
  latest_rank.search_depth as latest_search_depth,
  latest_rank.source as latest_rank_source,
  latest_rank.confidence as latest_rank_confidence,
  latest_rank.checked_at as latest_checked_at,
  previous_rank.rank as previous_rank,
  previous_rank.result_count as previous_result_count,
  previous_rank.search_depth as previous_search_depth,
  previous_rank.checked_at as previous_checked_at,
  latest_popularity.status as popularity_status,
  latest_popularity.popularity_score,
  latest_popularity.source as popularity_source,
  latest_popularity.measured_at as popularity_measured_at,
  latest_difficulty.difficulty_score,
  latest_difficulty.method as difficulty_method,
  latest_difficulty.source as difficulty_source,
  latest_difficulty.measured_at as difficulty_measured_at,
  coalesce(recent.observations, '[]'::jsonb) as recent_ranks
from aso.keywords k
left join lateral (
  select h.rank, h.result_count, h.search_depth, h.source, h.confidence, h.checked_at
  from aso.keyword_rank_history h
  where h.keyword_id = k.id
  order by h.checked_at desc, h.id desc
  limit 1
) latest_rank on true
left join lateral (
  select h.rank, h.result_count, h.search_depth, h.checked_at
  from aso.keyword_rank_history h
  where h.keyword_id = k.id
  order by h.checked_at desc, h.id desc
  offset 1
  limit 1
) previous_rank on true
left join lateral (
  select p.status, p.popularity_score, p.source, p.measured_at
  from aso.keyword_popularity_history p
  where p.keyword_id = k.id
  order by p.measured_at desc, p.id desc
  limit 1
) latest_popularity on true
left join lateral (
  select d.difficulty_score, d.method, d.source, d.measured_at
  from aso.keyword_difficulty_history d
  where d.keyword_id = k.id
  order by d.measured_at desc, d.id desc
  limit 1
) latest_difficulty on true
left join lateral (
  select jsonb_agg(
           jsonb_build_object(
             'rank', r.rank,
             'result_count', r.result_count,
             'search_depth', r.search_depth,
             'checked_at', r.checked_at
           )
           order by r.checked_at
         ) as observations
  from (
    select h.rank, h.result_count, h.search_depth, h.checked_at
    from aso.keyword_rank_history h
    where h.keyword_id = k.id
    order by h.checked_at desc, h.id desc
    limit 14
  ) r
) recent on true;

comment on view aso.keyword_overview is
  'Keywords with latest/previous rank, latest popularity and difficulty, and last 14 rank observations.';
