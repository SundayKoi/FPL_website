-- Expeditions: the base camp. What a collector builds between runs and
-- keeps: a second scouting squad, a tent, a forge that turns map fragments
-- into insurance, and a trophy wall.
-- Spec: docs/superpowers/specs/2026-09-23-expeditions-next-level-design.md §2.
--
-- One camp per collector, keyed by discord_id alone like the wallet and the
-- fragment pouch it is paid from, so it follows the collector across
-- seasons and across both leagues. It holds no season and no league: every
-- purchase is the collector's own, and nothing here reads or writes another
-- collector's row.
--
--   1. expedition_camps — the levels bought and the forged policies held.
--      Owner read (the expedition_supplies pattern); written only by the
--      RPCs below.
--
--   2. expedition_camp_price — THE price table. The app shows the same
--      numbers (CAMP_PRICES in src/lib/expeditions/camp.ts, held equal to
--      this function by camp.test.ts), but the purchase is priced here.
--
--   3. upgrade_expedition_camp — the one place a camp grows. The caller
--      names the upgrade and the price it showed; the price is recomputed
--      from the level under the lock and must match (the open_card_pack
--      p_cost discipline), so a double click cannot buy a second level at
--      the first level's price. Wallet, pouch and camp are locked in that
--      order; every dollar taken writes a betting_ledger row
--      ('expedition_camp') in the same transaction.
--
--   4. launch_expedition, the 12-argument body, redeclared from
--      20261020000001 (the newest declaration) with exactly two changes:
--      (a) a camp's second squad slot lets a second Scouting Run out;
--      (b) a forged run does not count against the weekly insurance cap.
--
--   5. launch_expedition, 14 arguments: p_forged. A forged launch spends a
--      forged policy instead of the weekly one: no INSURANCE_FEE, not
--      counted by the cap, at most one a week. The inner launch never sees
--      it — it is sent uninsured with the tier fee only, and the run is
--      marked insured and forged afterwards, in the same transaction — so
--      the weekly check in (4) is untouched.
--
-- The tent changes resolution, and resolution is the app's: routes.ts reads
-- `camp.tent` at the claim, under the edge rulebook (rules 6) only.
-- resolve_expedition is not redeclared.
--
-- Guardrail: the second slot is the one purchase that sends more squads
-- out a day. Two Scouting Runs pay 465 a day at base rates (531 with a
-- Speedrunner in both), under MAXED_DAILY_STREAK's 550; config.test.ts
-- holds that against CAMP_SLOTS_MAX, and `slots` is checked to the same
-- bound here. Scouting Runs only: nothing else gets a second slot.
--
-- Deploy safety: the app reads the camp through a fail-soft query (a
-- missing table hides the Camp tab and leaves one scout slot), and it calls
-- the 14-argument launch only when a forged policy is asked for, which
-- needs a camp, which needs this migration. The code can ship first.
-- This migration depends on no data. It must be applied after
-- 20261020000001, whose 12-argument launch body it carries forward, and
-- before any later migration that redeclares that body; it does not depend
-- on the rules-six or league-goal migrations.

-- === 1. the camp =============================================================

create table if not exists public.expedition_camps (
  discord_id      text primary key references public.betting_profiles(discord_id),
  slots           int  not null default 0 check (slots between 0 and 1),
  tent            int  not null default 0 check (tent between 0 and 2),
  forge           int  not null default 0 check (forge between 0 and 1),
  wall            int  not null default 0 check (wall between 0 and 2),
  forged_policies int  not null default 0 check (forged_policies between 0 and 2),
  -- Every dollar the camp has cost, for the owner's own reading. The
  -- ledger is the record; this is its running total.
  spent           bigint not null default 0 check (spent >= 0),
  updated_at      timestamptz not null default now()
);

alter table public.expedition_camps enable row level security;

drop policy if exists expedition_camps_owner_read on public.expedition_camps;
create policy expedition_camps_owner_read on public.expedition_camps
  for select using (
    discord_id in (select p.discord_id from public.profiles p where p.id = auth.uid())
  );

