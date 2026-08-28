-- Roster sets: collect the five who played for one team in one week, and
-- the league pays you once for it.
--
-- Two tables rather than one, because there are two different "once"es
-- here and only one of them is about the collector:
--
--   card_set_claims       — one claim per (collector, season, week, team).
--                           Stops the same person claiming twice.
--   card_set_claim_copies — one row per SPENT COPY, primary-keyed on the
--                           copy. Stops the same five cards being traded
--                           around a group and paying out for each of them
--                           in turn. A claims table alone cannot say that:
--                           its uniqueness is per person, and the cards are
--                           the thing being reused.
--
-- The second is the reason this is a migration and not a column. It has to
-- be the database that refuses, because the check spans people — no read
-- the claiming session can do will see a copy another wallet is about to
-- spend in the same instant.

create table if not exists public.card_set_claims (
  id           bigserial primary key,
  discord_id   text not null,
  season       text not null,
  edition_week date not null,
  team_name    text not null,
  copy_ids     bigint[] not null,
  amount       bigint not null,
  claimed_at   timestamptz not null default now(),
  constraint card_set_claims_once unique (discord_id, season, edition_week, team_name)
);

create table if not exists public.card_set_claim_copies (
  inventory_id bigint primary key,
  claim_id     bigint not null references public.card_set_claims(id) on delete cascade
);

create index if not exists card_set_claims_owner_idx
  on public.card_set_claims (discord_id, season, edition_week);
create index if not exists card_set_claim_copies_claim_idx
  on public.card_set_claim_copies (claim_id);

alter table public.card_set_claims enable row level security;
alter table public.card_set_claim_copies enable row level security;

-- A collector reads their own claims (the page greys out what is already
-- paid). Writes are the RPC's alone, so there is no insert policy at all.
create policy card_set_claims_owner_read on public.card_set_claims
  for select to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.discord_id = card_set_claims.discord_id
  ));

grant select on public.card_set_claims to authenticated;
grant all on public.card_set_claims to service_role;
grant all on public.card_set_claim_copies to service_role;
grant usage on sequence public.card_set_claims_id_seq to service_role;

-- === claim_team_set ==========================================================
-- The app decides WHO the five are — that is roster truth and it lives in
-- src/lib/cards/sets.ts, built off the same buildTeamCards the team card
-- prints. Postgres checks the things the app cannot be trusted about
-- because they span sessions: that the copies are this caller's, that they
-- are from the week being claimed, that none has been spent before, and
-- that the payout is in range. Same division as open_card_pack's p_cost.

create or replace function public.claim_team_set(
  p_user text, p_season text, p_week date, p_team text, p_copies bigint[], p_amount bigint
) returns table(claim_id bigint, balance bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owned   int;
  v_claim   bigint;
  v_balance bigint;
begin
  if p_team is null or length(trim(p_team)) = 0 then raise exception 'unknown team'; end if;
  -- A set is five slots. Not "at least five": a caller passing extra ids
  -- would spend copies the collector never agreed to hand over.
  if array_length(p_copies, 1) is distinct from 5
     or (select count(distinct c) from unnest(p_copies) c) <> 5 then
    raise exception 'a set is five distinct cards';
  end if;
  -- Ranged like every other payout argument: service code passes config
  -- truth (TEAM_SET_BONUS), Postgres refuses anything absurd anyway.
  if p_amount not between 1 and 1000 then raise exception 'bad amount'; end if;

  -- Wallet lock first, the open_daily_pack pattern: it serializes this
  -- caller's claims against each other so two clicks cannot both pass the
  -- ownership check before either has inserted.
  perform 1 from betting_profiles where betting_profiles.discord_id = p_user for update;
  if not found then raise exception 'unknown user %', p_user; end if;

  select count(*) into v_owned from card_inventory ci
    where ci.id = any(p_copies)
      and ci.discord_id = p_user
      and ci.season = p_season
      and ci.edition_week = p_week;
  if v_owned <> 5 then raise exception 'cards not owned for that week'; end if;

  -- Burn first, pay second — the gauntlet settlement's ordering. The claim
  -- row and then the copy rows are both uniqueness checks; whichever loses
  -- a race raises before a single dollar is credited.
  insert into card_set_claims (discord_id, season, edition_week, team_name, copy_ids, amount)
  values (p_user, p_season, p_week, p_team, p_copies, p_amount)
  returning id into v_claim;

  insert into card_set_claim_copies (inventory_id, claim_id)
  select c, v_claim from unnest(p_copies) c;

  insert into betting_ledger (discord_id, delta, reason, ref_table, ref_id)
  values (p_user, p_amount, 'team_set', 'card_set_claims', v_claim);
  update betting_profiles set balance = betting_profiles.balance + p_amount
    where betting_profiles.discord_id = p_user
    returning betting_profiles.balance into v_balance;

  return query select v_claim, v_balance;
end;
$$;

revoke all on function public.claim_team_set(text, text, date, text, bigint[], bigint) from public, anon, authenticated;
grant execute on function public.claim_team_set(text, text, date, text, bigint[], bigint) to service_role;
