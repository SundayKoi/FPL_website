begin;
select plan(5);

select ok(to_regprocedure('public.vote_banger_post(text,uuid,text)') is not null, 'banger vote RPC exists');
select ok(position('auth.users' in pg_get_functiondef(to_regprocedure('public.vote_banger_post(text,uuid,text)'))) = 0, 'banger vote RPC does not query auth.users');
select ok(has_function_privilege('service_role', 'public.vote_banger_post(text,uuid,text)', 'EXECUTE'), 'service_role can execute banger vote RPC');
select ok(not has_function_privilege('anon', 'public.vote_banger_post(text,uuid,text)', 'EXECUTE'), 'anon cannot execute banger vote RPC');
select ok(not has_function_privilege('authenticated', 'public.vote_banger_post(text,uuid,text)', 'EXECUTE'), 'authenticated cannot execute banger vote RPC');

select * from finish();
rollback;
