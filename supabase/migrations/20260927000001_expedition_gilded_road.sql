-- The Gilded Road: a seventh expedition, patrons only.
--
-- A route, not a rate. Patronage never changes anyone's odds; what it buys
-- here is a run of its own — twelve hours, two forks, a squad any shelf can
-- field — whose grades, comp and mark all sit under the Deep Raid's
-- (src/lib/expeditions/config.ts, REWARDS.gilded). The app's numbers stay
-- in the app; this migration only teaches the database the tier exists and
-- who may launch it.
--
-- launch_expedition is redefined exactly as 20260926000001 left it, plus
-- 'gilded' in the tier list and one check: a non-patron launching it gets
-- 'patron road'. The convoy launch (20260917000001) delegates here and
-- picks both up. resolve_expedition needs no change: its fate checks
-- already allow a wound and a mutation on any tier that is not scout,
-- exorcism or rescue, and the Gilded Road can neither lose nor kill.

alter table public.expedition_runs drop constraint if exists expedition_runs_tier_check;
alter table public.expedition_runs
  add constraint expedition_runs_tier_check
  check (tier in ('scout', 'gilded', 'raid', 'legend', 'rescue', 'exorcism', 'legendary', 'lost'));

create or replace function public.launch_expedition(
  p_user text, p_season text, p_tier text, p_squad bigint[], p_shine int, p_hours int,
  p_forks int, p_insured boolean, p_fee bigint, p_fragments int, p_target bigint, p_policy_week date
) returns table(run_id bigint, resolves_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_patron  boolean;
  v_balance bigint;
  v_owned   int;
  v_run_id  bigint;
  v_resolves timestamptz;
  v_have    int;
begin
  if p_tier not in ('scout', 'gilded', 'raid', 'legend', 'rescue', 'exorcism', 'legendary') then
    raise exception 'unknown tier';
  end if;
  if p_hours not between 1 and 96 then raise exception 'bad duration'; end if;
  if p_shine not between 0 and 60 then raise exception 'bad shine'; end if;
  if p_forks not between 0 and 6 then raise exception 'bad forks'; end if;
  if p_fee < 0 or p_fee > 5000 then raise exception 'bad fee'; end if;
  if p_fragments < 0 or p_fragments > 3 then raise exception 'bad fragments'; end if;
  if array_length(p_squad, 1) is distinct from 3
     or (select count(distinct s) from unnest(p_squad) s) <> 3 then
    raise exception 'squad must be three distinct cards';
  end if;

  -- Wallet lock serializes the fee (open_daily_pack pattern).
  select patron_until > now(), balance into v_patron, v_balance
    from betting_profiles where betting_profiles.discord_id = p_user for update;
  if not found then raise exception 'unknown user %', p_user; end if;

  -- The patrons' road. The flame is the whole gate: no fee, no fragment,
  -- nothing a wallet can buy its way past.
  if p_tier = 'gilded' and not coalesce(v_patron, false) then
    raise exception 'patron road';
  end if;

  -- The tier slot. Holds ('lost') are not runs and never occupy one.
  if exists (
    select 1 from expedition_runs r
    where r.discord_id = p_user and r.tier = p_tier and r.claimed_at is null
  ) then
    raise exception 'tier already out';
  end if;

  select count(*) into v_owned from card_inventory ci
    where ci.id = any(p_squad) and ci.discord_id = p_user;
  if v_owned <> 3 then raise exception 'card not owned'; end if;

  -- Deployed OR lost: a hold is an unclaimed run, so the one scan covers
  -- both, and the message stays the one the board already knows.
  if exists (
    select 1 from expedition_runs r
    where r.claimed_at is null and r.squad && p_squad
  ) then
    raise exception 'card already deployed';
  end if;

  -- The bench. The stamp's `until` is the whole rule.
  if exists (
    select 1 from card_inventory ci
    where ci.id = any(p_squad)
      and (ci.card -> 'wounded' ->> 'until')::timestamptz > now()
  ) then
    raise exception 'card is wounded';
  end if;

  -- Consent: nothing one of one boards a route that can lose it. The
  -- app names the card; this is the law behind the sentence.
  if p_tier in ('legend', 'rescue', 'legendary') and exists (
    select 1 from card_inventory ci
    where ci.id = any(p_squad)
      and (ci.foil_type = 'eclipse' or ci.card ? 'moment' or ci.card ? 'champWin' or ci.card ? 'team')
  ) then
    raise exception 'card is one of one';
  end if;

  -- A Cursed card sent out again has a chance of not coming back (the
  -- app rolls it); a Cursed card cannot be RESCUED FOR, because the
  -- rescue would be the thing that lost it.
  if p_tier = 'rescue' then
    if p_target is null or not exists (
      select 1 from expedition_runs h
      where h.id = p_target and h.discord_id = p_user and h.tier = 'lost' and h.claimed_at is null
    ) then
      raise exception 'no such lost card';
    end if;
  elsif p_tier = 'exorcism' then
    if p_target is null or not (p_target = any(p_squad)) then
      raise exception 'target not in squad';
    end if;
    if not exists (
      select 1 from card_inventory ci
      where ci.id = p_target and ci.mutation in ('haunted', 'cursed')
    ) then
      raise exception 'card is not afflicted';
    end if;
  elsif p_target is not null then
    raise exception 'target not wanted';
  end if;

  -- Fragments open the Legendary route, and only it.
  if p_fragments > 0 then
    if p_tier <> 'legendary' then raise exception 'fragments not wanted'; end if;
    select fragments into v_have from expedition_supplies s
      where s.discord_id = p_user for update;
    if coalesce(v_have, 0) < p_fragments then raise exception 'not enough fragments'; end if;
    update expedition_supplies set fragments = fragments - p_fragments, updated_at = now()
      where expedition_supplies.discord_id = p_user;
  end if;

  -- The free policy: claimed by primary-key insert, so a week has one.
  if p_policy_week is not null then
    if not p_insured then raise exception 'policy without insurance'; end if;
    if not coalesce(v_patron, false) then raise exception 'policy is a patron perk'; end if;
    begin
      insert into expedition_policies (discord_id, week_start) values (p_user, p_policy_week);
    exception when unique_violation then
      raise exception 'policy already used';
    end;
  end if;

  v_resolves := now() + make_interval(hours => p_hours);
  insert into expedition_runs
    (discord_id, season, tier, squad, shine, resolves_at, forks, insured, target, fee, policy_week)
  values
    (p_user, p_season, p_tier, p_squad, p_shine, v_resolves, p_forks, p_insured, p_target, p_fee, p_policy_week)
  returning id into v_run_id;

  if p_policy_week is not null then
    update expedition_policies set run_id = v_run_id
      where expedition_policies.discord_id = p_user and week_start = p_policy_week;
  end if;

  -- The fee, last: everything above can still refuse without a refund.
  if p_fee > 0 then
    if v_balance < p_fee then raise exception 'insufficient balance'; end if;
    insert into betting_ledger (discord_id, delta, reason, ref_table, ref_id)
    values (p_user, -p_fee, 'expedition_fee', 'expedition_runs', v_run_id);
    update betting_profiles set balance = betting_profiles.balance - p_fee
      where betting_profiles.discord_id = p_user;
  end if;

  return query select v_run_id, v_resolves;
end;
$$;

revoke all on function public.launch_expedition(text, text, text, bigint[], int, int, int, boolean, bigint, int, bigint, date)
  from public, anon, authenticated;
grant execute on function public.launch_expedition(text, text, text, bigint[], int, int, int, boolean, bigint, int, bigint, date)
  to service_role;
