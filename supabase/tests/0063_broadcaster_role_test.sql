begin;

select plan(7);

select has_column('public', 'profiles', 'is_broadcaster', 'profiles has a broadcaster role flag');
select has_function('public', 'is_broadcaster', 'is_broadcaster() exists');
select has_function('public', 'set_profile_broadcaster', 'owner broadcaster assignment RPC exists');

select ok(
  has_function_privilege('authenticated', 'public.set_profile_broadcaster(uuid,boolean)', 'execute'),
  'authenticated callers can reach the owner-guarded broadcaster RPC'
);
select ok(
  not has_function_privilege('anon', 'public.set_profile_broadcaster(uuid,boolean)', 'execute'),
  'anonymous callers cannot assign broadcasters'
);

select ok(
  (
    select coalesce(pg_get_expr(polqual, polrelid), '') || coalesce(pg_get_expr(polwithcheck, polrelid), '')
      from pg_policy
     where polrelid = 'public.homepage_featured_settings'::regclass
       and polname = 'homepage_featured_settings_owner_or_admin_write'
  ) like '%is_broadcaster%'
  or (
    select count(*)
      from pg_policy
     where polrelid = 'public.homepage_featured_settings'::regclass
       and polname = 'homepage_featured_settings_broadcaster_write'
  ) = 1,
  'homepage featured settings allow the broadcaster role'
);

select ok(
  not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'profiles'
       and policyname = 'broadcaster_write'
  ),
  'broadcasters do not receive direct profile write access'
);

select * from finish();
rollback;
