-- Expedition routes: forks, harm, mutations, insurance, rescue and death.
--
-- The redesign turns a fire-and-forget timer into a run with checkpoints
-- that pause and ask, and a squad that can come home changed: wounded
-- (benched three days), lost (a week to rescue or ransom), dead (gone,
-- with a grave), or mutated (a permanent stamp that Fantasy, the Gauntlet
-- and the market all read). The app still computes every roll
-- (src/lib/expeditions/routes.ts) and Postgres still owns the law:
-- ownership, the locks, the windows a fork can be answered in, the fees,
-- the ledger, and which stamps a claim may write.
--
-- Nothing here touches pack odds, ratings, or what a patron pays for.
--
-- What changes, in order:
--   1. expedition_runs learns forks, choices, insurance, a target card and
--      the fee it cost. Six tiers plus a seventh, 'lost', which is not a
--      run at all but the HOLD on a lost card — reusing the deploy lock so
--      a lost card cannot be dusted, traded or fielded while it is away.
--   2. Supplies (map fragments), weekly free policies, and a graveyard.
--   3. card_inventory grows a generated `mutation` column off the card
--      json, and a guard that keeps a fresh Cursed card off the market.
--   4. launch_expedition (v3): the old signature is kept as a wrapper.
--   5. decide_expedition_fork: the only write between launch and claim.
--   6. resolve_expedition: the claim, taking the whole outcome as json.
--   7. ransom_lost_card and expire_lost_cards.
--   8. record_card_provenance learns 'died'.

-- === 1. the run row ==========================================================

alter table public.expedition_runs drop constraint if exists expedition_runs_tier_check;
alter table public.expedition_runs
  add constraint expedition_runs_tier_check
  check (tier in ('scout', 'raid', 'legend', 'rescue', 'exorcism', 'legendary', 'lost'));

-- A hold holds one card; a run takes three. The RPC still demands three
-- for a launch; the table only stops nonsense.
alter table public.expedition_runs drop constraint if exists expedition_runs_squad_check;
alter table public.expedition_runs
  add constraint expedition_runs_squad_check
  check (coalesce(array_length(squad, 1), 0) between 1 and 3);

alter table public.expedition_runs
  add column if not exists forks       int     not null default 0 check (forks between 0 and 6),
  add column if not exists choices     jsonb   not null default '[]'::jsonb,
  add column if not exists insured     boolean not null default false,
  add column if not exists target      bigint,
  add column if not exists fee         bigint  not null default 0 check (fee >= 0),
  add column if not exists policy_week date,
  -- How many forks have been announced. The sweep raises it as it pings;
  -- the page never reads it.
  add column if not exists pinged      int     not null default 0;

comment on column public.expedition_runs.target is
  'A Rescue''s lost card, an Exorcism''s afflicted card, or — on a ''lost'' hold — the run that lost it.';

-- Holds by card: the deploy-lock scan already covers them (the gin index
-- on unclaimed squads); this one answers "is this card lost right now".
create index if not exists expedition_runs_lost_idx
  on public.expedition_runs (discord_id) where tier = 'lost' and claimed_at is null;

-- === 2. supplies, policies, the graveyard ====================================

create table if not exists public.expedition_supplies (
  discord_id text primary key references public.betting_profiles(discord_id),
  fragments  int not null default 0 check (fragments >= 0),
  updated_at timestamptz not null default now()
);

alter table public.expedition_supplies enable row level security;

create policy expedition_supplies_owner_read on public.expedition_supplies
  for select using (
    discord_id in (select p.discord_id from public.profiles p where p.id = auth.uid())
  );

grant select on public.expedition_supplies to authenticated;
grant all on public.expedition_supplies to service_role;

-- One free policy a week for a patron, claimed by primary-key insert
-- BEFORE the run launches — the card_print_rerolls discipline, so two
-- launches racing cannot both be free.
create table if not exists public.expedition_policies (
  discord_id text not null references public.betting_profiles(discord_id),
  week_start date not null,
  run_id     bigint,
  created_at timestamptz not null default now(),
  primary key (discord_id, week_start)
);

