-- Match win bonuses: winning a league match pays every identified member
-- of the winning team a pack's worth of betting dollars.
--
-- Paid by the weekly card drop after the week's games are ingested. The
-- job resolves winners from fixtures scores and members through approved
-- player_identity_links (plus captains); this migration owns the two
-- things the app must not: remembering who was already paid, and moving
-- the money.
--
-- Unlike fantasy_payout (whose composite lineup key forced a two-step
-- claim contract on the caller), a payout here is keyed by
-- (fixture, user) — which fits a real table — so claim and credit are one
-- atomic function. Re-running the drop re-calls pay_match_win for every
-- winner and every duplicate simply returns false.

create table if not exists public.match_win_payouts (
  id          bigint generated always as identity primary key,
  fixture_id  uuid not null references public.fixtures(id) on delete cascade,
  discord_id  text not null references public.betting_profiles(discord_id),
  season      text not null,
  -- Monday (Eastern) of the week the fixture decided, for reporting.
  week        date not null,
  amount      bigint not null check (amount > 0),
  paid_at     timestamptz not null default now(),
  -- One bonus per member per won match. THE idempotency guard: the
  -- insert's conflict on this is how a replayed run recognizes itself.
  unique (fixture_id, discord_id)
);

-- Public read for transparency (the ledger the payouts feed is the same);
-- writes stay behind the function below.
alter table public.match_win_payouts enable row level security;
create policy match_win_payouts_public_read on public.match_win_payouts for select using (true);
grant select on public.match_win_payouts to anon, authenticated;
grant all on public.match_win_payouts to service_role;

-- === pay_match_win ===========================================================
-- Credits one member's bonus for one won fixture, exactly once. Returns
-- true when this call paid, false when the (fixture, user) pair was
-- already paid. Money invariant as everywhere: ledger row and balance
-- move together, in the same transaction as the claim row. Reason
-- 'match_win' is (like chase_bounty) deliberately not a PROFIT_REASON —
-- winning your match is not gambling profit.

create or replace function public.pay_match_win(
  p_fixture uuid,
  p_user text,
  p_season text,
  p_week date,
  p_amount bigint
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  if p_amount <= 0 then raise exception 'amount must be positive'; end if;

  insert into match_win_payouts(fixture_id, discord_id, season, week, amount)
    values (p_fixture, p_user, p_season, p_week, p_amount)
    on conflict (fixture_id, discord_id) do nothing
    returning id into v_id;
  if v_id is null then return false; end if;

  perform 1 from betting_profiles where discord_id = p_user for update;
  if not found then raise exception 'unknown user %', p_user; end if;

  insert into betting_ledger(discord_id, delta, reason, ref_table, ref_id)
    values (p_user, p_amount, 'match_win', 'match_win_payouts', v_id);
  update betting_profiles set balance = balance + p_amount where discord_id = p_user;
  return true;
end;
$$;

-- Same lockdown as the pack and chase RPCs: the job authorizes, PostgREST
-- must not.
revoke all on function public.pay_match_win(uuid, text, text, date, bigint) from public, anon, authenticated;
grant execute on function public.pay_match_win(uuid, text, text, date, bigint) to service_role;
