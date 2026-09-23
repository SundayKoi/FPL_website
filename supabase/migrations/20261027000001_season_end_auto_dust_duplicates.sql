-- A separate, league-scoped rule for public Season's End copies. An exact
-- duplicate has the same release, design, foil finish, and signed state.
create table public.season_end_auto_dust (
  discord_id text not null references public.betting_profiles(discord_id) on delete cascade,
  league text not null check (league in ('premier', 'academy')),
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (discord_id, league)
);

alter table public.season_end_auto_dust enable row level security;
revoke all on public.season_end_auto_dust from public, anon, authenticated;
grant all on public.season_end_auto_dust to service_role;

-- Lock the owner's active shelf before ranking it. The oldest active copy
-- survives in every exact-variant group; an opening-scoped run only dusts
-- copies minted by that opening. Manual commerce is serialized by row locks,
-- and the existing dust RPC remains the authority for quotes and settlement.
create function public.run_season_end_auto_dust(
  p_user text,
  p_league text,
  p_opening uuid default null,
  p_limit integer default 200
)
returns table(dusted integer, value bigint, balance bigint, remaining integer, ids bigint[])
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enabled boolean;
  v_candidates bigint[];
  v_id bigint;
  v_quote record;
begin
  if p_league not in ('premier', 'academy') or p_limit < 1 or p_limit > 200 then
    raise exception 'invalid Season''s End auto-dust request';
  end if;
  if p_opening is not null and not exists (
    select 1 from public.season_end_openings o
    join public.season_end_releases r on r.id = o.release_id
    where o.opening_id = p_opening and o.discord_id = p_user
      and o.mode = 'public' and o.status = 'fulfilled' and r.league = p_league
  ) then
    raise exception 'Season''s End opening is not available';
  end if;

  select r.enabled into v_enabled from public.season_end_auto_dust r
  where r.discord_id = p_user and r.league = p_league;
  if v_enabled is distinct from true then
    return query select 0, 0::bigint, null::bigint, 0, '{}'::bigint[];
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('season-end-auto-dust:' || p_user || ':' || p_league, 0));
  with locked as materialized (
    select i.id, i.release_id, i.design_id, i.foil_type, i.signed, i.opening_id
    from public.season_end_inventory i
    join public.season_end_releases r on r.id = i.release_id
    where i.discord_id = p_user and i.mode = 'public'
      and i.lifecycle_status = 'active' and r.league = p_league
    order by i.id for update of i
  ), ranked as (
    select locked.id, locked.opening_id,
      row_number() over (
        partition by locked.release_id, locked.design_id, locked.foil_type, locked.signed
        order by locked.id
      ) as copy_number
    from locked
  )
  select coalesce(array_agg(candidate.id order by candidate.id), '{}'::bigint[])
    into v_candidates
  from (
    select ranked.id from ranked
    where ranked.copy_number > 1 and (p_opening is null or ranked.opening_id = p_opening)
    order by ranked.id limit p_limit
  ) candidate;

  dusted := 0;
  value := 0;
  balance := null;
  ids := '{}'::bigint[];
  foreach v_id in array v_candidates loop
    select quote.value, quote.balance into v_quote
    from public.dust_season_end_copy(p_user, v_id) quote;
    dusted := dusted + 1;
    value := value + v_quote.value;
    balance := v_quote.balance;
    ids := array_append(ids, v_id);
  end loop;

  select count(*)::integer into remaining
  from (
    select i.opening_id,
      row_number() over (
        partition by i.release_id, i.design_id, i.foil_type, i.signed order by i.id
      ) as copy_number
    from public.season_end_inventory i
    join public.season_end_releases r on r.id = i.release_id
    where i.discord_id = p_user and i.mode = 'public'
      and i.lifecycle_status = 'active' and r.league = p_league
  ) ranked
  where ranked.copy_number > 1 and (p_opening is null or ranked.opening_id = p_opening);
  return next;
end;
$$;

revoke all on function public.run_season_end_auto_dust(text,text,uuid,integer) from public, anon, authenticated;
grant execute on function public.run_season_end_auto_dust(text,text,uuid,integer) to service_role;
