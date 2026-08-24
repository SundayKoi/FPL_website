-- Weekly bonus RPCs: claim_weekly_streak + weekly_next_at. Mirrors the daily
-- coverage in 0024_betting_wallet_test.sql, plus the streak arithmetic the
-- daily test can't reach (its clock can't move): backdating last_weekly
-- simulates the passage of weeks, so increment, cap, and reset-after-gap all
-- get real assertions. Tuning mirrors the handler: base 1000, step 250, max 4.
begin;
select plan(11);

select grant_signup_bonus('w1', 'Wendy', null, 1000);

-- Never claimed: no cooldown to report.
select is((select weekly_next_at('w1')), null, 'next_at null before first claim');

-- First claim pays the base; a second inside 7 days is rejected.
select is((select amount from claim_weekly_streak('w1', 1000, 250, 4)), 1000::bigint, 'first weekly = base');
select throws_like('select claim_weekly_streak(''w1'', 1000, 250, 4)', '%already claimed%', 'no double weekly');
select is(
  (select weekly_next_at('w1')),
  (select last_weekly + interval '7 days' from betting_profiles where discord_id='w1'),
  'next_at = last claim + 7 days'
);

-- Claimed 8 days ago (within the 14-day grace): streak advances.
update betting_profiles set last_weekly = now() - interval '8 days' where discord_id='w1';
create temp table wk2 as select * from claim_weekly_streak('w1', 1000, 250, 4);
select is((select streak from wk2), 2, 'consecutive week increments streak');
select is((select amount from wk2), 1250::bigint, 'week 2 pays base + step');

-- At the cap the streak holds and the payout stays maxed.
update betting_profiles set last_weekly = now() - interval '8 days', weekly_streak = 4 where discord_id='w1';
create temp table wk_cap as select * from claim_weekly_streak('w1', 1000, 250, 4);
select is((select streak from wk_cap), 4, 'streak capped at p_max');
select is((select amount from wk_cap), 1750::bigint, 'capped payout = base + step * (max-1)');

-- A gap past 14 days breaks the streak back to 1.
update betting_profiles set last_weekly = now() - interval '20 days' where discord_id='w1';
create temp table wk_reset as select * from claim_weekly_streak('w1', 1000, 250, 4);
select is((select streak from wk_reset), 1, 'gap over 14 days resets streak');
select is((select amount from wk_reset), 1000::bigint, 'reset claim pays base');

-- Every successful claim landed one 'weekly' ledger row.
select is((select count(*) from betting_ledger where discord_id='w1' and reason='weekly'), 4::bigint, 'one ledger row per claim');

select * from finish();
rollback;
