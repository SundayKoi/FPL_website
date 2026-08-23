-- admin_grant: staff-issued balance corrections. Ported assertions from
-- c:\fpl_gambling\tests\test_admin.py's grant coverage, restructured for
-- pgTAP (same local-factory convention as 0025/0026).
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_betting_fixtures.sql.inc

select plan(14);

create temp table act as select test_profile(0) as actor;

-- ==== a positive grant credits the balance + writes a ledger row ============

create temp table s1 as select test_profile(500) as u;
select is(
  (select admin_grant((select actor from act), (select u from s1), 250, 'tournament prize')),
  750::bigint, 'admin_grant returns the new balance'
);
select is((select balance from betting_profiles where discord_id=(select u from s1)), 750::bigint, 'balance credited');
select is(
  (select delta from betting_ledger where discord_id=(select u from s1) and reason='admin_grant'),
  250::bigint, 'ledger row reason=admin_grant with the delta'
);

-- ==== a negative delta deducts ================================================

create temp table s2 as select test_profile(500) as u;
select is(
  (select admin_grant((select actor from act), (select u from s2), -200, 'correcting a bug')),
  300::bigint, 'negative delta deducts'
);
select is((select balance from betting_profiles where discord_id=(select u from s2)), 300::bigint, 'balance deducted');

-- ==== a deduct that would go below zero is refused, no partial write ========

create temp table s3 as select test_profile(100) as u;
select throws_like(
  format('select admin_grant(%L, %L, -500, %L)', (select actor from act), (select u from s3), 'too much'),
  '%grant would make balance negative%',
  'refuses a grant that would go negative'
);
select is((select balance from betting_profiles where discord_id=(select u from s3)), 100::bigint, 'balance unchanged after the refused grant');
-- s3's factory seeds one 'seed'-reason ledger row (p_balance=100 <> 0) —
-- assert no *admin_grant* row was added on top of it, not that the ledger
-- is empty.
select is(
  (select count(*) from betting_ledger where discord_id=(select u from s3) and reason='admin_grant'),
  0::bigint, 'no admin_grant ledger row written for the refused grant'
);

-- ==== other guards ============================================================

select throws_like('select admin_grant('''||(select actor from act)||''', '''||(select u from s1)||''', 0, ''zero'')', '%non-zero%', 'rejects a zero amount');
select throws_like('select admin_grant('''||(select actor from act)||''', ''nobody-here'', 100, ''x'')', '%unknown user%', 'rejects an unknown target');

-- ==== invariant: sum(ledger.delta) = balance for every wallet touched above =

select is(
  (select count(*) from betting_profiles p
     where p.discord_id in ((select u from s1), (select u from s2), (select u from s3), (select actor from act))
       and p.balance <> coalesce((select sum(delta) from betting_ledger l where l.discord_id = p.discord_id), 0)),
  0::bigint,
  'ledger invariant holds for every wallet touched'
);

-- ==== privilege checks: service_role only ====================================

select is(has_function_privilege('anon', 'public.admin_grant(text,text,bigint,text)', 'execute'), false, 'anon cannot execute admin_grant');
select is(has_function_privilege('authenticated', 'public.admin_grant(text,text,bigint,text)', 'execute'), false, 'authenticated cannot execute admin_grant');
select is(has_function_privilege('service_role', 'public.admin_grant(text,text,bigint,text)', 'execute'), true, 'service_role can execute admin_grant');

select * from finish();
rollback;
