-- Card Expeditions — deploy a squad of three copies, come back with loot.
--
-- The app (trusted server code) computes shine, entry requirements, and
-- outcome rolls from src/lib/expeditions/config.ts — one tunable file,
-- the packs/config.ts pattern. These RPCs are the atomicity and the law:
-- ownership, no-double-deploy, the daily limit, the payout ledger, and
-- the mark stamp all happen in one transaction here, and the trigger
-- below is the guarantee no deployed copy leaves the collection.
-- Spec: docs/superpowers/specs/2026-08-27-card-expeditions-design.md.

create table public.expedition_runs (
  id          bigint generated always as identity primary key,
  discord_id  text not null references public.betting_profiles(discord_id),
  season      text not null,
  tier        text not null check (tier in ('scout', 'raid', 'legend')),
  -- coalesce, because array_length('{}') is NULL and `NULL = 3` is NULL,
  -- which a CHECK accepts: without it an empty squad passes the constraint.
  squad       bigint[] not null check (coalesce(array_length(squad, 1), 0) = 3),
  shine       int not null,
  started_at  timestamptz not null default now(),
  resolves_at timestamptz not null,
  outcome     jsonb,
  claimed_at  timestamptz
);

create index expedition_runs_owner_idx on public.expedition_runs (discord_id, season, claimed_at);
-- The deploy-lock lookups scan unclaimed runs' squads.
create index expedition_runs_active_squad_idx on public.expedition_runs using gin (squad) where claimed_at is null;

alter table public.expedition_runs enable row level security;

-- Owners see their own runs (the page reads with the user's own client);
-- every write goes through the RPCs.
create policy expedition_runs_owner_read on public.expedition_runs
  for select using (
    discord_id in (
      select p.discord_id from public.profiles p where p.id = auth.uid()
    )
  );

grant select on public.expedition_runs to authenticated;
grant all on public.expedition_runs to service_role;

-- === deploy lock =============================================================
-- A copy in an unclaimed run cannot leave the collection: not by melt
-- (dust_card deletes the row) and not by trade (ownership update). The
-- trigger is the guarantee; UI checks are courtesy.

-- security definer, not invoker rights: the guard has to see EVERY
-- unclaimed run, and expedition_runs is RLS'd to "your own runs". An
-- invoker-rights guard fired by a table the caller can reach with a
-- narrower view of expedition_runs would find no row and wave the card
-- through — the guarantee would rest on card_inventory's grants happening
-- to keep such callers out, which is a fact in a different migration.
-- Owning it here makes the lock true whoever issues the delete or update.
-- search_path is pinned for the usual definer reason.
create or replace function public.expedition_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.expedition_runs r
    where r.claimed_at is null and old.id = any(r.squad)
  ) then
    raise exception 'card is on expedition';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger card_inventory_expedition_guard
  before delete or update of discord_id on public.card_inventory
  for each row execute function public.expedition_guard();

-- === launch_expedition =======================================================

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

-- === claim_expedition ========================================================
-- The app rolls the outcome (CSPRNG, server-only) and this writes it once.
-- claimed_at is the reroll lock: a second claim of the same run fails, so
-- an outcome can never be shopped for. p_dollars is guarded like
-- open_card_pack's p_cost — service code passes config truth.

create or replace function public.claim_expedition(
  p_user text, p_run bigint, p_grade text, p_dollars bigint, p_comp boolean, p_mark text, p_bearer bigint
) returns table(balance bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run     expedition_runs%rowtype;
  v_current text;
  v_rank    int;
  v_new_rank int;
  v_balance bigint;
begin
  if p_grade not in ('poor', 'solid', 'jackpot') then raise exception 'unknown grade'; end if;
  if p_dollars not between 1 and 2000 then raise exception 'payout out of range'; end if;
  if p_mark is not null and p_mark not in ('trail', 'sigil', 'legend') then raise exception 'unknown mark'; end if;

  select * into v_run from expedition_runs r
    where r.id = p_run and r.discord_id = p_user for update;
  if not found then raise exception 'unknown run'; end if;
  if v_run.claimed_at is not null then raise exception 'already claimed'; end if;
  if v_run.resolves_at > now() then raise exception 'expedition still out'; end if;

  if p_mark is not null then
    if p_bearer is null or not (p_bearer = any(v_run.squad)) then
      raise exception 'bearer not in squad';
    end if;
    -- Replace only upward: trail(1) < sigil(2) < legend(3). An equal or
    -- lower roll keeps the copy's existing mark; the dollars still pay.
    select ci.card -> 'expedition' ->> 'mark' into v_current
      from card_inventory ci where ci.id = p_bearer;
    v_rank := case v_current when 'trail' then 1 when 'sigil' then 2 when 'legend' then 3 else 0 end;
    v_new_rank := case p_mark when 'trail' then 1 when 'sigil' then 2 when 'legend' then 3 end;
    if v_new_rank > v_rank then
      update card_inventory
        set card = jsonb_set(card, '{expedition}', jsonb_build_object(
          'mark', p_mark, 'tier', v_run.tier, 'date', to_char(now() at time zone 'utc', 'YYYY-MM-DD')))
        where id = p_bearer;
    end if;
  end if;

  update expedition_runs
    set outcome = jsonb_build_object('grade', p_grade, 'dollars', p_dollars, 'comp', p_comp,
                                     'mark', p_mark, 'bearer', p_bearer),
        claimed_at = now()
    where id = p_run;

  insert into betting_ledger (discord_id, delta, reason, ref_table, ref_id)
  values (p_user, p_dollars, 'expedition', 'expedition_runs', p_run);
  update betting_profiles set balance = betting_profiles.balance + p_dollars
    where betting_profiles.discord_id = p_user
    returning betting_profiles.balance into v_balance;

  -- The conflict target is named by constraint rather than by column list,
  -- the run_weekly_draw ruling: an inference list is an expression context
  -- where plpgsql substitutes this function's OUT parameters, so naming the
  -- primary key keeps the upsert immune to any future OUT-param rename.
  if p_comp then
    insert into card_pack_comps (discord_id, kind, remaining, granted, reason)
    values (p_user, 'standard', 1, 1, 'expedition run ' || p_run)
    on conflict on constraint card_pack_comps_pkey
    do update set remaining = card_pack_comps.remaining + 1,
                  granted   = card_pack_comps.granted + 1;
  end if;

  return query select v_balance;
end;
$$;

revoke all on function public.claim_expedition(text, bigint, text, bigint, boolean, text, bigint) from public, anon, authenticated;
grant execute on function public.claim_expedition(text, bigint, text, bigint, boolean, text, bigint) to service_role;
