-- Apple Search Term Popularity returns several official metrics per term
-- (searchPopularity1to100, searchPopularityInGenre, searchPopularity1to5, rankInGenre)
-- for a specific genre and period. popularity_score keeps the storefront-wide 1–100
-- value; the rest is stored as provided in `details`.

alter table aso.keyword_popularity_history
  add column details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object');

comment on column aso.keyword_popularity_history.details is
  'Provider fields stored as returned, e.g. Apple genre, rankInGenre, searchPopularityInGenre, searchPopularity1to5.';

comment on column aso.keyword_popularity_history.status is
  'measured = the provider returned a value. below_threshold = the provider''s dataset for the period did not include the term (Apple only reports terms above its eligibility threshold). Never a zero.';

comment on column aso.keyword_rank_history.result_count is
  'Number of results the provider returned. Apple can return fewer than requested without the list being complete, so an unranked row only proves the app is outside the top result_count.';

-- keyword_overview: same columns as before, plus the latest popularity's period and details.
-- New columns are appended so `create or replace view` stays compatible.
create or replace view aso.keyword_overview
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
  coalesce(recent.observations, '[]'::jsonb) as recent_ranks,
  latest_popularity.granularity as popularity_granularity,
  latest_popularity.period_start as popularity_period_start,
  latest_popularity.period_end as popularity_period_end,
  latest_popularity.details as popularity_details
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
  select p.status, p.popularity_score, p.source, p.measured_at, p.granularity,
         p.period_start, p.period_end, p.details
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
  'Keywords with latest/previous rank, latest popularity (with period and details) and difficulty, and last 14 rank observations.';
