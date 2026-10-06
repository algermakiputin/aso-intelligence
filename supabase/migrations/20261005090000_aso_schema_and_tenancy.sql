-- ASO Intelligence: schema, tenancy model (workspaces → apps → store listings) and
-- listing metadata history.

create schema if not exists aso;
comment on schema aso is 'ASO Intelligence application schema.';

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type aso.workspace_role as enum ('owner', 'admin', 'viewer');
create type aso.platform as enum ('ios', 'android');
create type aso.data_confidence as enum ('low', 'medium', 'high');

-- ---------------------------------------------------------------------------
-- Shared trigger functions
-- ---------------------------------------------------------------------------

create or replace function aso.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Workspaces and membership
-- ---------------------------------------------------------------------------

create table aso.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  is_demo boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table aso.workspaces is 'Tenant boundary. Every app belongs to exactly one workspace.';
comment on column aso.workspaces.is_demo is
  'Demo workspaces hold synthetic data (source = demo). The UI labels them and collectors skip them.';

create trigger workspaces_set_updated_at
  before update on aso.workspaces
  for each row execute function aso.set_updated_at();

create table aso.workspace_members (
  workspace_id uuid not null references aso.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role aso.workspace_role not null default 'viewer',
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

comment on table aso.workspace_members is 'owner: full control incl. members; admin: manage data; viewer: read-only.';

create index workspace_members_user_id_idx on aso.workspace_members (user_id);

-- ---------------------------------------------------------------------------
-- Apps
-- ---------------------------------------------------------------------------

create table aso.apps (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references aso.workspaces (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  icon_url text check (icon_url is null or icon_url ~ '^https://'),
  default_country text not null check (default_country ~ '^[A-Z]{2}$'),
  default_language text not null check (default_language ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint apps_workspace_slug_key unique (workspace_id, slug)
);

comment on table aso.apps is 'A product tracked for ASO. Has zero or more store listings (iOS and/or Android).';
comment on column aso.apps.default_country is 'ISO 3166-1 alpha-2, upper case. Default storefront for new keywords.';
comment on column aso.apps.default_language is 'BCP 47 language tag, e.g. en or en-GB.';

create index apps_workspace_id_idx on aso.apps (workspace_id);

create trigger apps_set_updated_at
  before update on aso.apps
  for each row execute function aso.set_updated_at();

-- ---------------------------------------------------------------------------
-- Store listings
-- ---------------------------------------------------------------------------

create table aso.store_listings (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references aso.apps (id) on delete cascade,
  platform aso.platform not null,
  external_app_id text not null check (char_length(external_app_id) between 1 and 255),
  package_or_bundle_id text check (char_length(package_or_bundle_id) <= 255),
  country text not null check (country ~ '^[A-Z]{2}$'),
  language text not null check (language ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$'),
  title text check (char_length(title) <= 255),
  subtitle_or_short_description text check (char_length(subtitle_or_short_description) <= 255),
  keyword_field text check (char_length(keyword_field) <= 100),
  description text check (char_length(description) <= 10000),
  developer_name text check (char_length(developer_name) <= 255),
  primary_category text check (char_length(primary_category) <= 100),
  metadata_source text not null default 'manual' check (metadata_source ~ '^[a-z0-9_]+$'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint store_listings_storefront_key unique (app_id, platform, country, language),
  constraint store_listings_ios_numeric_id check (platform <> 'ios' or external_app_id ~ '^[0-9]+$'),
  constraint store_listings_keyword_field_ios_only check (platform = 'ios' or keyword_field is null)
);

comment on table aso.store_listings is 'One row per app × platform × storefront country × language.';
comment on column aso.store_listings.external_app_id is 'iOS: numeric App Store ID (trackId). Android: package name.';
comment on column aso.store_listings.subtitle_or_short_description is 'iOS subtitle or Google Play short description.';
comment on column aso.store_listings.keyword_field is 'iOS App Store Connect keyword field (private, entered manually).';
comment on column aso.store_listings.metadata_source is 'Origin of the current metadata, e.g. manual or apple_itunes_lookup.';
comment on column aso.store_listings.metadata is 'Store-specific extras (version, rating, genre ids…). Not used for filtering.';

create index store_listings_app_platform_idx on aso.store_listings (app_id, platform);
create index store_listings_platform_external_idx on aso.store_listings (platform, external_app_id);

create trigger store_listings_set_updated_at
  before update on aso.store_listings
  for each row execute function aso.set_updated_at();

-- ---------------------------------------------------------------------------
-- Metadata snapshots: history of our own listing metadata
-- ---------------------------------------------------------------------------

create table aso.metadata_snapshots (
  id bigint generated always as identity primary key,
  store_listing_id uuid not null references aso.store_listings (id) on delete cascade,
  title text,
  subtitle_or_short_description text,
  keyword_field text,
  description text,
  version text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  source text not null check (source ~ '^[a-z0-9_]+$'),
  captured_by uuid references auth.users (id) on delete set null,
  captured_at timestamptz not null default now()
);

comment on table aso.metadata_snapshots is
  'Append-only history of listing metadata. Written by trigger whenever listing text fields change.';

create index metadata_snapshots_listing_captured_idx
  on aso.metadata_snapshots (store_listing_id, captured_at desc);

create or replace function aso.capture_listing_metadata_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT'
     and new.title is null
     and new.subtitle_or_short_description is null
     and new.keyword_field is null
     and new.description is null then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.title is not distinct from old.title
     and new.subtitle_or_short_description is not distinct from old.subtitle_or_short_description
     and new.keyword_field is not distinct from old.keyword_field
     and new.description is not distinct from old.description then
    return new;
  end if;

  insert into aso.metadata_snapshots (
    store_listing_id, title, subtitle_or_short_description, keyword_field, description,
    version, source, captured_by
  ) values (
    new.id, new.title, new.subtitle_or_short_description, new.keyword_field, new.description,
    new.metadata ->> 'version', new.metadata_source, auth.uid()
  );

  return new;
end;
$$;

create trigger store_listings_capture_metadata_snapshot
  after insert or update on aso.store_listings
  for each row execute function aso.capture_listing_metadata_snapshot();

-- ---------------------------------------------------------------------------
-- Access helpers (SECURITY DEFINER so RLS policies don't recurse through
-- workspace_members policies; auth.uid() wrapped in a scalar subquery so it is
-- evaluated once per statement).
-- ---------------------------------------------------------------------------

create or replace function aso.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from aso.workspace_members m
    where m.workspace_id = target_workspace_id
      and m.user_id = (select auth.uid())
  );
$$;

create or replace function aso.has_workspace_role(
  target_workspace_id uuid,
  allowed_roles aso.workspace_role[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from aso.workspace_members m
    where m.workspace_id = target_workspace_id
      and m.user_id = (select auth.uid())
      and m.role = any (allowed_roles)
  );
$$;

create or replace function aso.can_read_app(target_app_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from aso.apps a
    join aso.workspace_members m on m.workspace_id = a.workspace_id
    where a.id = target_app_id
      and m.user_id = (select auth.uid())
  );
$$;

create or replace function aso.can_write_app(target_app_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from aso.apps a
    join aso.workspace_members m on m.workspace_id = a.workspace_id
    where a.id = target_app_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin')
  );
$$;

-- ---------------------------------------------------------------------------
-- Workspace creation RPC: creates the workspace and the caller's owner
-- membership atomically. Clients have no direct INSERT policy on workspaces.
-- ---------------------------------------------------------------------------

create or replace function aso.create_workspace(workspace_name text)
returns aso.workspaces
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  created aso.workspaces;
begin
  if caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  insert into aso.workspaces (name, created_by)
  values (btrim(workspace_name), caller_id)
  returning * into created;

  insert into aso.workspace_members (workspace_id, user_id, role)
  values (created.id, caller_id, 'owner');

  return created;
end;
$$;
