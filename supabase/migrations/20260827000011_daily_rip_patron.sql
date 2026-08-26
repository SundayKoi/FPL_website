-- The Daily Rip and the Patron Flame.
--
-- DAILY RIP: one free pack per Eastern-calendar day, claimed on the site or
-- through the Discord /rip command. Free means cost 0 — which open_card_pack
-- deliberately rejects, so the daily gets its own RPC rather than a loosened
-- guard on the paid path. A cost-0 row in card_pack_opens IS the claim
-- record: no new table, and refund_card_pack already handles it (a 0 refund
-- moves no money, and the fulfilled-guard reads card_inventory).
--
-- PATRON: a real-money supporter ($ collected over Venmo, granted by an
-- admin — see supabase/tests/grant_patron.sql). Patrons get a second daily
-- rip and a visible flame frame. Deliberately NOT stronger packs, better
-- odds, or exclusive cards: the moment a wallet beats a good week, the
-- merit axis the card system is built on collapses.

alter table public.betting_profiles
  add column if not exists patron_until timestamptz;

-- Who is a patron, publicly. A view rather than opening betting_profiles:
-- the profile row carries balance and streaks nobody else's business; this
-- exposes exactly the three columns the supporters page renders. Owner
-- rights on purpose — that is what lets it read through the deny-all RLS.
create or replace view public.patrons_public as
  select username, avatar_url, patron_until
  from public.betting_profiles
  where patron_until > now();

grant select on public.patrons_public to anon, authenticated;

-- === open_daily_pack =========================================================
-- The free-pack twin of open_card_pack. Same shape (lock the wallet row,
-- guard, insert the open, return the id the caller fulfills against), plus
-- the day-limit and the streak.
--
-- The wallet lock is load-bearing even though no money moves: it serializes
-- two concurrent claims by the same user, so both cannot pass the count
-- check and mint two "one per day" packs.
--
-- Day boundary is the EASTERN calendar day — the league lives on ET
-- (matches are "Monday 8 PM ET"), and a UTC boundary would reset everyone's
-- daily at 8 PM in the evening.
--
-- Streak pays a bonus every 7th consecutive day: +100 betting dollars, with
-- the ledger row every credit path writes (reason 'daily_rip_streak', kept
-- out of PROFIT_REASONS like admin_grant, so a streak does not read as
-- gambling profit). Small next to /daily's 250 on purpose — the pack is the
-- prize; the bonus is a nod to showing up.

create or replace function public.open_daily_pack(p_user text, p_season text)
returns table(open_id bigint, streak int, bonus bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'America/New_York')::date;
  v_patron boolean;
  v_limit int;
  v_used int;
  v_open_id bigint;
  v_streak int;
  v_bonus bigint := 0;
begin
  select patron_until > now() into v_patron
    from betting_profiles where discord_id = p_user for update;
  if not found then raise exception 'unknown user %', p_user; end if;

  v_limit := case when coalesce(v_patron, false) then 2 else 1 end;

  -- Counted across BOTH leagues: "your free daily pack" is one thing, not
  -- one per season. cost = 0 is what marks a rip; paid opens don't count.
  select count(*) into v_used from card_pack_opens
   where discord_id = p_user and cost = 0
     and (opened_at at time zone 'America/New_York')::date = v_today;
  if v_used >= v_limit then raise exception 'already ripped today'; end if;

  insert into card_pack_opens(discord_id, season, cost)
    values (p_user, p_season, 0)
    returning id into v_open_id;

  -- Streak: consecutive Eastern days with at least one rip, ending today.
  -- Today's row is already inserted, so a first-ever rip reads streak 1.
  select count(*) into v_streak from (
    select d, row_number() over (order by d desc) as rn
    from (
      select distinct (opened_at at time zone 'America/New_York')::date as d
      from card_pack_opens
      where discord_id = p_user and cost = 0
    ) days
  ) runs
  -- rn is bigint (row_number), and date - bigint is not an operator.
  where runs.d = v_today - (runs.rn - 1)::int;

  -- Bonus only on the FIRST rip of a qualifying day, or a patron's second
  -- rip would pay the same milestone twice.
  if v_streak % 7 = 0 and v_used = 0 then
    v_bonus := 100;
    insert into betting_ledger(discord_id, delta, reason, ref_table, ref_id)
      values (p_user, v_bonus, 'daily_rip_streak', 'card_pack_opens', v_open_id);
    update betting_profiles set balance = balance + v_bonus where discord_id = p_user;
  end if;

  return query select v_open_id, v_streak, v_bonus;
end;
$$;

-- Same lockdown as open_card_pack: the app layer authorizes (the Discord id
-- comes from a verified session or a signature-checked interaction), so
-- PostgREST must not expose this to anon/authenticated.
revoke all on function public.open_daily_pack(text, text) from public, anon, authenticated;
grant execute on function public.open_daily_pack(text, text) to service_role;
