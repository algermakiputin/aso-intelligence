-- Official store analytics, imported from App Store Connect Analytics Reports.
--
-- Apple delivers each report as "instances" (one per processing date). A newer instance
-- replaces earlier ones for every date it covers, so rows are never summed across
-- instances: we keep every instance (append-only) and `store_analytics_daily` exposes,
-- per app, report and date, only the rows of the latest instance covering that date.
-- Only additive event counts are stored; Apple's unique counts can't be summed across
-- territories or sources without double counting.

alter table aso.collector_runs drop constraint collector_runs_job_type_check;
alter table aso.collector_runs add constraint collector_runs_job_type_check
  check (job_type in ('keyword_ranks', 'keyword_popularity', 'store_analytics'));

-- ---------------------------------------------------------------------------
-- Imports: one row per report instance ingested
-- ---------------------------------------------------------------------------

create table aso.store_analytics_imports (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references aso.apps (id) on delete cascade,
  platform aso.platform not null,
  source text not null check (source ~ '^[a-z0-9_]+$'),
  report text not null check (report ~ '^[a-z0-9_]+$'),
  granularity text not null check (granularity in ('daily', 'weekly', 'monthly')),
  processing_date date not null,
  external_instance_id text not null check (char_length(external_instance_id) between 1 and 255),
  row_count integer not null check (row_count >= 0),
  first_metric_date date,
  last_metric_date date,
  collector_run_id uuid references aso.collector_runs (id) on delete set null,
  imported_by uuid references auth.users (id) on delete set null,
  imported_at timestamptz not null default now(),
  constraint store_analytics_imports_instance_key unique (app_id, source, external_instance_id),
  constraint store_analytics_imports_coverage
    check ((first_metric_date is null) = (last_metric_date is null)
           and (first_metric_date is null or last_metric_date >= first_metric_date))
);

comment on table aso.store_analytics_imports is
  'One row per imported analytics report instance. first/last_metric_date is the date range the instance covers; inside it, a date without rows had no events.';

create index store_analytics_imports_app_report_idx
  on aso.store_analytics_imports (app_id, source, report, processing_date desc);

-- ---------------------------------------------------------------------------
-- Metrics: additive daily counts per instance (append-only)
-- ---------------------------------------------------------------------------

create table aso.store_analytics_metrics (
  id bigint generated always as identity primary key,
  import_id uuid not null references aso.store_analytics_imports (id) on delete cascade,
  app_id uuid not null references aso.apps (id) on delete cascade,
  metric_date date not null,
  territory text not null check (char_length(territory) between 1 and 64),
  source_type text not null check (source_type ~ '^[a-z0-9_]+$'),
  metric text not null check (metric in ('impressions', 'product_page_views', 'first_time_downloads', 'redownloads')),
  value bigint not null check (value >= 0),
  created_at timestamptz not null default now(),
  constraint store_analytics_metrics_dimension_key unique (import_id, metric_date, territory, source_type, metric)
);

comment on table aso.store_analytics_metrics is
  'Append-only additive event counts (Apple "Counts") per instance, date, territory, source type and metric.';

create index store_analytics_metrics_app_date_idx
  on aso.store_analytics_metrics (app_id, metric_date);

create trigger store_analytics_metrics_append_only
  before update on aso.store_analytics_metrics
  for each row execute function aso.reject_observation_changes();

-- ---------------------------------------------------------------------------
-- Atomic import of one instance (runs as the caller, so RLS applies)
-- ---------------------------------------------------------------------------

