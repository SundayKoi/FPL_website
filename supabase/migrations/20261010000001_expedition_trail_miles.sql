-- Trail miles: a card remembers the roads it has walked.
--
-- Every card that comes home from an expedition alive — home or wounded —
-- is stamped with the run's miles in its json:
--
--   card.trail = { miles, runs, deepest }
--
-- The stamp is a trigger on the claim, not a field the app sends, for the
-- same reason a mutation is written by resolve_expedition and not by the
-- caller: a number that unlocks something (src/lib/expeditions/trail.ts —
-- titles at 8, 16 and 30 miles that sharpen a card's role call and add
-- shine) must not be a number a caller can inflate or skip. The trigger
-- reads the claimed outcome's fates and stamps the survivors; a dead card
-- takes its miles to the graveyard row, which already copies the json.
--
-- Miles per route, mirrored in MILES_BY_TIER (trail.ts) and held equal by
-- trail.test.ts: scout 1, rescue 1, gilded 2, raid 2, legend 3, legendary
-- 4. An Exorcism is a rite, not a road, and pays none — its survivors are
-- not stamped at all, so a card that has only ever been cleansed has no
-- trail. `lost` rows are holds, not runs, and are never stamped; the
-- expiry and the rescue paths close them with claimed_at too.
--
-- Every later update in the same claim (the mark, a mutation, the bench)
-- goes through jsonb_set on its own key, so the trail survives them.

create or replace function public.expedition_trail_miles(p_tier text) returns int
language sql
immutable
as $$
  select case p_tier
    when 'scout' then 1
    when 'rescue' then 1
    when 'gilded' then 2
    when 'raid' then 2
    when 'legend' then 3
    when 'legendary' then 4
    else 0
  end
$$;

create or replace function public.expedition_stamp_trail() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_miles int := public.expedition_trail_miles(new.tier);
  v_fate  jsonb;
  v_id    bigint;
  v_kind  text;
begin
  if v_miles <= 0 then return new; end if;
  if jsonb_typeof(new.outcome -> 'fates') is distinct from 'array' then return new; end if;

  for v_fate in select * from jsonb_array_elements(new.outcome -> 'fates') loop
    v_id := (v_fate ->> 'id')::bigint;
    v_kind := v_fate ->> 'fate';
    if v_id is null or v_kind not in ('home', 'wounded') then continue; end if;
    if not (v_id = any(new.squad)) then continue; end if;
    update card_inventory ci
      set card = jsonb_set(
        ci.card,
        '{trail}',
        jsonb_build_object(
          'miles', coalesce((ci.card -> 'trail' ->> 'miles')::int, 0) + v_miles,
          'runs', coalesce((ci.card -> 'trail' ->> 'runs')::int, 0) + 1,
          -- The deepest road: whichever of the old and this pays more.
          'deepest', case
            when public.expedition_trail_miles(ci.card -> 'trail' ->> 'deepest') >= v_miles
              then ci.card -> 'trail' ->> 'deepest'
            else new.tier
          end
        ),
        true)
      where ci.id = v_id and ci.discord_id = new.discord_id;
  end loop;
  return new;
end;
$$;

drop trigger if exists expedition_runs_trail_stamp on public.expedition_runs;
create trigger expedition_runs_trail_stamp
  after update of claimed_at on public.expedition_runs
  for each row
  when (old.claimed_at is null and new.claimed_at is not null and new.tier <> 'lost')
  execute function public.expedition_stamp_trail();

revoke all on function public.expedition_stamp_trail() from public, anon, authenticated;
revoke all on function public.expedition_trail_miles(text) from public, anon, authenticated;
grant execute on function public.expedition_trail_miles(text) to service_role, anon, authenticated;
