-- Expedition encounters: the beats between forks that change a run.
--
-- The trail journal (src/lib/expeditions/journal.ts) is derived from the
-- run's id and never stored. Two of its encounters touch the database:
--   - a STORM delays the run two hours. The sweep applies it when its hour
--     arrives, through delay_expedition, and records it in `encounters` so
--     a storm delays a run once.
--   - a STRANDED card — another collector's lost card — is carried home.
--     resolve_expedition releases that collector's hold (their card comes
--     home wounded, as a ransom brings it) and pays the rescuer a bounty.
-- The MERCHANT's dollars ride in p_outcome.dollars like every other bonus;
-- the ceiling grows by exactly that flat.

alter table public.expedition_runs
  add column if not exists encounters jsonb not null default '[]'::jsonb;

-- === delay_expedition ========================================================
-- Pushes a run's end (and so every fork after now) out by p_hours, once
-- per storm: a second call naming the same leg is a no-op, so the sweep is
-- safe to repeat.

create or replace function public.delay_expedition(p_run bigint, p_leg int, p_hours int)
returns table(resolves_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run expedition_runs%rowtype;
begin
  if p_hours not between 1 and 12 then raise exception 'bad delay'; end if;
  select * into v_run from expedition_runs r where r.id = p_run for update;
  if not found then raise exception 'unknown run'; end if;
  if v_run.claimed_at is not null or v_run.tier = 'lost' then raise exception 'unknown run'; end if;
  if exists (
    select 1 from jsonb_array_elements(v_run.encounters) e
    where e ->> 'key' = 'storm' and (e ->> 'leg')::int = p_leg
  ) then
    return query select v_run.resolves_at;
    return;
  end if;
  update expedition_runs
    set resolves_at = expedition_runs.resolves_at + make_interval(hours => p_hours),
        encounters = encounters || jsonb_build_array(jsonb_build_object('key', 'storm', 'leg', p_leg, 'hours', p_hours, 'at', now()))
    where id = p_run
    returning expedition_runs.resolves_at into v_run.resolves_at;
  return query select v_run.resolves_at;
end;
$$;

revoke all on function public.delay_expedition(bigint, int, int) from public, anon, authenticated;
grant execute on function public.delay_expedition(bigint, int, int) to service_role;

-- === resolve_expedition (v2) ================================================
-- Re-declared in full, the dust_card ruling. Two changes: the dollar ceiling
-- includes the merchant's flat (maxExpeditionPayout() in config.ts, held
-- to this literal by config.test.ts), and `stranded` — another collector's
-- hold id — is released with a bounty to the rescuer.

