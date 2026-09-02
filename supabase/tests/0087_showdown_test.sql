-- Showdown: the tables, the two wallet doors, the card lock, and the one
-- invariant Postgres checks on every commit — chips are conserved.

begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
\ir helpers/_betting_fixtures.sql.inc
select plan(30);

-- === fixtures ================================================================
create or replace function mk_card(p_owner text, p_overall int) returns bigint
language sql as $$
  insert into public.card_inventory
    (discord_id, season, slug, player_name, role, edition_week, overall, tier, foil, card)
  values (p_owner, 'S_TEST_SD', 'sd-' || substr(md5(random()::text), 1, 8), 'Someone', 'Mid', '2026-08-24', p_overall, 'gold', false, '{}'::jsonb)
  returning id;
$$;

create or replace function mk_stack(p_owner text, p_overall int) returns bigint[]
language sql as $$
  select array_agg(mk_card(p_owner, p_overall)) from generate_series(1, 10);
$$;

select test_profile(3000) as alice \gset
select test_profile(3000) as bob \gset
select test_profile(100) as poor \gset

insert into public.showdown_tables (bracket, season, name) values ('open', 'S_TEST_SD', 'Test felt')
  returning id as t \gset

-- === shape ===================================================================
select has_table('public', 'showdown_tables', 'tables exist');
select has_table('public', 'showdown_secrets', 'secrets exist');
select has_table('public', 'showdown_seats', 'seats exist');
select has_table('public', 'showdown_seated_cards', 'seated cards exist');
select has_table('public', 'showdown_hands', 'hand history exists');
select has_table('public', 'showdown_rake', 'the burn exists');

select is((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'showdown_secrets'),
  0, 'nothing opens the secrets to a player');
select ok(not has_table_privilege('anon', 'public.showdown_secrets', 'SELECT'), 'anon cannot read the secrets');
select ok(has_table_privilege('anon', 'public.showdown_tables', 'SELECT'), 'anyone can read the public table state');
select ok(has_table_privilege('authenticated', 'public.showdown_seats', 'SELECT'), 'anyone can read the seats');
select is((select count(*)::int from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'showdown_tables'),
  1, 'the public table state is in the realtime publication');
select is((select count(*)::int from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'showdown_secrets'),
  0, 'the secrets are not');

select is((select stack_cap from public.showdown_brackets where key = 'open'), 720, 'the open cap is seeded');

select ok(not has_function_privilege('authenticated', 'public.showdown_sit(bigint, text, int, bigint, bigint[], boolean)', 'execute'),
  'a player cannot call showdown_sit directly');
select ok(has_function_privilege('service_role', 'public.showdown_commit(bigint, bigint, text, int, jsonb, jsonb, jsonb, bigint, jsonb, timestamptz)', 'execute'),
  'the service role can commit');

-- === sitting down ============================================================
select mk_stack(:'alice', 72) as alice_stack \gset
select mk_stack(:'bob', 60) as bob_stack \gset

select throws_ok(
  format($q$ select showdown_sit(%s, %L, 0, 500, %L::bigint[], false) $q$, :t, :'alice', :'alice_stack'),
  'buy-in must be between 1000 and 5000', 'a buy-in under the bracket is refused');

select throws_ok(
  format($q$ select showdown_sit(%s, %L, 0, 1000, %L::bigint[], false) $q$, :t, :'poor', :'alice_stack'),
  'stack has cards you do not own', 'a stack of someone else''s cards is refused');

select mk_stack(:'bob', 80) as heavy \gset
select throws_ok(
  format($q$ select showdown_sit(%s, %L, 1, 1000, %L::bigint[], false) $q$, :t, :'bob', :'heavy'),
  'stack totals 800 overall; the cap is 720', 'a stack over the cap is refused');

select lives_ok(
  format($q$ select showdown_sit(%s, %L, 0, 1000, %L::bigint[], false) $q$, :t, :'alice', :'alice_stack'),
  'alice sits with a stack under the cap');
select is((select balance from betting_profiles where discord_id = :'alice'), 2000::bigint, 'the buy-in left her wallet');
select is((select delta from betting_ledger where discord_id = :'alice' and reason = 'showdown_buy_in'), -1000::bigint, 'and the ledger says so');
select is((select chips from showdown_seats where discord_id = :'alice'), 1000::bigint, 'her chips are on the table');
select is((select count(*)::int from showdown_seated_cards where discord_id = :'alice'), 10, 'her ten cards are seated');

select throws_ok(
  format($q$ select showdown_sit(%s, %L, 1, 1000, %L::bigint[], false) $q$, :t, :'alice', :'alice_stack'),
  'already seated', 'one table at a time');

select throws_ok(
  format($q$ select showdown_sit(%s, %L, 1, 200, '{}'::bigint[], true) $q$, :t, :'poor', :'alice_stack'),
  'buy-in must be between 1000 and 5000', 'a house stack still needs a real buy-in');

select lives_ok(
  format($q$ select showdown_sit(%s, %L, 1, 1000, '{}'::bigint[], true) $q$, :t, :'bob'),
  'bob sits with a house stack');

-- === the lock ================================================================
select throws_ok(
  format($q$ delete from card_inventory where id = (%L::bigint[])[1] $q$, :'alice_stack'),
  'card is at a table', 'a seated card cannot be dusted');
select throws_ok(
  format($q$ update card_inventory set discord_id = %L where id = (%L::bigint[])[2] $q$, :'bob', :'alice_stack'),
  'card is at a table', 'a seated card cannot change hands');

-- === the commit ==============================================================
select throws_ok(
  format($q$ select showdown_commit(%s, 0, 'hand', 1, '{"hand":{"pot":0}}', '{}', '[]', 0, null, null) $q$, :t),
  'stale table version', 'a commit against an old version is refused');

select version as v from showdown_tables where id = :t \gset

-- Alice posts 50, Bob posts 25: seats drop, pot rises, nothing lost.
select lives_ok(
  format($q$ select showdown_commit(%s, %s, 'hand', 1, '{"hand":{"pot":75}}', '{"deck":[]}',
    '[{"seat_no":0,"chips":950,"status":"active","timeouts":0},{"seat_no":1,"chips":975,"status":"active","timeouts":0}]',
    0, null, now() + interval '45 seconds') $q$, :t, :v),
  'a balanced commit is accepted');

select version as v2 from showdown_tables where id = :t \gset

-- Now a hand that would pay out more than the pot: refused, with the sums.
select throws_like(
  format($q$ select showdown_commit(%s, %s, 'waiting', 1, '{"hand":null}', '{}',
    '[{"seat_no":0,"chips":1100,"status":"active","timeouts":0},{"seat_no":1,"chips":975,"status":"active","timeouts":0}]',
    0, null, null) $q$, :t, :v2),
  'chips do not balance%', 'a commit that mints chips is refused');

-- Alice wins the 75 pot; 2 is raked and burned; a history row is written.
select lives_ok(
  format($q$ select showdown_commit(%s, %s, 'waiting', 1, '{"hand":null}', '{}',
    '[{"seat_no":0,"chips":1023,"status":"active","timeouts":0},{"seat_no":1,"chips":975,"status":"active","timeouts":0}]',
    2, '{"pot":75,"winners":[0]}', null) $q$, :t, :v2),
  'a settled hand with rake balances');

select * from finish();
rollback;
