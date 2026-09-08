-- Seed and link the Academy draft into the canonical player pool used by
-- roster identity claims. The original canonical pool migration only seeded
-- Premier's season-5 rows, so Academy pages otherwise have no safe identity
-- target even though the claim RPCs already support league = 'academy'.

create or replace function public._sync_academy_player_pool() returns int
language plpgsql security definer set search_path = public as $$
declare
  v_draft uuid;
  v_linked int := 0;
begin
  select academy_draft_id
  into v_draft
  from public.league_settings
  where id = 1;

  if v_draft is null then
    raise notice 'No Academy draft configured; skipping the Academy player pool.';
    return 0;
  end if;

  -- Keep the normalization in one place for the insert and the FK link. It
  -- mirrors the public player-directory matcher: trim Captain:, discard the
  -- Riot tag, collapse whitespace, then compare case-insensitively.
  drop table if exists pg_temp._academy_player_pool;
  create temporary table pg_temp._academy_player_pool (
    player_id uuid primary key,
    normalized_name text not null,
    display_name text not null,
    role public.lol_role not null,
    rank text,
    opgg_url text
  );

  insert into pg_temp._academy_player_pool (
    player_id, normalized_name, display_name, role, rank, opgg_url
  )
  select
    p.id,
    lower(regexp_replace(
      trim(split_part(
        regexp_replace(trim(p.display_name), '^captain:[[:space:]]*', '', 'i'),
        '#',
        1
      )),
      '[[:space:]]+',
      ' ',
      'g'
    )),
    p.display_name,
    p.role,
    p.rank,
    nullif(trim(p.opgg_url), '')
  from public.players p
  where p.draft_id = v_draft
    and nullif(trim(p.display_name), '') is not null;

  -- A duplicate base name cannot be safely tied to one real person. Leave
  -- all such rows unlinked so a captain cannot claim the wrong identity.
  delete from pg_temp._academy_player_pool candidate
  where candidate.normalized_name in (
    select normalized_name
    from pg_temp._academy_player_pool
    group by normalized_name
    having count(*) > 1
  );

  insert into public.player_pool (
    season_key, normalized_name, display_name, role, rank, opgg_url
  )
  select
    'academy-1', normalized_name, display_name, role, rank, opgg_url
  from pg_temp._academy_player_pool
  on conflict (season_key, normalized_name) do nothing;

  -- Existing canonical rows may have been curated by an admin. Only fill a
  -- missing FK; do not replace an explicit identity decision or metadata.
  update public.players p
  set canonical_player_id = pool.id
  from pg_temp._academy_player_pool candidate
  join public.player_pool pool
    on pool.season_key = 'academy-1'
   and pool.normalized_name = candidate.normalized_name
  where p.id = candidate.player_id
    and p.canonical_player_id is null;
  get diagnostics v_linked = row_count;

  return v_linked;
end;
$$;

revoke all on function public._sync_academy_player_pool() from public;
grant execute on function public._sync_academy_player_pool() to service_role;

-- Allow an admin to re-run this after a new Academy draft/player pool is
-- configured, without exposing the maintenance helper to normal users.
create or replace function public.sync_academy_player_pool() returns int
language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  return public._sync_academy_player_pool();
end;
$$;

revoke all on function public.sync_academy_player_pool() from public;
grant execute on function public.sync_academy_player_pool() to authenticated, service_role;

-- Backfill existing Academy rows during deployment. The function is a no-op
-- on installs where the Academy draft has not been configured yet.
select public._sync_academy_player_pool();
