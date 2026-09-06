-- Finishes, part two: wear, slabbing, and the StatTrak counter.
--
-- Part one (no migration) froze three stamps into the card json at mint:
-- card.shiny, card.secret and card.stattrak {points, since}. This one
-- gives a copy a history it can wear and a way to seal it:
--
--   1. card.wear — how many times the copy has been fielded. Bumped by
--      wear_cards(), which the Gauntlet and the weekly drop call, and by a
--      trigger on expedition_runs so a launch counts in the same
--      transaction that records it. Never bumped on a slabbed copy.
--   2. card.slab {wear, at} — the owner's one-way choice. slab_card()
--      writes it; a trigger makes it permanent (it cannot be removed or
--      rewritten, and the wear under it is frozen); launch_expedition's
--      table refuses a slabbed squad member before the run exists. The
--      Gauntlet and Fantasy entry checks read the same field server-side.
--   3. StatTrak — bump_stattrak() adds a week's fantasy points to a copy
--      that carries the counter, and a trigger zeroes it (and restarts
--      `since`) whenever the copy changes hands, so a count is always ONE
--      owner's.
--
-- Every function here is service-role only, like the rest of the card
-- economy: the site's actions prove the caller before they call.

-- === 1. wear ===============================================================

create or replace function public.wear_cards(p_ids bigint[])
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  update card_inventory
  set card = jsonb_set(card, '{wear}', to_jsonb(coalesce((card ->> 'wear')::int, 0) + 1), true)
  where id = any(p_ids)
    and not (card ? 'slab');
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.wear_cards(bigint[]) from public, anon, authenticated;
grant execute on function public.wear_cards(bigint[]) to service_role;

-- A launch is a fielding. Before: nothing sealed goes out. After: the
-- squad wears it. On the table rather than inside launch_expedition, so
-- the thirteen-argument function and its wrappers stay exactly as they
-- were and every path that inserts a run pays the same rule.
create or replace function public.expedition_runs_slab_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from card_inventory ci where ci.id = any(new.squad) and ci.card ? 'slab') then
    raise exception 'card is slabbed';
  end if;
  return new;
end;
$$;

drop trigger if exists expedition_runs_slab_guard on public.expedition_runs;
create trigger expedition_runs_slab_guard
  before insert on public.expedition_runs
  for each row execute function public.expedition_runs_slab_guard();

create or replace function public.expedition_runs_wear()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.wear_cards(new.squad);
  return null;
end;
$$;

drop trigger if exists expedition_runs_wear on public.expedition_runs;
create trigger expedition_runs_wear
  after insert on public.expedition_runs
  for each row execute function public.expedition_runs_wear();

-- === 2. slabbing ===========================================================

create or replace function public.slab_card(p_user text, p_inventory bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row card_inventory%rowtype;
  v_slab jsonb;
begin
  select * into v_row from card_inventory where id = p_inventory for update;
  if not found or v_row.discord_id <> p_user then raise exception 'card not owned'; end if;
  if v_row.card ? 'slab' then raise exception 'card already slabbed'; end if;
  -- Away on a route (or lost on one): the run holds it until it is claimed.
  if exists (select 1 from expedition_runs r where r.claimed_at is null and r.squad @> array[p_inventory]) then
    raise exception 'card already deployed';
  end if;
  v_slab := jsonb_build_object(
    'wear', coalesce((v_row.card ->> 'wear')::int, 0),
    'at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
  update card_inventory set card = jsonb_set(card, '{slab}', v_slab, true) where id = p_inventory;
  return v_slab;
end;
$$;

revoke all on function public.slab_card(text, bigint) from public, anon, authenticated;
grant execute on function public.slab_card(text, bigint) to service_role;

-- The seal. Once a copy carries a slab, nothing may take it off, change
-- it, or move the wear under it — not a later stamp, not a transfer, not
-- a service-role update that forgot. The one-way door is the whole point.
create or replace function public.slab_seal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.card ? 'slab' then
    if new.card -> 'slab' is distinct from old.card -> 'slab' then
      raise exception 'card is slabbed';
    end if;
    if new.card -> 'wear' is distinct from old.card -> 'wear' then
      raise exception 'card is slabbed';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists card_inventory_slab_seal on public.card_inventory;
create trigger card_inventory_slab_seal
  before update of card on public.card_inventory
  for each row execute function public.slab_seal();

-- === 3. StatTrak ===========================================================

create or replace function public.bump_stattrak(p_id bigint, p_points numeric)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  if p_points is null or p_points <= 0 then return false; end if;
  update card_inventory
  set card = jsonb_set(
    card, '{stattrak,points}',
    to_jsonb(round(coalesce((card -> 'stattrak' ->> 'points')::numeric, 0) + p_points, 1)), false)
  where id = p_id
    and card ? 'stattrak';
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;

revoke all on function public.bump_stattrak(bigint, numeric) from public, anon, authenticated;
grant execute on function public.bump_stattrak(bigint, numeric) to service_role;

-- A count is one owner's. Zeroed on the way through a transfer — before
-- record_card_provenance sees the row, and whatever moved it.
create or replace function public.stattrak_reset()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.discord_id is distinct from old.discord_id and new.card ? 'stattrak' then
    new.card := jsonb_set(
      new.card, '{stattrak}',
      jsonb_build_object('points', 0, 'since', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
      true);
  end if;
  return new;
end;
$$;

drop trigger if exists card_inventory_stattrak_reset on public.card_inventory;
create trigger card_inventory_stattrak_reset
  before update of discord_id on public.card_inventory
  for each row execute function public.stattrak_reset();
