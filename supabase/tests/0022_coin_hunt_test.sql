begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

select has_table('public', 'coin_finds', 'coin_finds exists');
select has_column('public', 'coin_finds', 'found_at', 'found_at column exists');

-- Claims must go through claim_coin(): no direct INSERT for either app role.
select ok(not has_table_privilege('anon', 'public.coin_finds', 'insert'), 'anon cannot insert coin_finds');
select ok(not has_table_privilege('authenticated', 'public.coin_finds', 'insert'), 'authenticated cannot insert coin_finds directly');

-- Reads are admin-gated behind RLS (finders learn placement from the RPC).
select ok((select relrowsecurity from pg_class where oid = 'public.coin_finds'::regclass), 'coin_finds RLS enabled');

select has_function('public', 'claim_coin', 'claim_coin() exists');
select ok(not has_function_privilege('anon', 'public.claim_coin()', 'execute'), 'anon cannot execute claim_coin');

select * from finish();
rollback;
