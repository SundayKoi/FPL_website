-- Betting integration: announcements queue, pure-SQL lifecycle tick, pg_cron.
-- Ported from c:\fpl_gambling\db\migrations\008_announcements.sql (table —
-- already created by 20260813000001_betting_schema.sql) + 013_lock_warn.sql
-- (extends the kind check constraint with 'lock_warn') for the market
-- announce-queue reads, and from c:\fpl_gambling\bot\service.py (no SQL
-- source — plain Python there; reimplemented here as SQL RPCs, same
-- treatment as Task 3/4's lock_due_markets/lock_due_pickems) for:
--   unannounced/mark_announced -> unannounced_markets/mark_announced
--   markets_locking_soon, resolve_summary (not ported — announcer's job,
--     Task 12; this task only needs the queue reads + the pure-SQL tick)
--   unannounced_pickems/mark_pickem_announced (renamed unannounced_pickems
--     kept, mark_pickem_announced kept — table renames only)
--   unannounced_closed_seasons/season_podium/mark_season_announced
--   ledger_drift
--   resolvable_pickems (bot/main.py's lifecycle loop step, wrapped as a SQL
--     RPC so betting_lifecycle_tick can drive it directly)
-- betting_lifecycle_tick() is the pure-SQL half of bot/main.py's `lifecycle`
-- task loop: void_one_sided_markets(), lock_due_markets(), lock_due_pickems(),
-- then resolve_pickem() for every pick'em whose legs are all settled. The
-- Discord-posting half (unannounced_* + mark_*_announced + resolve_summary)
-- is the announcer edge function's job (Task 12) — not called from here.
--
-- Controller ruling (per Task 3/4's precedent): the entire betting RPC
-- surface is service_role-only — see the lockdown block at the end.
-- Authorization lives in the app layer, not in these functions.

-- === kind check constraint: 013_lock_warn.sql adds 'lock_warn' =============
-- Task 1's schema migration carried only the base ('open','resolved',
-- 'cancelled') constraint (008_announcements.sql, pre-013) — extend it here,
-- same as the source's ALTER, so markets_locking_soon can dedupe through the
-- same table with kind='lock_warn'.

alter table public.betting_announcements drop constraint if exists betting_announcements_kind_check;
alter table public.betting_announcements add constraint betting_announcements_kind_check
  check (kind in ('open', 'resolved', 'cancelled', 'lock_warn'));

-- === unannounced_markets: bot/service.py's unannounced, table renames ======
-- 'open' only while betting is actually possible (status OPEN and not yet
-- past lock_at); 'resolved'/'cancelled' just check terminal status.

create or replace function public.unannounced_markets(p_kind text)
returns table(
  id bigint, title text, team_a text, team_b text,
  game_at timestamptz, lock_at timestamptz,
  team_a_id bigint, team_a_code text, team_b_id bigint, team_b_code text,
  draw_enabled boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_kind not in ('open', 'resolved', 'cancelled') then
    raise exception 'unknown announcement kind %', p_kind;
  end if;
  return query
    select m.id, coalesce(m.title, ta.short_code || ' vs ' || tb.short_code),
           ta.name, tb.name, m.game_at, m.lock_at,
           m.team_a_id, ta.short_code, m.team_b_id, tb.short_code, m.draw_enabled
    from betting_markets m
    join betting_teams ta on ta.id = m.team_a_id
    join betting_teams tb on tb.id = m.team_b_id
    where (
        (p_kind = 'open' and m.status = 'OPEN' and now() < m.lock_at)
        or (p_kind = 'resolved' and m.status = 'RESOLVED')
        or (p_kind = 'cancelled' and m.status = 'CANCELLED')
      )
      and not exists (
        select 1 from betting_announcements a where a.market_id = m.id and a.kind = p_kind
      )
    order by m.id;
end;
$$;

-- === mark_announced: bot/service.py's mark_announced, table renames ========

create or replace function public.mark_announced(p_market bigint, p_kind text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into betting_announcements(market_id, kind) values (p_market, p_kind)
    on conflict do nothing;
$$;

-- === markets_locking_soon: bot/service.py, table renames ====================
-- OPEN markets whose lock is within p_within_minutes (and still future), not
-- yet lock-warned. The window > 5min so the warning lands before the
-- auto-lock at lock_at fires.

create or replace function public.markets_locking_soon(p_within_minutes int default 6)
returns table(id bigint, title text, lock_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select m.id, coalesce(m.title, ta.short_code || ' vs ' || tb.short_code), m.lock_at
  from betting_markets m
  join betting_teams ta on ta.id = m.team_a_id
  join betting_teams tb on tb.id = m.team_b_id
  where m.status = 'OPEN'
    and m.lock_at > now()
    and m.lock_at <= now() + make_interval(mins => p_within_minutes)
    and not exists (
      select 1 from betting_announcements a where a.market_id = m.id and a.kind = 'lock_warn'
    )
  order by m.lock_at;
$$;

-- === unannounced_pickems / mark_pickem_announced: bot/service.py ============
-- betting_pickems has no separate announcements table — announced_open /
-- announced_done booleans on the row itself (schema ported as-is from
-- pickems in 001_schema.sql). p_which='open' returns carryover/lock_at/legs
-- (status/legs-only columns null); 'done' returns status (the other columns
-- null) — one row shape, two populated subsets, matching the two dict shapes
-- bot/service.py returned for the two branches.

create or replace function public.unannounced_pickems(p_which text)
returns table(id bigint, title text, carryover bigint, lock_at timestamptz, event_id bigint, legs bigint, status text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_which = 'open' then
    return query
      select p.id, p.title, p.carryover, p.lock_at, p.event_id,
             (select count(*) from betting_pickem_legs l where l.pickem_id = p.id), null::text
      from betting_pickems p
      where p.status = 'OPEN' and not p.announced_open and now() < p.lock_at
      order by p.id;
  elsif p_which = 'done' then
    return query
      select p.id, p.title, null::bigint, null::timestamptz, p.event_id, null::bigint, p.status
      from betting_pickems p
      where p.status in ('RESOLVED', 'CANCELLED') and not p.announced_done
      order by p.id;
  else
    raise exception 'unknown pickem announcement kind %', p_which;
  end if;
end;
$$;

create or replace function public.mark_pickem_announced(p_pickem bigint, p_which text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_which = 'open' then
    update betting_pickems set announced_open = true where id = p_pickem;
  elsif p_which = 'done' then
    update betting_pickems set announced_done = true where id = p_pickem;
  else
    raise exception 'unknown pickem announcement kind %', p_which;
  end if;
end;
$$;

-- === resolvable_pickems: bot/service.py, table renames ======================
-- Pick'ems whose every leg is settled — ready for automatic resolution.
-- Exposed as its own RPC (same treatment as lock_due_markets/lock_due_pickems)
-- so betting_lifecycle_tick can drive it directly and it's independently
-- testable.

create or replace function public.resolvable_pickems()
returns setof bigint
language sql
stable
security definer
set search_path = public
as $$
  select p.id from betting_pickems p
  where p.status in ('OPEN', 'LOCKED')
    and not exists (
      select 1 from betting_pickem_legs l join betting_markets m on m.id = l.market_id
      where l.pickem_id = p.id and m.status not in ('RESOLVED', 'CANCELLED')
    )
  order by p.id;
$$;

-- === unannounced_closed_seasons / season_podium / mark_season_announced =====
-- bot/service.py, table renames only.

create or replace function public.unannounced_closed_seasons()
returns table(id bigint, name text)
language sql
stable
security definer
set search_path = public
as $$
  select id, name from betting_seasons where status = 'CLOSED' and not announced_closed order by id;
$$;

create or replace function public.season_podium(p_season bigint)
returns table(rank int, username text, balance bigint)
language sql
stable
security definer
set search_path = public
as $$
  select rank, coalesce(username, discord_id), balance
  from betting_season_results where season_id = p_season order by rank limit 3;
$$;

create or replace function public.mark_season_announced(p_season bigint)
returns void
language sql
security definer
set search_path = public
as $$
  update betting_seasons set announced_closed = true where id = p_season;
$$;

-- === ledger_drift: bot/service.py's ledger_drift, table renames =============
-- Wallets whose cached balance disagrees with their ledger sum, or whose
-- balance went negative. Always empty unless a bug bypassed the RPCs — any
-- row here is an incident, not noise.

create or replace function public.ledger_drift()
returns table(discord_id text, username text, balance bigint, ledger_total bigint)
language sql
stable
security definer
set search_path = public
as $$
  select u.discord_id, coalesce(u.username, u.discord_id), u.balance,
         coalesce(l.total, 0)::bigint as ledger_total
  from betting_profiles u
  left join (select discord_id, sum(delta) as total from betting_ledger group by discord_id) l
    on l.discord_id = u.discord_id
  where u.balance <> coalesce(l.total, 0) or u.balance < 0
  order by u.discord_id;
$$;

-- === betting_lifecycle_tick: pure-SQL half of bot/main.py's lifecycle loop ==
-- void one-sided markets before locking the rest (so a dead market
-- auto-refunds instead of sitting LOCKED forever), lock due markets, lock
-- due pick'ems, then resolve every pick'em whose legs are all settled. Kept
-- simple and transactional, matching the source loop exactly — no per-phase
-- error trapping; the pg_cron job retries next minute and pg_cron logs any
-- failure.

create or replace function public.betting_lifecycle_tick()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  perform public.void_one_sided_markets();
  perform public.lock_due_markets();
  perform public.lock_due_pickems();
  for v_id in select * from public.resolvable_pickems() loop
    perform public.resolve_pickem(v_id);
  end loop;
end;
$$;

-- === pg_cron: run the tick every minute ======================================
-- Idempotent by jobname: only schedule 'betting-lifecycle' if it doesn't
-- already exist (re-running this migration, e.g. via `db reset`, must not
-- error or double-schedule). The announcer + hourly ledger-drift-watchdog
-- HTTP jobs are added in Task 12 (they need the deployed function URL).

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'betting-lifecycle') then
    perform cron.schedule('betting-lifecycle', '* * * * *', $cron$select public.betting_lifecycle_tick()$cron$);
  end if;
end;
$$;

-- === lockdown: entire betting RPC surface is service_role-only ==============
-- Same controller ruling as 20260813000003/20260813000004: every function
-- below reads or writes betting state that must stay off the anon/
-- authenticated PostgREST surface — authorization lives in the app layer
-- (the announcer edge function / cron), which calls these with the
-- service_role key. Postgres's default PUBLIC execute grant is revoked, then
-- granted back to service_role only. (betting_lifecycle_tick is invoked by
-- pg_cron as the scheduling role — typically a superuser locally/in
-- Supabase's managed cron — so this lockdown does not block the cron job.)

revoke execute on function
  public.unannounced_markets(text),
  public.mark_announced(bigint, text),
  public.markets_locking_soon(int),
  public.unannounced_pickems(text),
  public.mark_pickem_announced(bigint, text),
  public.resolvable_pickems(),
  public.unannounced_closed_seasons(),
  public.season_podium(bigint),
  public.mark_season_announced(bigint),
  public.ledger_drift(),
  public.betting_lifecycle_tick()
from public, anon, authenticated;

grant execute on function
  public.unannounced_markets(text),
  public.mark_announced(bigint, text),
  public.markets_locking_soon(int),
  public.unannounced_pickems(text),
  public.mark_pickem_announced(bigint, text),
  public.resolvable_pickems(),
  public.unannounced_closed_seasons(),
  public.season_podium(bigint),
  public.mark_season_announced(bigint),
  public.ledger_drift(),
  public.betting_lifecycle_tick()
to service_role;
