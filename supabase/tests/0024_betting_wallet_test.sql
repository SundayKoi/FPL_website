-- Wallet + economy RPCs: signup bonus, daily streak, tip. Ported assertions
-- from c:\fpl_gambling\tests\test_signup_bonus.py and test_claim_daily.py,
-- restructured for pgTAP (the tip assertion is split across two statements
-- instead of packed into one row so evaluation order isn't left to chance).
begin;
select plan(6);

-- grant_signup_bonus: first call creates the wallet + credits once; the
-- repeat call is idempotent (no double credit) but still refreshes the
-- cached profile fields.
select grant_signup_bonus('d1', 'Alice', null, 1000);
select grant_signup_bonus('d1', 'Alice2', null, 1000);
select is((select balance from betting_profiles where discord_id='d1'), 1000::bigint, 'bonus once');
select is((select username from betting_profiles where discord_id='d1'), 'Alice2', 'profile refreshed');
select is((select sum(delta) from betting_ledger where discord_id='d1'), 1000::numeric, 'ledger matches');

-- claim_daily_streak: first-ever claim pays the base amount; claiming again
-- inside 24h is rejected.
select is((select amount from claim_daily_streak('d1', 250, 50, 7)), 250::bigint, 'first daily = base');
select throws_like('select claim_daily_streak(''d1'', 250, 50, 7)', '%already claimed%', 'no double daily');

-- tip_points: capture the RPC's own return value in one statement, then
-- assert it against the persisted balance in a separate statement — avoids
-- relying on target-list evaluation order within a single row.
select grant_signup_bonus('d2', 'Bob', null, 1000);
create temp table tip_result as select tip_points('d1', 'd2', 100) as sender_balance;
select is(
  (select sender_balance from tip_result),
  (select balance from betting_profiles where discord_id='d1'),
  'tip returns sender balance'
);

select * from finish();
rollback;