alter table public.expedition_policies enable row level security;
grant all on public.expedition_policies to service_role;

-- Where a dead card goes. The whole frozen copy, so the shelf can show a
-- headstone with the art on it, and the run that did it.
create table if not exists public.expedition_graveyard (
  id           bigint generated always as identity primary key,
  discord_id   text not null references public.betting_profiles(discord_id),
  inventory_id bigint not null,
  season       text not null,
  slug         text not null,
  player_name  text not null,
  tier         text not null,
  foil         boolean not null,
  foil_type    text,
  signed       boolean not null default false,
  card         jsonb not null,
  run_id       bigint,
  -- 'route' for a death on the Legendary route, 'unrescued' for a lost
  -- card nobody came back for.
  cause        text not null check (cause in ('route', 'unrescued')),
  died_at      timestamptz not null default now()
);

create index if not exists expedition_graveyard_owner_idx on public.expedition_graveyard (discord_id, died_at);

alter table public.expedition_graveyard enable row level security;

create policy expedition_graveyard_owner_read on public.expedition_graveyard
  for select using (
    discord_id in (select p.discord_id from public.profiles p where p.id = auth.uid())
  );

grant select on public.expedition_graveyard to authenticated;
grant all on public.expedition_graveyard to service_role;

-- === 3. the mutation column and the curse guard ==============================
-- Generated off the json the renderer reads, so there is one write and
-- every SQL guard can read it under its own lock. Stored, so it indexes.

alter table public.card_inventory
  add column if not exists mutation text
    generated always as (card -> 'mutation' ->> 'key') stored;

alter table public.card_inventory drop constraint if exists card_inventory_mutation_check;
alter table public.card_inventory
  add constraint card_inventory_mutation_check
  check (mutation is null or mutation in ('irradiated', 'hardened', 'haunted', 'cursed', 'voidtouched'));

create index if not exists card_inventory_mutation_idx
  on public.card_inventory (season, mutation) where mutation is not null;

-- A Cursed card is untradeable for seven days after it comes home: no
-- sale, no trade, no gift. Definer rights for expedition_guard's reason —
-- the rule must hold whoever issues the update. The date is the stamp's
-- own, so an Exorcism (which removes the stamp) lifts it at once.
create or replace function public.curse_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.card -> 'mutation' ->> 'key' = 'cursed'
     and (old.card -> 'mutation' ->> 'date')::date + 7 > (now() at time zone 'utc')::date then
    raise exception 'card is cursed';
  end if;
  return new;
end;
$$;

drop trigger if exists card_inventory_curse_guard on public.card_inventory;
create trigger card_inventory_curse_guard
  before update of discord_id on public.card_inventory
  for each row execute function public.curse_guard();

-- === 4. launch_expedition (v3) ===============================================
-- The old six-argument signature is kept below as a wrapper — the same
-- launch, no forks, no fee — so nothing that spoke to it breaks.