create or replace function aso.import_store_analytics_instance(
  p_app_id uuid,
  p_platform aso.platform,
  p_source text,
  p_report text,
  p_granularity text,
  p_processing_date date,
  p_external_instance_id text,
  p_rows jsonb,
  p_first_metric_date date default null,
  p_last_metric_date date default null,
  p_collector_run_id uuid default null,
  p_imported_by uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  new_id uuid;
begin
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array' using errcode = '22023';
  end if;

  insert into aso.store_analytics_imports (
    app_id, platform, source, report, granularity, processing_date, external_instance_id,
    row_count, first_metric_date, last_metric_date, collector_run_id, imported_by
  ) values (
    p_app_id, p_platform, p_source, p_report, p_granularity, p_processing_date,
    p_external_instance_id, jsonb_array_length(p_rows), p_first_metric_date, p_last_metric_date,
    p_collector_run_id, p_imported_by
  )
  on conflict (app_id, source, external_instance_id) do nothing
  returning id into new_id;

  if new_id is null then
    return null; -- already imported
  end if;

  insert into aso.store_analytics_metrics (import_id, app_id, metric_date, territory, source_type, metric, value)
  select new_id, p_app_id, r.metric_date, r.territory, r.source_type, r.metric, r.value
  from jsonb_to_recordset(p_rows) as r(
    metric_date date, territory text, source_type text, metric text, value bigint
  );

  return new_id;
end;
$$;

comment on function aso.import_store_analytics_instance is
  'Inserts one analytics report instance and its rows in one transaction. Returns NULL if the instance was already imported.';

-- ---------------------------------------------------------------------------
-- store_analytics_daily: the effective daily numbers (latest covering instance wins)
-- ---------------------------------------------------------------------------

create view aso.store_analytics_daily
with (security_invoker = true)
as
with coverage as (
  select distinct on (i.app_id, i.source, i.report, d.metric_date)
    i.id as import_id,
    i.app_id,
    i.platform,
    i.source,
    i.report,
    i.processing_date,
    d.metric_date
  from aso.store_analytics_imports i
  cross join lateral (
    select g::date as metric_date
    from generate_series(i.first_metric_date, i.last_metric_date, interval '1 day') g
  ) d
  where i.granularity = 'daily'
    and i.first_metric_date is not null
  order by i.app_id, i.source, i.report, d.metric_date,
           i.processing_date desc, i.imported_at desc, i.id desc
)
select
  c.app_id,
  c.platform,
  c.source,
  c.report,
  c.processing_date,
  m.metric_date,
  m.territory,
  m.source_type,
  m.metric,
  m.value
from coverage c
join aso.store_analytics_metrics m
  on m.import_id = c.import_id
 and m.metric_date = c.metric_date;

comment on view aso.store_analytics_daily is
  'Daily analytics rows from the latest instance covering each app × report × date. Never sums across instances.';

-- ---------------------------------------------------------------------------
-- Grants and RLS
-- ---------------------------------------------------------------------------

alter table aso.store_analytics_imports enable row level security;
alter table aso.store_analytics_metrics enable row level security;

grant select, insert on aso.store_analytics_imports, aso.store_analytics_metrics to authenticated;
revoke update, delete on aso.store_analytics_imports, aso.store_analytics_metrics from authenticated;
grant all on aso.store_analytics_imports, aso.store_analytics_metrics to service_role;
grant select on aso.store_analytics_daily to authenticated, service_role;
revoke execute on function aso.import_store_analytics_instance from public, anon;
grant execute on function aso.import_store_analytics_instance to authenticated, service_role;

create policy "Members can view analytics imports"
  on aso.store_analytics_imports for select to authenticated
  using (aso.can_read_app(app_id));

create policy "Editors can import analytics"
  on aso.store_analytics_imports for insert to authenticated
  with check (aso.can_write_app(app_id));

create policy "Members can view analytics metrics"
  on aso.store_analytics_metrics for select to authenticated
  using (aso.can_read_app(app_id));

create policy "Editors can append analytics metrics"
  on aso.store_analytics_metrics for insert to authenticated
  with check (
    aso.can_write_app(app_id)
    and exists (
      select 1 from aso.store_analytics_imports i
      where i.id = import_id and i.app_id = store_analytics_metrics.app_id
    )
  );

-- ---------------------------------------------------------------------------
-- store_analytics_breakdown: everything the Analytics page needs, in one JSON value
-- (avoids the API row limit). `covered` lists, per report, the dates some imported
-- instance covers: inside it a missing value means zero events, outside it no data.
-- ---------------------------------------------------------------------------

create or replace function aso.store_analytics_breakdown(
  p_app_id uuid,
  p_source text,
  p_from date,
  p_to date,
  p_series_from date
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'days', coalesce((
      select jsonb_agg(jsonb_build_object('date', d.metric_date, 'metric', d.metric, 'value', d.value)
                       order by d.metric_date, d.metric)
      from (
        select metric_date, metric, sum(value)::bigint as value
        from aso.store_analytics_daily
        where app_id = p_app_id and source = p_source
          and metric_date between p_series_from and p_to
        group by metric_date, metric
      ) d
    ), '[]'::jsonb),
    'sources', coalesce((
      select jsonb_agg(jsonb_build_object('key', s.source_type, 'metric', s.metric, 'value', s.value))
      from (
        select source_type, metric, sum(value)::bigint as value
        from aso.store_analytics_daily
        where app_id = p_app_id and source = p_source and metric_date between p_from and p_to
        group by source_type, metric
      ) s
    ), '[]'::jsonb),
    'territories', coalesce((
      select jsonb_agg(jsonb_build_object('key', t.territory, 'metric', t.metric, 'value', t.value))
      from (
        select territory, metric, sum(value)::bigint as value
        from aso.store_analytics_daily
        where app_id = p_app_id and source = p_source and metric_date between p_from and p_to
        group by territory, metric
      ) t
    ), '[]'::jsonb),
    'covered', coalesce((
      select jsonb_agg(jsonb_build_object('report', c.report, 'date', c.metric_date)
                       order by c.report, c.metric_date)
      from (
        select distinct i.report, g::date as metric_date
        from aso.store_analytics_imports i
        cross join lateral generate_series(
          greatest(i.first_metric_date, p_series_from),
          least(i.last_metric_date, p_to),
          interval '1 day'
        ) g
        where i.app_id = p_app_id and i.source = p_source and i.granularity = 'daily'
          and i.first_metric_date is not null
      ) c
    ), '[]'::jsonb),
    'reports', coalesce((
      select jsonb_agg(jsonb_build_object(
        'report', r.report,
        'latestProcessingDate', r.latest_processing_date,
        'lastImportedAt', r.last_imported_at,
        'imports', r.imports
      ))
      from (
        select report, max(processing_date) as latest_processing_date,
               max(imported_at) as last_imported_at, count(*) as imports
        from aso.store_analytics_imports
        where app_id = p_app_id and source = p_source and granularity = 'daily'
        group by report
      ) r
    ), '[]'::jsonb)
  );
$$;

revoke execute on function aso.store_analytics_breakdown from public, anon;
grant execute on function aso.store_analytics_breakdown to authenticated, service_role;
