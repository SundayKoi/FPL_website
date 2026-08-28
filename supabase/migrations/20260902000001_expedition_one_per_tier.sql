-- One run of each tier out at a time.
--
-- The daily limit already capped LAUNCHES (one an Eastern day, two for a
-- patron), but nothing stopped those launches being the same tier on
-- consecutive days. A collector with two legend-capable squads could keep
-- a second Legend Hunt permanently in the field, so the tier that is meant
-- to be a two-day commitment paid out every day, and the wait — the whole
-- point of the tier — cost them nothing.
--
-- So a tier is now a slot: while your Legend Hunt is out you cannot send
-- another, and the same for the raid and the scouting run. One of each may
-- be in the field at once, which keeps the board something you manage
-- rather than a queue you stack.
--
-- The check sits under the same wallet lock as the daily limit — two
-- launches racing must not both find the slot empty — and BEFORE it, so
-- someone whose Legend Hunt is still away hears that rather than a generic
-- "daily limit" that would send them to bed instead of to the raid.
--
-- Everything else in this function is unchanged from
-- 20260901000001_card_expeditions.sql; create or replace needs the whole
-- body, so the rest is carried over verbatim.

create or replace function public.launch_expedition(
  p_user text, p_season text, p_tier text, p_squad bigint[], p_shine int, p_hours int
) returns table(run_id bigint, resolves_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today   date := (now() at time zone 'America/New_York')::date;
  v_patron  boolean;
  v_limit   int;
  v_used    int;
  v_owned   int;
  v_run_id  bigint;
  v_resolves timestamptz;
begin
  if p_tier not in ('scout', 'raid', 'legend') then raise exception 'unknown tier'; end if;
  if p_hours not between 1 and 96 then raise exception 'bad duration'; end if;
  -- The last unguarded argument. Shine only scales the payout (config.ts
  -- caps the bonus at +50%), but it is recorded on the row and read back
  -- by the board, so it gets the same "service code passes config truth,
  -- Postgres checks the range anyway" treatment as p_dollars. 60 is well
  -- clear of the ceiling three maxed copies can reach (16 x 3 = 48).
  if p_shine not between 0 and 60 then raise exception 'bad shine'; end if;
  if array_length(p_squad, 1) is distinct from 3
     or (select count(distinct s) from unnest(p_squad) s) <> 3 then
    raise exception 'squad must be three distinct cards';
  end if;

  -- Wallet lock serializes the daily-limit check (open_daily_pack pattern).
  select patron_until > now() into v_patron
    from betting_profiles where betting_profiles.discord_id = p_user for update;
  if not found then raise exception 'unknown user %', p_user; end if;

  -- The tier slot. Under the lock, so two launches racing cannot both find
  -- it empty, and ahead of the daily limit so the more useful message wins.
  if exists (
    select 1 from expedition_runs r
    where r.discord_id = p_user and r.tier = p_tier and r.claimed_at is null
  ) then
    raise exception 'tier already out';
  end if;

  v_limit := case when coalesce(v_patron, false) then 2 else 1 end;
  select count(*) into v_used from expedition_runs r
    where r.discord_id = p_user
      and (r.started_at at time zone 'America/New_York')::date = v_today;
  if v_used >= v_limit then raise exception 'daily expedition limit'; end if;

  select count(*) into v_owned from card_inventory ci
    where ci.id = any(p_squad) and ci.discord_id = p_user;
  if v_owned <> 3 then raise exception 'card not owned'; end if;

  if exists (
    select 1 from expedition_runs r
    where r.claimed_at is null and r.squad && p_squad
  ) then
    raise exception 'card already deployed';
  end if;

  v_resolves := now() + make_interval(hours => p_hours);
  insert into expedition_runs (discord_id, season, tier, squad, shine, resolves_at)
  values (p_user, p_season, p_tier, p_squad, p_shine, v_resolves)
  returning id into v_run_id;

  return query select v_run_id, v_resolves;
end;
$$;

revoke all on function public.launch_expedition(text, text, text, bigint[], int, int) from public, anon, authenticated;
grant execute on function public.launch_expedition(text, text, text, bigint[], int, int) to service_role;

-- The slot check runs on every launch, so give it the index it wants.
-- Partial on the unclaimed rows: finished runs accumulate forever and none
-- of them can occupy a slot.
create index if not exists expedition_runs_active_tier_idx
  on public.expedition_runs (discord_id, tier) where claimed_at is null;
