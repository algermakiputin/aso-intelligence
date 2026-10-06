-- ASO Intelligence: competitors (schema for V0.3) and the ASO change timeline.

-- ---------------------------------------------------------------------------
-- Competitors
-- ---------------------------------------------------------------------------

create table aso.competitors (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references aso.apps (id) on delete cascade,
  platform aso.platform not null,
  competitor_external_id text not null check (char_length(competitor_external_id) between 1 and 255),
  name text not null check (char_length(btrim(name)) between 1 and 255),
  icon_url text check (icon_url is null or icon_url ~ '^https://'),
  developer_name text check (char_length(developer_name) <= 255),
  tracked boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint competitors_app_platform_external_key unique (app_id, platform, competitor_external_id)
);

create index competitors_app_idx on aso.competitors (app_id);

create trigger competitors_set_updated_at
  before update on aso.competitors
  for each row execute function aso.set_updated_at();

create table aso.competitor_snapshots (
  id bigint generated always as identity primary key,
  competitor_id uuid not null references aso.competitors (id) on delete cascade,
  country text not null check (country ~ '^[A-Z]{2}$'),
  title text,
  subtitle text,
  description text,
  rating numeric(3, 2) check (rating between 0 and 5),
  rating_count integer check (rating_count >= 0),
  version text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  source text not null check (source ~ '^[a-z0-9_]+$'),
  captured_at timestamptz not null default now()
);

comment on table aso.competitor_snapshots is 'Append-only competitor listing snapshots per storefront.';

create index competitor_snapshots_competitor_captured_idx
  on aso.competitor_snapshots (competitor_id, captured_at desc);

-- ---------------------------------------------------------------------------
-- ASO events: manually recorded (later: detected) listing changes and releases.
-- Used for the change timeline and as chart annotations.
-- ---------------------------------------------------------------------------

create type aso.aso_event_type as enum (
  'title_change',
  'subtitle_change',
  'keyword_change',
  'description_change',
  'screenshot_change',
  'icon_change',
  'release',
  'custom'
);

create table aso.aso_events (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references aso.apps (id) on delete cascade,
  platform aso.platform,
  country text check (country ~ '^[A-Z]{2}$'),
  event_type aso.aso_event_type not null,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  description text check (char_length(description) <= 5000),
  before_data jsonb check (before_data is null or jsonb_typeof(before_data) = 'object'),
  after_data jsonb check (after_data is null or jsonb_typeof(after_data) = 'object'),
  happened_at timestamptz not null,
  source text not null default 'manual' check (source ~ '^[a-z0-9_]+$'),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column aso.aso_events.platform is 'NULL = applies to all platforms.';
comment on column aso.aso_events.country is 'NULL = applies to all storefronts.';
comment on column aso.aso_events.before_data is 'Shape depends on event_type, e.g. {"text": "Hunter Vault"} for text changes.';

create index aso_events_app_happened_idx on aso.aso_events (app_id, happened_at desc);

create trigger aso_events_set_updated_at
  before update on aso.aso_events
  for each row execute function aso.set_updated_at();
