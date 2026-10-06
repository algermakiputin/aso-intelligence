-- ASO Intelligence: privileges and row-level security.
--
-- Model:
--   * Members of a workspace can read everything in it.
--   * owner / admin can write apps, listings, keywords, events and append observations.
--   * Only owners manage memberships. Workspaces are created via aso.create_workspace().
--   * History tables have no UPDATE/DELETE policies (append-only); rows are removed
--     only by ON DELETE CASCADE from their keyword.
--   * anon has no table privileges.

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

grant usage on schema aso to anon, authenticated, service_role;

grant select, insert, update, delete on all tables in schema aso to authenticated;
grant all on all tables in schema aso to service_role;
grant usage, select on all sequences in schema aso to authenticated, service_role;

-- Append-only tables: clients may read and insert, never modify.
revoke update, delete on
  aso.keyword_rank_history,
  aso.keyword_popularity_history,
  aso.keyword_difficulty_history,
  aso.metadata_snapshots,
  aso.competitor_snapshots
from authenticated;
revoke insert on aso.metadata_snapshots from authenticated;

alter default privileges in schema aso grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema aso grant all on tables to service_role;
alter default privileges in schema aso grant usage, select on sequences to authenticated, service_role;

-- Functions: nothing executable by PUBLIC/anon.
revoke execute on all functions in schema aso from public, anon;
grant execute on all functions in schema aso to authenticated, service_role;
alter default privileges in schema aso revoke execute on functions from public;
alter default privileges in schema aso grant execute on functions to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Enable RLS
-- ---------------------------------------------------------------------------

alter table aso.workspaces enable row level security;
alter table aso.workspace_members enable row level security;
alter table aso.apps enable row level security;
alter table aso.store_listings enable row level security;
alter table aso.metadata_snapshots enable row level security;
alter table aso.keywords enable row level security;
alter table aso.collector_runs enable row level security;
alter table aso.keyword_rank_history enable row level security;
alter table aso.keyword_popularity_history enable row level security;
alter table aso.keyword_difficulty_history enable row level security;
alter table aso.competitors enable row level security;
alter table aso.competitor_snapshots enable row level security;
alter table aso.aso_events enable row level security;

-- ---------------------------------------------------------------------------
-- workspaces
-- ---------------------------------------------------------------------------

create policy "Members can view their workspaces"
  on aso.workspaces for select to authenticated
  using (aso.is_workspace_member(id));

create policy "Owners and admins can update workspaces"
  on aso.workspaces for update to authenticated
  using (aso.has_workspace_role(id, array['owner', 'admin']::aso.workspace_role[]))
  with check (aso.has_workspace_role(id, array['owner', 'admin']::aso.workspace_role[]));

create policy "Owners can delete workspaces"
  on aso.workspaces for delete to authenticated
  using (aso.has_workspace_role(id, array['owner']::aso.workspace_role[]));

-- ---------------------------------------------------------------------------
-- workspace_members
-- ---------------------------------------------------------------------------

create policy "Members can view fellow members"
  on aso.workspace_members for select to authenticated
  using (aso.is_workspace_member(workspace_id));

create policy "Owners can add members"
  on aso.workspace_members for insert to authenticated
  with check (aso.has_workspace_role(workspace_id, array['owner']::aso.workspace_role[]));

create policy "Owners can change member roles"
  on aso.workspace_members for update to authenticated
  using (aso.has_workspace_role(workspace_id, array['owner']::aso.workspace_role[]))
  with check (aso.has_workspace_role(workspace_id, array['owner']::aso.workspace_role[]));

create policy "Owners can remove members"
  on aso.workspace_members for delete to authenticated
  using (aso.has_workspace_role(workspace_id, array['owner']::aso.workspace_role[]));

-- ---------------------------------------------------------------------------
-- apps
-- ---------------------------------------------------------------------------

create policy "Members can view apps"
  on aso.apps for select to authenticated
  using (aso.is_workspace_member(workspace_id));

create policy "Owners and admins can create apps"
  on aso.apps for insert to authenticated
  with check (aso.has_workspace_role(workspace_id, array['owner', 'admin']::aso.workspace_role[]));

create policy "Owners and admins can update apps"
  on aso.apps for update to authenticated
  using (aso.has_workspace_role(workspace_id, array['owner', 'admin']::aso.workspace_role[]))
  with check (aso.has_workspace_role(workspace_id, array['owner', 'admin']::aso.workspace_role[]));

create policy "Owners and admins can delete apps"
  on aso.apps for delete to authenticated
  using (aso.has_workspace_role(workspace_id, array['owner', 'admin']::aso.workspace_role[]));

