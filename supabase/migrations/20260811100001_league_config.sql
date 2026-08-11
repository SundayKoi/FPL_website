-- ---------------------------------------------------------------------------
-- Match-reporting Task 1: league config tables (settings, teams, riot
-- accounts, roster memberships). See docs/superpowers/specs/
-- 2026-08-11-match-reporting-auto-ingest-design.md ("Data model" section).
-- ---------------------------------------------------------------------------

-- === league_settings =========================================================
-- league_settings already exists (20260810000001_teams_featured.sql) as the
-- site's singleton "featured draft" row (id smallint/int pk check (id = 1),
-- featured_draft_id, updated_at). The match-reporting design's league_settings
-- interface -- current_season/current_phase, used to default new match report
-- forms -- is the same kind of site-wide singleton config, so this extends
-- that table rather than creating a second table under the identical name
-- (which `create table` would reject outright). RLS policies and grants on
-- this table already satisfy this task's Interfaces exactly (public select;
-- admin-only write via is_admin(); insert/update/delete -> authenticated,
-- RLS-gated; all -> service_role -- see 20260810000001), so they are left
-- untouched here.
alter table public.league_settings
  alter column id type smallint,
  alter column id set default 1,
  add column current_season text not null default 'S5',
  add column current_phase text not null default 'Regular';

insert into public.league_settings (id) values (1) on conflict (id) do nothing;

-- === league_teams ============================================================
-- The canonical team list for match reporting -- deliberately decoupled from
-- the per-draft `teams` table, because stats team identity is
-- `raw_stats.team_name` text. `name` must match `raw_stats.team_name` exactly.
create table public.league_teams (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  abbreviation text unique not null check (char_length(trim(abbreviation)) between 1 and 5),
  active boolean not null default true
);

alter table public.league_teams enable row level security;
create policy league_teams_public_read on public.league_teams for select using (true);
create policy league_teams_admin_write on public.league_teams for all
  using (public.is_admin()) with check (public.is_admin());

grant select on public.league_teams to anon, authenticated;
grant insert, update, delete on public.league_teams to authenticated;
grant all on public.league_teams to service_role;

-- === riot_accounts ============================================================
create table public.riot_accounts (
  id uuid primary key default gen_random_uuid(),
  game_name text not null,
  tag_line text not null,
  display_name text
);
create unique index riot_accounts_key on public.riot_accounts (lower(game_name), lower(tag_line));

alter table public.riot_accounts enable row level security;
create policy riot_accounts_public_read on public.riot_accounts for select using (true);
create policy riot_accounts_admin_write on public.riot_accounts for all
  using (public.is_admin()) with check (public.is_admin());

grant select on public.riot_accounts to anon, authenticated;
grant insert, update, delete on public.riot_accounts to authenticated;
grant all on public.riot_accounts to service_role;

-- === roster_memberships =======================================================
-- Intentionally allowed to be incomplete/partial (not every roster spot need
-- be filled) -- see design spec.
create table public.roster_memberships (
  id uuid primary key default gen_random_uuid(),
  riot_account_id uuid not null references public.riot_accounts(id) on delete cascade,
  season text not null,
  league_team_id uuid not null references public.league_teams(id) on delete cascade,
  unique (riot_account_id, season)
);

alter table public.roster_memberships enable row level security;
create policy roster_memberships_public_read on public.roster_memberships for select using (true);
create policy roster_memberships_admin_write on public.roster_memberships for all
  using (public.is_admin()) with check (public.is_admin());

grant select on public.roster_memberships to anon, authenticated;
grant insert, update, delete on public.roster_memberships to authenticated;
grant all on public.roster_memberships to service_role;

-- === sync_league_teams_from_stats ============================================
-- Seeds public.league_teams from the distinct team_name values present in
-- public.raw_stats, deriving each team's abbreviation from the uppercased
-- initials of its name (e.g. "Mint Ice Cubes" -> "MIC"), truncated to 5
-- characters. Re-runnable: a bare `supabase db reset` truncates raw_stats, so
-- this cannot be a one-shot migration-time INSERT -- it is a function this
-- migration calls once (a no-op against empty raw_stats) AND that
-- scripts/load-stats.ts calls again after loading real data.
--
-- Only names not yet present in league_teams are considered (existing rows
-- are never re-touched), and a colliding abbreviation is de-duplicated by
-- appending the lowest free digit suffix checked against the *live* table,
-- not just the current batch. That -- rather than a single set-based
-- row_number()-over-the-whole-distinct-set query recomputed fresh on every
-- call -- is deliberate: recomputing from scratch every time can hand an
-- already-seeded team's clean abbreviation to a newly-arrived,
-- alphabetically-earlier name and then fail the INSERT outright, because
-- `ON CONFLICT (name) DO NOTHING` only suppresses a conflict on the `name`
-- key, not a separate violation of the `abbreviation` unique constraint.
-- Processing only new names against live state keeps every team's
-- abbreviation stable across repeated calls and avoids that failure mode.
create or replace function public.sync_league_teams_from_stats() returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_base text;
  v_candidate text;
  v_suffix int;
begin
  for r in
    select distinct team_name as name
    from public.raw_stats
    where team_name is not null and team_name <> ''
      and team_name not in (select name from public.league_teams)
    order by team_name
  loop
    v_base := upper(left(regexp_replace(
      coalesce((
        select string_agg(left(w, 1), '' order by ord)
        from unnest(regexp_split_to_array(trim(r.name), '\s+')) with ordinality as t(w, ord)
        where w <> ''
      ), ''),
      '[^A-Za-z0-9]', '', 'g'
    ), 5));

    if v_base is null or v_base = '' then
      v_base := 'TEAM';
    end if;

    v_candidate := v_base;
    v_suffix := 1;
    while exists (select 1 from public.league_teams where abbreviation = v_candidate) loop
      v_suffix := v_suffix + 1;
      v_candidate := left(v_base, greatest(5 - length(v_suffix::text), 1)) || v_suffix::text;
    end loop;

    insert into public.league_teams (name, abbreviation)
    values (r.name, v_candidate)
    on conflict (name) do nothing;
  end loop;
end;
$$;

revoke all on function public.sync_league_teams_from_stats() from public;
grant execute on function public.sync_league_teams_from_stats() to service_role;

-- Migration-time seed: a no-op if raw_stats is empty (fresh reset), and picks
-- up any rows already present otherwise (e.g. this migration ran after data
-- was loaded, or reran against a non-empty environment).
select public.sync_league_teams_from_stats();