-- Read only, and only through the policy above. A camp grows through
-- upgrade_expedition_camp and shrinks through a forged launch, nowhere else.
revoke all on public.expedition_camps from anon, authenticated;
grant select on public.expedition_camps to authenticated;
grant all on public.expedition_camps to service_role;

-- A forged run is an insured run whose policy came from the forge. The
-- constraint says so, so no write can leave a run forged and uncovered.
alter table public.expedition_runs add column if not exists forged boolean not null default false;
alter table public.expedition_runs drop constraint if exists expedition_runs_forged_insured;
alter table public.expedition_runs
  add constraint expedition_runs_forged_insured check (not forged or insured);

-- "One forged launch a week" is counted off the runs, like the weekly cap.
create index if not exists expedition_runs_forged_idx
  on public.expedition_runs (discord_id, started_at) where forged;

-- === 2. the price table ======================================================
-- One row per (upgrade, level): the level being BOUGHT. A forged policy is
-- always level 1: it is spent, not built. An upgrade already at its top
-- level has no row, which is what 'already built' means.

create or replace function public.expedition_camp_price(p_upgrade text, p_level int)
returns table(dollars bigint, fragments int)
language sql
immutable
set search_path = public
as $$
  select v.dollars, v.fragments
  from (values
    ('slot',   1, 1500::bigint, 1),
    ('tent',   1,  600::bigint, 0),
    ('tent',   2, 1200::bigint, 1),
    ('forge',  1,  800::bigint, 1),
    ('wall',   1,  300::bigint, 0),
    ('wall',   2,  900::bigint, 0),
    ('policy', 1,    0::bigint, 2)
  ) as v(upgrade, level, dollars, fragments)
  where v.upgrade = p_upgrade and v.level = p_level
$$;

-- === 3. buying ===============================================================

