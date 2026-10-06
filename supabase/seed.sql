-- Local development seed. Runs on `supabase start` / `supabase db reset` only;
-- `supabase db push` never applies it, so none of this reaches production.
--
--   Dev login:   dev@example.com / aso-dev-password
--
--   1. Workspace "Hunter Vault": the real Hunter Vault app with its real store
--      identifiers. No metrics are seeded. Rankings come from real rank checks.
--   2. Workspace "Demo workspace" (is_demo = true): a fictional app with synthetic
--      history (source = demo). The UI labels it "Demo data" on every page and the
--      collectors skip it.

-- ---------------------------------------------------------------------------
-- Dev user
-- ---------------------------------------------------------------------------

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token
) values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-4000-8000-00000000d001',
  'authenticated',
  'authenticated',
  'dev@example.com',
  extensions.crypt('aso-dev-password', extensions.gen_salt('bf')),
  now(),
  '{"provider": "email", "providers": ["email"]}',
  '{"display_name": "Dev"}',
  now(),
  now(),
  '', '', '', '', '', '', '', ''
);

insert into auth.identities (
  id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(),
  '00000000-0000-4000-8000-00000000d001',
  '00000000-0000-4000-8000-00000000d001',
  jsonb_build_object(
    'sub', '00000000-0000-4000-8000-00000000d001',
    'email', 'dev@example.com',
    'email_verified', true
  ),
  'email',
  now(),
  now(),
  now()
);

-- ---------------------------------------------------------------------------
-- Hunter Vault (real app, no fabricated data)
-- ---------------------------------------------------------------------------

insert into aso.workspaces (id, name, created_by)
values ('10000000-0000-4000-8000-000000000001', 'Hunter Vault', '00000000-0000-4000-8000-00000000d001');

insert into aso.workspace_members (workspace_id, user_id, role)
values ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000d001', 'owner');

insert into aso.apps (id, workspace_id, name, slug, default_country, default_language)
values (
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'Hunter Vault',
  'hunter-vault',
  'US',
  'en'
);

-- Listing metadata (title, description…) is intentionally left empty. Use
-- Settings → Store listings → "Sync from App Store" to import the live values.
insert into aso.store_listings (app_id, platform, external_app_id, package_or_bundle_id, country, language)
values ('20000000-0000-4000-8000-000000000001', 'ios', '6761086056', 'com.hunter.vault', 'US', 'en');

-- ---------------------------------------------------------------------------
-- Demo workspace (synthetic data, clearly marked)
-- ---------------------------------------------------------------------------

insert into aso.workspaces (id, name, is_demo, created_by)
values ('10000000-0000-4000-8000-0000000000de', 'Demo workspace', true, '00000000-0000-4000-8000-00000000d001');

insert into aso.workspace_members (workspace_id, user_id, role)
values ('10000000-0000-4000-8000-0000000000de', '00000000-0000-4000-8000-00000000d001', 'owner');

insert into aso.apps (id, workspace_id, name, slug, default_country, default_language)
values (
  '20000000-0000-4000-8000-0000000000de',
  '10000000-0000-4000-8000-0000000000de',
  'Budget Quest (demo)',
  'budget-quest-demo',
  'US',
  'en'
);

insert into aso.store_listings (
  app_id, platform, external_app_id, package_or_bundle_id, country, language,
  title, subtitle_or_short_description, keyword_field, description, developer_name,
  primary_category, metadata_source
) values (
  '20000000-0000-4000-8000-0000000000de',
  'ios',
  '1000000001',
  'com.example.budgetquest',
  'US',
  'en',
  'Budget Quest: Money RPG',
  'Gamified budget planner',
  'game,rpg,savings,challenge,finance,expense,debt,payoff,quest',
  'Budget Quest is a fictional demo app. Track spending, build savings streaks and level up a hero as you pay down debt.',
  'Demo Studio',
  'Finance',
  'demo'
);

do $$
declare
  demo_app constant uuid := '20000000-0000-4000-8000-0000000000de';
  kw record;
  keyword_id uuid;
  day_offset integer;
  progress numeric;
  noisy numeric;
  observed integer;
  week_offset integer;
