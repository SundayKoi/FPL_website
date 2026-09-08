-- The rescue that could never come home.
--
-- THE BUG. A Rescue run targets a 'lost' hold — the seven-day window in
-- which a lost card can be brought back. resolve_expedition claimed that
-- hold, and raised 'no such lost card' when the hold was no longer open.
-- Three ordinary things close a hold while a rescue is still in the field:
--
--   1. the seven days run out and expire_lost_cards buries the card,
--   2. a stranger's route finds the stranded card and brings it home,
--   3. the owner ransoms it.
--
-- The raise was the disaster, not the message. The rescue run's OWN claim
-- (`claimed_at = now()`) happens earlier in the same function, so the
-- exception rolled that back too. The squad never came home, "Bring them
-- home" raised again on every click, and — because the board allows one
-- run per route at a time — the rescue slot was blocked permanently. One
-- card being already gone cost a player the whole mode.
--
-- THE FIX, in two parts.
--
-- resolve_expedition no longer raises when the hold has closed. The
-- rescue resolves, the squad comes home, and the outcome records
-- `rescueMissed` so the page can say there was nothing left to save.
-- Only a card that actually came home is marked wounded. Any run already
-- stuck in production heals the next time its owner clicks the button.
--
-- expire_lost_cards no longer races a rescue that is still in the field:
-- a hold with an unclaimed rescue whose own clock has not run out is left
-- alone, so a rescue launched in time gets to land. Once that rescue is
-- due the hold is expirable again — and the branch above makes the race
-- harmless rather than fatal.
--
-- resolve_expedition is re-declared in full, exactly as 20260928000001
-- left it apart from the rescue branch.

create or replace function public.resolve_expedition(p_user text, p_run bigint, p_outcome jsonb)
returns table(balance bigint, fragments int, echo_id bigint)
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
  v_echo_slug text := p_outcome -> 'echo' ->> 'slug';
  v_echo_week date := (p_outcome -> 'echo' ->> 'week')::date;
  v_echo_from bigint := (p_outcome -> 'echo' ->> 'moment')::bigint;
  v_echo_id   bigint;
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
  if v_dollars not between 0 and 16275 then raise exception 'payout out of range'; end if;
  if v_bounty not between 0 and 500 then raise exception 'bad bounty'; end if;
  if v_mark is not null and v_mark not in ('trail', 'sigil', 'legend') then raise exception 'unknown mark'; end if;
  if v_frags not between 0 and 3 then raise exception 'bad fragments'; end if;
  if jsonb_typeof(p_outcome -> 'fates') is distinct from 'array' then raise exception 'bad fates'; end if;
  if p_outcome ? 'surge' and jsonb_typeof(p_outcome -> 'surge') <> 'array' then raise exception 'bad surge'; end if;

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

  -- An echo comes off a moment that actually went out on THIS run.
  if p_outcome ? 'echo' then
    if v_echo_from is null or not (v_echo_from = any(v_run.squad)) then raise exception 'echo not in squad'; end if;
    if v_echo_slug is null or v_echo_week is null then raise exception 'bad echo'; end if;
    perform 1 from card_inventory ci
      where ci.id = v_echo_from and ci.discord_id = p_user and ci.card -> 'moment' is not null;
    if not found then raise exception 'echo needs a moment'; end if;
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
      -- THE HOLD CLOSED WHILE THE RESCUE WAS IN THE FIELD. It expired to
      -- the graveyard, its owner ransomed it, or a stranger's route found
      -- it first. This used to raise 'no such lost card' — and because the
      -- run's own claim happens earlier in this same transaction, the
      -- raise rolled that back too: the squad never came home, the button
      -- raised again on every click, and the rescue slot was blocked
      -- forever. One card being already gone must not cost a player the
      -- mode.
      --
      -- So the rescue resolves either way. `missed` records that there was
      -- nothing left to save, and only a card that actually came home is
      -- marked wounded.
      if not found then
        update expedition_runs
          set outcome = coalesce(outcome, '{}'::jsonb) || jsonb_build_object('rescueMissed', true)
          where id = p_run;
      else
        update card_inventory
          set card = jsonb_set(card, '{wounded}', jsonb_build_object('until', now() + interval '72 hours', 'run', p_run))
          where id = (select h.squad[1] from expedition_runs h where h.id = v_run.target);
      end if;
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

  -- The echo: a print off the edition the moment's game was in. A matte,
  -- unsigned copy — the route found it, nobody pulled it — with its own
  -- print number from the trigger. Refused when that edition was never
  -- archived, in which case the claim should not have offered it.
  if p_outcome ? 'echo' then
    insert into card_inventory
      (discord_id, season, slug, player_name, role, edition_week, overall, tier, foil, foil_type, signed, card, pack_open_id)
    select p_user, e.season, e.slug, e.player_name, e.role, e.edition_week, e.overall, e.tier, false, null, false,
           jsonb_set(e.card, '{echo}', jsonb_build_object('run', p_run, 'moment', v_echo_from, 'date', to_char(v_stamp, 'YYYY-MM-DD'))),
           null
      from card_editions e
      where e.season = v_run.season and e.edition_week = v_echo_week and e.slug = v_echo_slug
      returning id into v_echo_id;
    if v_echo_id is null then raise exception 'no such echo'; end if;
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

  return query select v_balance, coalesce(v_have, 0), v_echo_id;
end;
$$;

revoke all on function public.resolve_expedition(text, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.resolve_expedition(text, bigint, jsonb) to service_role;

-- === expire_lost_cards: do not bury a card a rescue is on its way to ====
create or replace function public.expire_lost_cards()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hold expedition_runs%rowtype;
  v_n    int := 0;
begin
  for v_hold in
    select * from expedition_runs r
    where r.tier = 'lost' and r.claimed_at is null and r.resolves_at <= now()
      -- A rescue that launched in time deserves to land. While one is
      -- unclaimed and its own clock has not run out, the hold stays open;
      -- the player still has to claim it, and once that rescue is due this
      -- clause stops applying. resolve_expedition treats a hold that
      -- closed underneath it as a miss rather than an error, so the race
      -- at that boundary costs a card, never a run.
      and not exists (
        select 1 from expedition_runs res
        where res.target = r.id
          and res.tier = 'rescue'
          and res.claimed_at is null
          and res.resolves_at > now()
      )
    order by r.id
    for update skip locked
  loop
    update expedition_runs set claimed_at = now(), outcome = jsonb_build_object('expired', true)
      where id = v_hold.id;
    insert into expedition_graveyard
      (discord_id, inventory_id, season, slug, player_name, tier, foil, foil_type, signed, card, run_id, cause)
    select ci.discord_id, ci.id, ci.season, ci.slug, ci.player_name, ci.tier, ci.foil, ci.foil_type, ci.signed,
           ci.card, v_hold.target, 'unrescued'
      from card_inventory ci where ci.id = v_hold.squad[1];
    perform set_config('fpl.card_fate', 'died', true);
    delete from card_inventory where id = v_hold.squad[1];
    perform set_config('fpl.card_fate', '', true);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

revoke all on function public.expire_lost_cards() from public, anon, authenticated;
grant execute on function public.expire_lost_cards() to service_role;

-- The lookup the expiry guard makes, on the column it filters.
create index if not exists expedition_runs_target_idx
  on public.expedition_runs (target) where target is not null;