-- ---------------------------------------------------------------------------
-- App-scoped tables: store_listings, keywords, competitors, aso_events
-- ---------------------------------------------------------------------------

create policy "Members can view listings"
  on aso.store_listings for select to authenticated
  using (aso.can_read_app(app_id));
create policy "Editors can create listings"
  on aso.store_listings for insert to authenticated
  with check (aso.can_write_app(app_id));
create policy "Editors can update listings"
  on aso.store_listings for update to authenticated
  using (aso.can_write_app(app_id))
  with check (aso.can_write_app(app_id));
create policy "Editors can delete listings"
  on aso.store_listings for delete to authenticated
  using (aso.can_write_app(app_id));

create policy "Members can view keywords"
  on aso.keywords for select to authenticated
  using (aso.can_read_app(app_id));
create policy "Editors can create keywords"
  on aso.keywords for insert to authenticated
  with check (aso.can_write_app(app_id));
create policy "Editors can update keywords"
  on aso.keywords for update to authenticated
  using (aso.can_write_app(app_id))
  with check (aso.can_write_app(app_id));
create policy "Editors can delete keywords"
  on aso.keywords for delete to authenticated
  using (aso.can_write_app(app_id));

create policy "Members can view competitors"
  on aso.competitors for select to authenticated
  using (aso.can_read_app(app_id));
create policy "Editors can create competitors"
  on aso.competitors for insert to authenticated
  with check (aso.can_write_app(app_id));
create policy "Editors can update competitors"
  on aso.competitors for update to authenticated
  using (aso.can_write_app(app_id))
  with check (aso.can_write_app(app_id));
create policy "Editors can delete competitors"
  on aso.competitors for delete to authenticated
  using (aso.can_write_app(app_id));

create policy "Members can view ASO events"
  on aso.aso_events for select to authenticated
  using (aso.can_read_app(app_id));
create policy "Editors can create ASO events"
  on aso.aso_events for insert to authenticated
  with check (aso.can_write_app(app_id));
create policy "Editors can update ASO events"
  on aso.aso_events for update to authenticated
  using (aso.can_write_app(app_id))
  with check (aso.can_write_app(app_id));
create policy "Editors can delete ASO events"
  on aso.aso_events for delete to authenticated
  using (aso.can_write_app(app_id));

-- ---------------------------------------------------------------------------
-- collector_runs: readable by members, written by editors (manual refresh).
-- Scheduled runs use the service role.
-- ---------------------------------------------------------------------------

create policy "Members can view collector runs"
  on aso.collector_runs for select to authenticated
  using (aso.can_read_app(app_id));
create policy "Editors can start collector runs"
  on aso.collector_runs for insert to authenticated
  with check (aso.can_write_app(app_id));
create policy "Editors can finish collector runs"
  on aso.collector_runs for update to authenticated
  using (aso.can_write_app(app_id))
  with check (aso.can_write_app(app_id));

-- ---------------------------------------------------------------------------
-- Keyword observation history (append-only)
-- ---------------------------------------------------------------------------

create policy "Members can view rank history"
  on aso.keyword_rank_history for select to authenticated
  using (aso.can_read_keyword(keyword_id));
create policy "Editors can append rank observations"
  on aso.keyword_rank_history for insert to authenticated
  with check (aso.can_write_keyword(keyword_id));

create policy "Members can view popularity history"
  on aso.keyword_popularity_history for select to authenticated
  using (aso.can_read_keyword(keyword_id));
create policy "Editors can append popularity observations"
  on aso.keyword_popularity_history for insert to authenticated
  with check (aso.can_write_keyword(keyword_id));

create policy "Members can view difficulty history"
  on aso.keyword_difficulty_history for select to authenticated
  using (aso.can_read_keyword(keyword_id));
create policy "Editors can append difficulty estimates"
  on aso.keyword_difficulty_history for insert to authenticated
  with check (aso.can_write_keyword(keyword_id));

-- ---------------------------------------------------------------------------
-- Snapshots
-- ---------------------------------------------------------------------------

create policy "Members can view listing metadata history"
  on aso.metadata_snapshots for select to authenticated
  using (
    exists (
      select 1 from aso.store_listings l
      where l.id = store_listing_id and aso.can_read_app(l.app_id)
    )
  );

create policy "Members can view competitor snapshots"
  on aso.competitor_snapshots for select to authenticated
  using (
    exists (
      select 1 from aso.competitors c
      where c.id = competitor_id and aso.can_read_app(c.app_id)
    )
  );
create policy "Editors can append competitor snapshots"
  on aso.competitor_snapshots for insert to authenticated
  with check (
    exists (
      select 1 from aso.competitors c
      where c.id = competitor_id and aso.can_write_app(c.app_id)
    )
  );
