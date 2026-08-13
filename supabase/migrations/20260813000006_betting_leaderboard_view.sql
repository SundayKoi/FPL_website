-- Betting integration: public leaderboard view. Ports the profit/wins/streak
-- logic from c:\fpl_gambling\api\stats.py (PROFIT_REASONS, player_stats,
-- leaderboard_badges) and the ranking behavior from
-- c:\fpl_gambling\api\routes_extra.py's GET /leaderboard as a single view
-- with one row per bettor; the page does `order by balance` or
-- `order by profit` itself (matches the source's `by` query param, a client
-- ORDER BY choice rather than two separate views).
--
-- PROFIT_REASONS: ledger reasons that net into "profit" — every bet and
-- pick'em card, including cashouts and refunds; excludes coinflip/daily/tip/
-- signup grants (this repo never ported coinflip/duels/blackjack at all, so
-- the source list's duel_*/bj_*/flip entries are dropped outright rather
-- than kept-but-unreachable):
--   bet_place, bet_payout, cashout, refund,
--   pickem_place, pickem_payout, pickem_refund, pickem_cancel
-- Task 4 found the real RPCs never *write* a 'pickem_cancel' ledger row
-- (cancel_pickem_admin's refunds use reason 'pickem_refund'; 'pickem_cancel'
-- is only an admin_audit action name) — kept in the list anyway for parity
-- with the source stats.py list; summing a reason nothing ever writes is a
-- harmless no-op.
--
-- wins/losses: settled betting_bets where payout <> amount (a refund pays
-- back exactly the stake — neither win nor loss); a "win" is payout > amount.
-- current_streak: trailing run of wins in chronological (created_at, id)
-- order — computed with a gaps-and-islands window function walking each
-- bettor's graded bets most-recent-first and stopping at the first loss.
-- perfect_pickems: count of the bettor's RESOLVED pick'em cards that paid
-- out (payout > 0 and correct is not null) — matches
-- leaderboard_badges/player_stats exactly.
--
-- Grants: views do not inherit table grants in Postgres, so this view gets
-- its own explicit `grant select ... to anon, authenticated;` (public
-- leaderboard data — same read exposure betting_profiles already has).

create or replace view public.betting_leaderboard as
with profit as (
  select discord_id, coalesce(sum(delta), 0)::bigint as profit
  from public.betting_ledger
  where reason = any(array[
    'bet_place', 'bet_payout', 'cashout', 'refund',
    'pickem_place', 'pickem_payout', 'pickem_refund', 'pickem_cancel'
  ])
  group by discord_id
),
graded_bets as (
  select discord_id, created_at, id, (payout - amount) > 0 as won
  from public.betting_bets
  where settled and payout <> amount
),
win_loss as (
  select discord_id,
    count(*) filter (where won) as wins,
    count(*) filter (where not won) as losses
  from graded_bets
  group by discord_id
),
ranked_desc as (
  select discord_id, won,
    row_number() over (partition by discord_id order by created_at desc, id desc) as rn
  from graded_bets
),
streak_groups as (
  -- cumulative count of losses seen so far, walking most-recent-first; the
  -- trailing run of wins is exactly the rows before the first loss (grp = 0)
  select discord_id, won,
    sum(case when won then 0 else 1 end) over (partition by discord_id order by rn) as grp
  from ranked_desc
),
cur_streak as (
  select discord_id, count(*) as current_streak
  from streak_groups
  where grp = 0 and won
  group by discord_id
),
perfect as (
  select c.discord_id, count(*) as perfect_pickems
  from public.betting_pickem_cards c
  join public.betting_pickems p on p.id = c.pickem_id
  where p.status = 'RESOLVED' and c.payout > 0 and c.correct is not null
  group by c.discord_id
)
select
  u.discord_id,
  u.username,
  u.avatar_url,
  u.balance,
  coalesce(pr.profit, 0) as profit,
  coalesce(wl.wins, 0) as wins,
  coalesce(wl.losses, 0) as losses,
  coalesce(cs.current_streak, 0) as current_streak,
  coalesce(pf.perfect_pickems, 0) as perfect_pickems
from public.betting_profiles u
left join profit pr on pr.discord_id = u.discord_id
left join win_loss wl on wl.discord_id = u.discord_id
left join cur_streak cs on cs.discord_id = u.discord_id
left join perfect pf on pf.discord_id = u.discord_id;

grant select on public.betting_leaderboard to anon, authenticated;