create or replace function public.launch_expedition(
  p_user text, p_season text, p_tier text, p_squad bigint[], p_shine int, p_hours int,
  p_forks int, p_insured boolean, p_fee bigint, p_fragments int, p_target bigint, p_policy_week date
) returns table(run_id bigint, resolves_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today   date := (now() at time zone 'America/New_York')::date;
  v_patron  boolean;
  v_balance bigint;
  v_limit   int;
  v_used    int;
  v_owned   int;
  v_run_id  bigint;
  v_resolves timestamptz;
  v_have    int;
begin
  if p_tier not in ('scout', 'raid', 'legend', 'rescue', 'exorcism', 'legendary') then
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

  -- Wallet lock serializes the daily-limit check (open_daily_pack pattern),
  -- and now the fee too.
  select patron_until > now(), balance into v_patron, v_balance
    from betting_profiles where betting_profiles.discord_id = p_user for update;
  if not found then raise exception 'unknown user %', p_user; end if;

  -- The tier slot. Holds ('lost') are not runs and never occupy one.
  if exists (
    select 1 from expedition_runs r
    where r.discord_id = p_user and r.tier = p_tier and r.claimed_at is null
  ) then
    raise exception 'tier already out';
  end if;

  v_limit := case when coalesce(v_patron, false) then 2 else 1 end;
  select count(*) into v_used from expedition_runs r
    where r.discord_id = p_user
      and r.tier <> 'lost'
      and (r.started_at at time zone 'America/New_York')::date = v_today;
  if v_used >= v_limit then raise exception 'daily expedition limit'; end if;

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

-- The six-argument launch, as it was: a run with no forks and no fee.
create or replace function public.launch_expedition(
  p_user text, p_season text, p_tier text, p_squad bigint[], p_shine int, p_hours int
) returns table(run_id bigint, resolves_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select * from public.launch_expedition(p_user, p_season, p_tier, p_squad, p_shine, p_hours, 0, false, 0, 0, null, null);
$$;

revoke all on function public.launch_expedition(text, text, text, bigint[], int, int) from public, anon, authenticated;
grant execute on function public.launch_expedition(text, text, text, bigint[], int, int) to service_role;

-- === 5. the fork ============================================================
-- N forks split a run into N+1 legs; fork i (0-based) opens at the end of
-- leg i+1 and closes at the end of the next. routes.ts computes the same
-- window for the page; this is the one the write is checked against.

create or replace function public.expedition_fork_window(
  p_started timestamptz, p_resolves timestamptz, p_forks int, p_index int
) returns table(opens_at timestamptz, closes_at timestamptz)
language sql
immutable
as $$
  select p_started + (p_resolves - p_started) * ((p_index + 1)::double precision / (p_forks + 1)),
         p_started + (p_resolves - p_started) * ((p_index + 2)::double precision / (p_forks + 1));
$$;

create or replace function public.decide_expedition_fork(
  p_user text, p_run bigint, p_index int, p_choice text
) returns table(closes_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run   expedition_runs%rowtype;
  v_open  timestamptz;
  v_close timestamptz;
begin
  if p_choice not in ('camp', 'push', 'favour', 'light', 'rally') then raise exception 'unknown choice'; end if;

  select * into v_run from expedition_runs r
    where r.id = p_run and r.discord_id = p_user for update;
  if not found then raise exception 'unknown run'; end if;
  if v_run.claimed_at is not null then raise exception 'already claimed'; end if;
  if p_index < 0 or p_index >= v_run.forks then raise exception 'no such fork'; end if;
  if exists (
    select 1 from jsonb_array_elements(v_run.choices) c where (c ->> 'index')::int = p_index
  ) then
    raise exception 'fork already decided';
  end if;

  select w.opens_at, w.closes_at into v_open, v_close
    from expedition_fork_window(v_run.started_at, v_run.resolves_at, v_run.forks, p_index) w;
  if now() < v_open then raise exception 'fork not open'; end if;
  if now() >= v_close then raise exception 'fork closed'; end if;

  update expedition_runs
    set choices = choices || jsonb_build_array(jsonb_build_object('index', p_index, 'choice', p_choice, 'at', now()))
    where id = p_run;

  return query select v_close;
end;
$$;

revoke all on function public.decide_expedition_fork(text, bigint, int, text) from public, anon, authenticated;
grant execute on function public.decide_expedition_fork(text, bigint, int, text) to service_role;

-- === 6. resolve_expedition ==================================================
-- The claim. The app rolls everything (grade, dollars, forks, fates,
-- mutations) and hands the whole outcome over as one json document; this
-- checks every field against what the config could have produced, then
-- writes it all in one transaction. claimed_at is still the reroll lock.
--
-- The dollar ceiling is maxExpeditionPayout() in config.ts — the best base
-- x the shine cap x the brief bonus x the loot-multiplier cap — and a test
-- (config.test.ts) reads this file and fails if the two disagree.

create or replace function public.resolve_expedition(p_user text, p_run bigint, p_outcome jsonb)
returns table(balance bigint, fragments int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run       expedition_runs%rowtype;
  v_grade     text := p_outcome ->> 'grade';
  v_dollars   bigint := coalesce((p_outcome ->> 'dollars')::bigint, 0);
  v_comp      boolean := coalesce((p_outcome ->> 'comp')::boolean, false);
  v_mark      text := p_outcome ->> 'mark';
  v_bearer    bigint := (p_outcome ->> 'bearer')::bigint;
  v_frags     int := coalesce((p_outcome ->> 'fragments')::int, 0);
  v_rescued   boolean := (p_outcome ->> 'rescued')::boolean;
  v_cleansed  bigint := (p_outcome ->> 'cleansed')::bigint;
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
  if v_dollars not between 0 and 11250 then raise exception 'payout out of range'; end if;
  if v_mark is not null and v_mark not in ('trail', 'sigil', 'legend') then raise exception 'unknown mark'; end if;
  if v_frags not between 0 and 3 then raise exception 'bad fragments'; end if;
  if jsonb_typeof(p_outcome -> 'fates') is distinct from 'array' then raise exception 'bad fates'; end if;

  select * into v_run from expedition_runs r
    where r.id = p_run and r.discord_id = p_user for update;
  if not found then raise exception 'unknown run'; end if;
  if v_run.tier = 'lost' then raise exception 'unknown run'; end if;
  if v_run.claimed_at is not null then raise exception 'already claimed'; end if;
  if v_run.resolves_at > now() then raise exception 'expedition still out'; end if;

  -- Every fate must name a squad member, once.
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
    -- The ladder's ceilings are the law too, not only the app's tables.
    if v_kind = 'dead' and v_run.tier <> 'legendary' then raise exception 'fate beyond route'; end if;
    if v_kind = 'lost' and v_run.tier not in ('legend', 'rescue', 'legendary') then raise exception 'fate beyond route'; end if;
    if v_kind = 'wounded' and v_run.tier in ('scout', 'exorcism') then raise exception 'fate beyond route'; end if;
    if v_mut is not null and v_run.tier in ('scout', 'exorcism', 'rescue') then raise exception 'mutation beyond route'; end if;
    if v_mut = 'voidtouched' and v_run.tier <> 'legendary' then raise exception 'mutation beyond route'; end if;
  end loop;

  if v_mark is not null then
    if v_bearer is null or not (v_bearer = any(v_run.squad)) then raise exception 'bearer not in squad'; end if;
  end if;

  -- Claim FIRST: the deploy guard reads unclaimed runs, and a dead card
  -- has to be deletable below.
  update expedition_runs
    set outcome = p_outcome, claimed_at = now()
    where id = p_run;

  -- The mark, replace-only-upward as before.
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

  -- The fates.
  for v_fate in select * from jsonb_array_elements(p_outcome -> 'fates') loop
    v_id := (v_fate ->> 'id')::bigint;
    v_kind := v_fate ->> 'fate';
    v_mut := v_fate ->> 'mutation';

    -- One mutation per copy, permanent: a roll onto a stamped card is
    -- dropped here even if the app forgot to.
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

  -- A Rescue's verdict: the hold is released and the card comes home
  -- wounded. The hold row is what makes "rescued" true on the shelf.
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

  -- The Exorcism: the stamp comes off. The generated column follows.
  if v_run.tier = 'exorcism' then
    if v_cleansed is null or v_cleansed <> v_run.target then raise exception 'cleansed not the target'; end if;
    update card_inventory set card = card - 'mutation' where id = v_cleansed and discord_id = p_user;
  end if;

  -- The money. Zero is a real outcome (an Exorcism) and writes nothing.
  perform 1 from betting_profiles where betting_profiles.discord_id = p_user for update;
  if v_dollars > 0 then
    insert into betting_ledger (discord_id, delta, reason, ref_table, ref_id)
    values (p_user, v_dollars, 'expedition', 'expedition_runs', p_run);
    update betting_profiles set balance = betting_profiles.balance + v_dollars
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

-- === 7. ransom and the grave ================================================

create or replace function public.ransom_lost_card(p_user text, p_hold bigint, p_dollars bigint)
returns table(balance bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hold    expedition_runs%rowtype;
  v_balance bigint;
begin
  if p_dollars < 1 or p_dollars > 5000 then raise exception 'bad ransom'; end if;
  select * into v_hold from expedition_runs r
    where r.id = p_hold and r.discord_id = p_user and r.tier = 'lost' for update;
  if not found then raise exception 'no such lost card'; end if;
  if v_hold.claimed_at is not null then raise exception 'no such lost card'; end if;

  select betting_profiles.balance into v_balance from betting_profiles
    where betting_profiles.discord_id = p_user for update;
  if not found then raise exception 'unknown user %', p_user; end if;
  if v_balance < p_dollars then raise exception 'insufficient balance'; end if;

  update expedition_runs
    set claimed_at = now(), outcome = jsonb_build_object('ransomed', true, 'dollars', p_dollars)
    where id = p_hold;
  update card_inventory
    set card = jsonb_set(card, '{wounded}', jsonb_build_object('until', now() + interval '72 hours', 'run', p_hold))
    where id = v_hold.squad[1] and discord_id = p_user;

  insert into betting_ledger (discord_id, delta, reason, ref_table, ref_id)
  values (p_user, -p_dollars, 'expedition_ransom', 'expedition_runs', p_hold);
  update betting_profiles set balance = betting_profiles.balance - p_dollars
    where betting_profiles.discord_id = p_user
    returning betting_profiles.balance into v_balance;

  return query select v_balance;
end;
$$;

revoke all on function public.ransom_lost_card(text, bigint, bigint) from public, anon, authenticated;
grant execute on function public.ransom_lost_card(text, bigint, bigint) to service_role;

-- A hold past its week with nobody come for it: the card is gone. Run by
-- the sweep; returns how many it buried.
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

-- === 8. provenance learns 'died' ============================================
-- Re-declared in full, the dust_card ruling. The ONLY change is the DELETE
-- branch reading fpl.card_fate: a death is not a dust, and the chain of
-- custody should say which.

alter table public.card_provenance drop constraint if exists card_provenance_event_check;
alter table public.card_provenance
  add constraint card_provenance_event_check
  check (event in ('minted', 'transferred', 'dusted', 'died'));

create or replace function public.record_card_provenance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref   text;
  v_table text;
  v_id    bigint;
begin
  if tg_op = 'INSERT' then
    insert into public.card_provenance (inventory_id, event, to_discord, ref_table, ref_id, at)
    values (new.id, 'minted', new.discord_id,
            case when new.pack_open_id is not null then 'card_pack_opens' end,
            new.pack_open_id, new.acquired_at);
    return null;
  end if;
  if tg_op = 'DELETE' then
    insert into public.card_provenance (inventory_id, event, from_discord)
    values (old.id,
            case when nullif(current_setting('fpl.card_fate', true), '') = 'died' then 'died' else 'dusted' end,
            old.discord_id);
    return null;
  end if;
  v_ref := nullif(current_setting('fpl.provenance_ref', true), '');
  if v_ref ~ '^[a-z_]+:[0-9]+$' then
    v_table := split_part(v_ref, ':', 1);
    v_id := split_part(v_ref, ':', 2)::bigint;
  end if;
  insert into public.card_provenance (inventory_id, event, from_discord, to_discord, ref_table, ref_id)
  values (new.id, 'transferred', old.discord_id, new.discord_id, v_table, v_id);
  return null;
end;
$$;