create or replace function public.upgrade_expedition_camp(
  p_user text, p_upgrade text, p_dollars bigint, p_fragments int
) returns table(slots int, tent int, forge int, wall int, forged_policies int, balance bigint, fragments int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance bigint;
  v_have    int;
  v_camp    expedition_camps%rowtype;
  v_level   int;
  v_dollars bigint;
  v_frags   int;
begin
  if p_upgrade is null or p_upgrade not in ('slot', 'tent', 'forge', 'wall', 'policy') then
    raise exception 'unknown upgrade';
  end if;

  -- Wallet, then pouch, then camp: the order a forged launch takes too, so
  -- a purchase and a launch never wait on each other the wrong way round.
  select bp.balance into v_balance
    from betting_profiles bp where bp.discord_id = p_user for update;
  if not found then raise exception 'unknown user %', p_user; end if;

  select s.fragments into v_have
    from expedition_supplies s where s.discord_id = p_user for update;
  v_have := coalesce(v_have, 0);

  -- The camp row is made on first purchase. A refusal below raises, and
  -- the raise takes this insert back with it.
  insert into expedition_camps (discord_id) values (p_user)
    on conflict (discord_id) do nothing;
  select * into v_camp from expedition_camps c where c.discord_id = p_user for update;

  if p_upgrade = 'policy' then
    if v_camp.forge < 1 then raise exception 'forge not built'; end if;
    if v_camp.forged_policies >= 2 then raise exception 'forge is full'; end if;
    v_level := 1;
  else
    v_level := 1 + case p_upgrade
      when 'slot'  then v_camp.slots
      when 'tent'  then v_camp.tent
      when 'forge' then v_camp.forge
      else v_camp.wall
    end;
  end if;

  select pr.dollars, pr.fragments into v_dollars, v_frags
    from expedition_camp_price(p_upgrade, v_level) pr;
  if not found then raise exception 'already built'; end if;

  -- The price the player was shown must be the price of the level the
  -- lock found. A second click that raced the first is asking for the
  -- first level's price and meets the second level's: refused.
  if p_dollars is distinct from v_dollars or p_fragments is distinct from v_frags then
    raise exception 'bad price';
  end if;
  if v_balance < v_dollars then raise exception 'insufficient balance'; end if;
  if v_have < v_frags then raise exception 'not enough fragments'; end if;

  if v_dollars > 0 then
    insert into betting_ledger (discord_id, delta, reason, ref_table)
      values (p_user, -v_dollars, 'expedition_camp', 'expedition_camps');
    update betting_profiles bp set balance = bp.balance - v_dollars
      where bp.discord_id = p_user
      returning bp.balance into v_balance;
  end if;

  if v_frags > 0 then
    update expedition_supplies s set fragments = s.fragments - v_frags, updated_at = now()
      where s.discord_id = p_user
      returning s.fragments into v_have;
  end if;

  update expedition_camps c set
    slots           = c.slots + (case when p_upgrade = 'slot' then 1 else 0 end),
    tent            = c.tent + (case when p_upgrade = 'tent' then 1 else 0 end),
    forge           = c.forge + (case when p_upgrade = 'forge' then 1 else 0 end),
    wall            = c.wall + (case when p_upgrade = 'wall' then 1 else 0 end),
    forged_policies = c.forged_policies + (case when p_upgrade = 'policy' then 1 else 0 end),
    spent           = c.spent + v_dollars,
    updated_at      = now()
  where c.discord_id = p_user
  returning * into v_camp;

  return query select v_camp.slots, v_camp.tent, v_camp.forge, v_camp.wall,
                      v_camp.forged_policies, v_balance, v_have;
end;
$$;

-- === 4. launch_expedition, 12 arguments =======================================
-- The body of 20261020000001, copied whole, with two changes marked
-- "base camp": the tier slot counts a camp's second scouting squad, and the
-- weekly insurance count skips forged runs.

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
  v_insured int;
begin
  if p_tier not in ('scout', 'gilded', 'raid', 'legend', 'rescue', 'exorcism', 'legendary', 'mythic') then
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

  -- Insurance is weekly: one policy an Eastern week, two for a patron.
  -- Counted off the runs insured since Monday, under the wallet lock, so
  -- two launches racing for the last policy cannot both have it.
  if p_insured then
    select count(*) into v_insured from expedition_runs r
      -- Base camp: a forged run spent a forged policy, not this week's.
      where r.discord_id = p_user and r.insured and r.tier <> 'lost' and not r.forged
        and (r.started_at at time zone 'America/New_York')::date
            >= date_trunc('week', now() at time zone 'America/New_York')::date;
    if v_insured >= (case when coalesce(v_patron, false) then 2 else 1 end) then
      raise exception 'insurance used up';
    end if;
  end if;

  -- The tier slot. Holds ('lost') are not runs and never occupy one.
  -- Base camp: a camp's second squad slot lets a second Scouting Run out
  -- (expedition_camps.slots, 0 without a camp); every other route keeps one.
  if (
    select count(*) from expedition_runs r
    where r.discord_id = p_user and r.tier = p_tier and r.claimed_at is null
  ) >= 1 + (case when p_tier = 'scout'
                 then coalesce((select c.slots from expedition_camps c where c.discord_id = p_user), 0)
                 else 0 end) then
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
  if p_tier in ('legend', 'rescue', 'legendary', 'mythic') and exists (
    select 1 from card_inventory ci
    where ci.id = any(p_squad)
      and (ci.foil_type = 'eclipse' or ci.card ? 'moment' or ci.card ? 'champWin' or ci.card ? 'team' or ci.card ? 'dribb' or ci.card ? 'onAir')
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

  -- The Mythic route's own gates: something Voidtouched in the squad, and
  -- a Legend mark somewhere on the shelf. The app names the card; this is
  -- the law behind the sentence.
  if p_tier = 'mythic' then
    if not exists (
      select 1 from card_inventory ci where ci.id = any(p_squad) and ci.mutation = 'voidtouched'
    ) then
      raise exception 'mythic needs a voidtouched card';
    end if;
    if not exists (
      select 1 from card_inventory ci where ci.discord_id = p_user and ci.card -> 'expedition' ->> 'mark' = 'legend'
    ) then
      raise exception 'mythic needs a legend mark';
    end if;
  end if;

  -- Fragments open the Legendary and Mythic routes, and only them.
  if p_fragments > 0 then
    if p_tier not in ('legendary', 'mythic') then raise exception 'fragments not wanted'; end if;
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

-- === 5. launch_expedition, 14 arguments: p_forged =============================
-- No default on p_forged: PostgREST picks an overload by the argument names
-- it is sent, and a default here would make every 13-argument launch
-- ambiguous between this function and the convoy wrapper.

create or replace function public.launch_expedition(
  p_user text, p_season text, p_tier text, p_squad bigint[], p_shine int, p_hours int,
  p_forks int, p_insured boolean, p_fee bigint, p_fragments int, p_target bigint, p_policy_week date,
  p_convoy text, p_forged boolean
) returns table(run_id bigint, resolves_at timestamptz, convoy_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_held     int;
  v_forged   int;
  v_run_id   bigint;
  v_resolves timestamptz;
  v_code     text;
begin
  if not coalesce(p_forged, false) then
    return query
      select l.run_id, l.resolves_at, l.convoy_code
      from public.launch_expedition(p_user, p_season, p_tier, p_squad, p_shine, p_hours,
                                    p_forks, p_insured, p_fee, p_fragments, p_target, p_policy_week,
                                    p_convoy) l;
    return;
  end if;

  -- A Scouting Run and an Exorcism cannot hurt a card: nothing to insure.
  if p_tier in ('scout', 'exorcism') then raise exception 'policy not wanted'; end if;
  -- The forged policy IS the run's insurance. A bought policy or the
  -- patron's free one on top would spend a second policy on one run.
  if coalesce(p_insured, false) or p_policy_week is not null then
    raise exception 'forged policy stands alone';
  end if;

  -- The wallet lock first — the one every launch and every camp purchase
  -- takes — so two forged launches are counted one after the other.
  perform 1 from betting_profiles bp where bp.discord_id = p_user for update;
  if not found then raise exception 'unknown user %', p_user; end if;

  select c.forged_policies into v_held
    from expedition_camps c where c.discord_id = p_user for update;
  if coalesce(v_held, 0) < 1 then raise exception 'no forged policy'; end if;

  -- One forged launch an Eastern week (FORGED_PER_WEEK), counted off the
  -- runs themselves like the weekly cap.
  select count(*) into v_forged from expedition_runs r
    where r.discord_id = p_user and r.forged
      and (r.started_at at time zone 'America/New_York')::date
          >= date_trunc('week', now() at time zone 'America/New_York')::date;
  if v_forged >= 1 then raise exception 'forge spent this week'; end if;

  update expedition_camps c set forged_policies = c.forged_policies - 1, updated_at = now()
    where c.discord_id = p_user;

  -- Uninsured and without the free policy, as far as the inner launch
  -- knows: its weekly cap never counts this run, and never refuses it.
  select l.run_id, l.resolves_at, l.convoy_code into v_run_id, v_resolves, v_code
    from public.launch_expedition(p_user, p_season, p_tier, p_squad, p_shine, p_hours,
                                  p_forks, false, p_fee, p_fragments, p_target, null,
                                  p_convoy) l;

  update expedition_runs r set insured = true, forged = true where r.id = v_run_id;

  return query select v_run_id, v_resolves, v_code;
end;
$$;

-- === 6. who may call =========================================================
-- Service role only, every one: the app establishes who is calling and
-- composes these (src/lib/expeditions/actions.ts → runs.ts).

revoke all on function public.expedition_camp_price(text, int) from public, anon, authenticated;
grant execute on function public.expedition_camp_price(text, int) to service_role;

revoke all on function public.upgrade_expedition_camp(text, text, bigint, int) from public, anon, authenticated;
grant execute on function public.upgrade_expedition_camp(text, text, bigint, int) to service_role;

revoke all on function public.launch_expedition(text, text, text, bigint[], int, int, int, boolean, bigint, int, bigint, date)
  from public, anon, authenticated;
grant execute on function public.launch_expedition(text, text, text, bigint[], int, int, int, boolean, bigint, int, bigint, date)
  to service_role;

revoke all on function public.launch_expedition(text, text, text, bigint[], int, int, int, boolean, bigint, int, bigint, date, text, boolean)
  from public, anon, authenticated;
grant execute on function public.launch_expedition(text, text, text, bigint[], int, int, int, boolean, bigint, int, bigint, date, text, boolean)
  to service_role;