begin
  perform setseed(0.42);

  for kw in
    select *
    from (values
      -- keyword,              relevance, priority, popularity, start rank, end rank, difficulty
      ('budget tracker',       10, true,  88, null::int, null::int, 92),
      ('budget game',          10, true,  34, 64,        46,        31),
      ('gamified budget',      10, true,  19, 41,        18,        18),
      ('budget planner',        9, false, 72, 164,       121,       85),
      ('expense tracker',       8, false, 81, null,      null,      90),
      ('money rpg',             9, false,  8, 12,        4,         9),
      ('savings challenge',     7, false, 41, 77,        38,        52),
      ('debt payoff',           6, false, 29, 96,        71,        44),
      ('finance game',          9, true,  15, 27,        9,         22),
      ('budget app',            8, false, 76, 188,       152,       95)
    ) as t(keyword, relevance, priority, popularity, start_rank, end_rank, difficulty)
  loop
    insert into aso.keywords (app_id, keyword, platform, country, language, relevance_score, is_priority, notes)
    values (demo_app, kw.keyword, 'ios', 'US', 'en', kw.relevance, kw.priority, 'Demo keyword with synthetic data.')
    returning id into keyword_id;

    -- 90 days of daily rank observations (linear trend + noise).
    for day_offset in reverse 90..0 loop
      if kw.start_rank is null then
        observed := null;
      else
        progress := (90 - day_offset)::numeric / 90;
        noisy := kw.start_rank + (kw.end_rank - kw.start_rank) * progress
                 + (random() - 0.5) * (2 + kw.start_rank * 0.12);
        observed := greatest(1, round(noisy))::int;
        if observed > 200 then
          observed := null;
        end if;
      end if;

      insert into aso.keyword_rank_history (keyword_id, rank, result_count, search_depth, source, confidence, checked_at)
      values (keyword_id, observed, 200, 200, 'demo', 'low', now() - make_interval(days => day_offset, hours => 2));
    end loop;

    -- 12 weeks of popularity.
    for week_offset in reverse 11..0 loop
      insert into aso.keyword_popularity_history (
        keyword_id, status, popularity_score, source, granularity, period_start, period_end, measured_at
      ) values (
        keyword_id,
        'measured',
        least(100, greatest(1, kw.popularity + round(((random() - 0.5) * 6)::numeric, 0))),
        'demo',
        'weekly',
        (date_trunc('week', now()) - make_interval(weeks => week_offset + 1))::date,
        (date_trunc('week', now()) - make_interval(weeks => week_offset) - interval '1 day')::date,
        date_trunc('week', now()) - make_interval(weeks => week_offset)
      );
    end loop;

    insert into aso.keyword_difficulty_history (keyword_id, difficulty_score, method, source, sample_size, details, measured_at)
    values (keyword_id, kw.difficulty, 'serp_strength_v1', 'demo', 10, '{"note": "synthetic demo value"}', now() - interval '2 hours');
  end loop;
end;
$$;

insert into aso.aso_events (app_id, platform, event_type, title, description, before_data, after_data, happened_at, source)
values
  (
    '20000000-0000-4000-8000-0000000000de', 'ios', 'release', 'Version 2.0 released',
    'Demo event: quests and savings streaks.', null, null, now() - interval '52 days', 'demo'
  ),
  (
    '20000000-0000-4000-8000-0000000000de', 'ios', 'title_change', 'Title changed',
    'Demo event: added "Money RPG" to the title.',
    '{"text": "Budget Quest"}', '{"text": "Budget Quest: Money RPG"}', now() - interval '30 days', 'demo'
  ),
  (
    '20000000-0000-4000-8000-0000000000de', 'ios', 'keyword_change', 'Keyword field updated',
    'Demo event: replaced "money" with "debt,payoff".',
    '{"text": "game,rpg,savings,challenge,finance,expense,money,quest"}',
    '{"text": "game,rpg,savings,challenge,finance,expense,debt,payoff,quest"}',
    now() - interval '11 days', 'demo'
  );