create or replace function public.resolve_expedition(p_user text, p_run bigint, p_outcome jsonb)
returns table(balance bigint, fragments int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run       expedition_runs%rowtype;
  v_hold      expedition_runs%rowtype;
  v_grade     text := p_outcome ->> 'grade';
  v_dollars   bigint := coalesce((p_outcome ->> 'dollars')::bigint, 0);
  v_comp      boolean := coalesce((p_outcome ->> 'comp')::boolean, false);
  v_mark      text := p_outcome ->> 'mark';
  v_bearer    bigint := (p_outcome ->> 'bearer')::bigint;
  v_frags     int := coalesce((p_outcome ->> 'fragments')::int, 0);
  v_rescued   boolean := (p_outcome ->> 'rescued')::boolean;
  v_cleansed  bigint := (p_outcome ->> 'cleansed')::bigint;
  v_stranded  bigint := (p_outcome ->> 'stranded')::bigint;
  v_bounty    bigint := coalesce((p_outcome ->> 'bounty')::bigint, 0);
  v_fate      jsonb;
  v_id        bigint;
  v_kind      text;
  v_mut       text;
  v_until     timestamptz;
  v_current   text;
  v_rank      int;
  v_new_rank  int;
  v_balance   bigint;
  v_have      int := 0;
  v_seen      bigint[] := '{}';
  v_stamp     date := (now() at time zone 'utc')::date;
begin
  if v_grade not in ('poor', 'solid', 'jackpot') then raise exception 'unknown grade'; end if;
  if v_dollars not between 0 and 11325 then raise exception 'payout out of range'; end if;
  if v_bounty not between 0 and 500 then raise exception 'bad bounty'; end if;
  if v_mark is not null and v_mark not in ('trail', 'sigil', 'legend') then raise exception 'unknown mark'; end if;
  if v_frags not between 0 and 3 then raise exception 'bad fragments'; end if;
  if jsonb_typeof(p_outcome -> 'fates') is distinct from 'array' then raise exception 'bad fates'; end if;

  select * into v_run from expedition_runs r
    where r.id = p_run and r.discord_id = p_user for update;
  if not found then raise exception 'unknown run'; end if;
  if v_run.tier = 'lost' then raise exception 'unknown run'; end if;
  if v_run.claimed_at is not null then raise exception 'already claimed'; end if;
  if v_run.resolves_at > now() then raise exception 'expedition still out'; end if;

  for v_fate in select * from jsonb_array_elements(p_outcome -> 'fates') loop
    v_id := (v_fate ->> 'id')::bigint;
    v_kind := v_fate ->> 'fate';
    v_mut := v_fate ->> 'mutation';
    if v_id is null or not (v_id = any(v_run.squad)) then raise exception 'fate not in squad'; end if;
    if v_id = any(v_seen) then raise exception 'fate repeated'; end if;
    v_seen := v_seen || v_id;
    if v_kind not in ('home', 'wounded', 'lost', 'dead') then raise exception 'unknown fate'; end if;
    if v_mut is not null and v_mut not in ('irradiated', 'hardened', 'haunted', 'cursed', 'voidtouched') then
      raise exception 'unknown mutation';
    end if;
    if v_kind = 'dead' and v_run.tier <> 'legendary' then raise exception 'fate beyond route'; end if;
    if v_kind = 'lost' and v_run.tier not in ('legend', 'rescue', 'legendary') then raise exception 'fate beyond route'; end if;
    if v_kind = 'wounded' and v_run.tier in ('scout', 'exorcism') then raise exception 'fate beyond route'; end if;
    if v_mut is not null and v_run.tier in ('scout', 'exorcism', 'rescue') then raise exception 'mutation beyond route'; end if;
    if v_mut = 'voidtouched' and v_run.tier <> 'legendary' then raise exception 'mutation beyond route'; end if;
  end loop;

  if v_mark is not null then
    if v_bearer is null or not (v_bearer = any(v_run.squad)) then raise exception 'bearer not in squad'; end if;
  end if;

  -- The stranded card must be a real, open hold that is not the caller's:
  -- their own lost cards come home by Rescue or ransom, never by luck.
  if v_stranded is not null then
    select * into v_hold from expedition_runs h where h.id = v_stranded for update;
    if not found or v_hold.tier <> 'lost' or v_hold.claimed_at is not null or v_hold.discord_id = p_user then
      raise exception 'no such stranded card';
    end if;
  end if;

  update expedition_runs
    set outcome = p_outcome, claimed_at = now()
    where id = p_run;

  if v_mark is not null then
    select ci.card -> 'expedition' ->> 'mark' into v_current
      from card_inventory ci where ci.id = v_bearer;
    v_rank := case v_current when 'trail' then 1 when 'sigil' then 2 when 'legend' then 3 else 0 end;
    v_new_rank := case v_mark when 'trail' then 1 when 'sigil' then 2 when 'legend' then 3 end;
    if v_new_rank > v_rank then
      update card_inventory
        set card = jsonb_set(card, '{expedition}', jsonb_build_object(
          'mark', v_mark, 'tier', v_run.tier, 'date', to_char(v_stamp, 'YYYY-MM-DD')))
        where id = v_bearer;
    end if;
  end if;

  for v_fate in select * from jsonb_array_elements(p_outcome -> 'fates') loop
    v_id := (v_fate ->> 'id')::bigint;
    v_kind := v_fate ->> 'fate';
    v_mut := v_fate ->> 'mutation';
    if v_mut is not null and v_kind <> 'dead' then
      update card_inventory
        set card = jsonb_set(card, '{mutation}', jsonb_build_object('key', v_mut, 'date', to_char(v_stamp, 'YYYY-MM-DD'), 'run', p_run))
        where id = v_id and card -> 'mutation' is null;
    end if;
    if v_kind = 'wounded' then
      v_until := coalesce((v_fate ->> 'until')::timestamptz, now() + interval '72 hours');
      if v_until > now() + interval '8 days' then raise exception 'bad bench'; end if;
      update card_inventory
        set card = jsonb_set(card, '{wounded}', jsonb_build_object('until', v_until, 'run', p_run))
        where id = v_id;
    elsif v_kind = 'lost' then
      insert into expedition_runs (discord_id, season, tier, squad, shine, resolves_at, forks, target)
      values (p_user, v_run.season, 'lost', array[v_id], 0, now() + interval '7 days', 0, p_run);
    elsif v_kind = 'dead' then
      insert into expedition_graveyard
        (discord_id, inventory_id, season, slug, player_name, tier, foil, foil_type, signed, card, run_id, cause)
      select ci.discord_id, ci.id, ci.season, ci.slug, ci.player_name, ci.tier, ci.foil, ci.foil_type, ci.signed,
             ci.card, p_run, 'route'
        from card_inventory ci where ci.id = v_id and ci.discord_id = p_user;
      perform set_config('fpl.card_fate', 'died', true);
      delete from card_inventory where id = v_id and discord_id = p_user;
      perform set_config('fpl.card_fate', '', true);
    end if;
  end loop;

  if v_run.tier = 'rescue' then
    if v_rescued is null then raise exception 'rescue needs a verdict'; end if;
    if v_rescued then
      update expedition_runs
        set claimed_at = now(), outcome = jsonb_build_object('rescued', true, 'by', p_run)
        where id = v_run.target and discord_id = p_user and tier = 'lost' and claimed_at is null;
      if not found then raise exception 'no such lost card'; end if;
      update card_inventory
        set card = jsonb_set(card, '{wounded}', jsonb_build_object('until', now() + interval '72 hours', 'run', p_run))
        where id = (select h.squad[1] from expedition_runs h where h.id = v_run.target);
    end if;
  end if;

  if v_run.tier = 'exorcism' then
    if v_cleansed is null or v_cleansed <> v_run.target then raise exception 'cleansed not the target'; end if;
    update card_inventory set card = card - 'mutation' where id = v_cleansed and discord_id = p_user;
  end if;

  -- The stranger's card goes home wounded; the rescuer is paid by the house.
  if v_stranded is not null then
    update expedition_runs
      set claimed_at = now(), outcome = jsonb_build_object('rescued', true, 'by', p_run, 'stranger', p_user)
      where id = v_stranded;
    update card_inventory
      set card = jsonb_set(card, '{wounded}', jsonb_build_object('until', now() + interval '72 hours', 'run', p_run))
      where id = v_hold.squad[1];
    if v_bounty > 0 then
      insert into betting_ledger (discord_id, delta, reason, ref_table, ref_id)
      values (p_user, v_bounty, 'expedition_bounty', 'expedition_runs', v_stranded);
    end if;
  end if;

  perform 1 from betting_profiles where betting_profiles.discord_id = p_user for update;
  if v_dollars > 0 then
    insert into betting_ledger (discord_id, delta, reason, ref_table, ref_id)
    values (p_user, v_dollars, 'expedition', 'expedition_runs', p_run);
  end if;
  if v_dollars + v_bounty > 0 then
    update betting_profiles set balance = betting_profiles.balance + v_dollars + (case when v_stranded is not null then v_bounty else 0 end)
      where betting_profiles.discord_id = p_user;
  end if;
  select betting_profiles.balance into v_balance from betting_profiles where betting_profiles.discord_id = p_user;

  if v_comp then
    insert into card_pack_comps (discord_id, kind, remaining, granted, reason)
    values (p_user, 'standard', 1, 1, 'expedition run ' || p_run)
    on conflict on constraint card_pack_comps_pkey
    do update set remaining = card_pack_comps.remaining + 1,
                  granted   = card_pack_comps.granted + 1;
  end if;

  if v_frags > 0 then
    insert into expedition_supplies (discord_id, fragments) values (p_user, v_frags)
    on conflict on constraint expedition_supplies_pkey
    do update set fragments = expedition_supplies.fragments + v_frags, updated_at = now();
  end if;
  select s.fragments into v_have from expedition_supplies s where s.discord_id = p_user;

  return query select v_balance, coalesce(v_have, 0);
end;
$$;

revoke all on function public.resolve_expedition(text, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.resolve_expedition(text, bigint, jsonb) to service_role;
