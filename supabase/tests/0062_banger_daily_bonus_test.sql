begin;
set local search_path = public, extensions;
select plan(7);

insert into auth.users (
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at
)
values (
  '00000000-0000-0000-0000-00000000ba62'::uuid,
  'authenticated',
  'authenticated',
  'banger-daily-0062@example.test',
  '',
  now(),
  now(),
  now()
);

insert into public.betting_profiles (discord_id, profile_id, username, balance)
values ('banger-daily-0062', '00000000-0000-0000-0000-00000000ba62'::uuid, 'Daily voter', 1000);

insert into public.banger_posts (id, body, published_at, x_url)
values ('banger-daily-0062', 'Regression fixture', now(), 'https://example.test/banger-daily-0062');

insert into public.daily_banger_checks (check_date, post_id, starts_at, ends_at)
values (
  timezone('utc', now())::date,
  'banger-daily-0062',
  date_trunc('day', timezone('utc', now())) at time zone 'utc',
  (date_trunc('day', timezone('utc', now())) + interval '1 day') at time zone 'utc'
);

select lives_ok(
  $$select public.vote_daily_banger(
    'banger-daily-0062',
    '00000000-0000-0000-0000-00000000ba62'::uuid,
    'banger-daily-0062',
    'banger'
  )$$,
  'daily banger vote transaction completes'
);

select is(
  (select vote from public.daily_banger_votes
   where check_date = timezone('utc', now())::date
     and voter_id = '00000000-0000-0000-0000-00000000ba62'::uuid),
  'banger',
  'daily banger vote is stored'
);

select is(
  (select balance from public.betting_profiles where discord_id = 'banger-daily-0062'),
  1200::bigint,
  'daily banger reward is credited to the wallet'
);

select is(
  (select delta from public.betting_ledger
   where discord_id = 'banger-daily-0062' and reason = 'daily_banger_vote'),
  200::bigint,
  'daily banger reward is ledgered'
);

select is(
  has_function_privilege('anon', 'public.vote_daily_banger(text,uuid,text,text)', 'execute'),
  false,
  'anonymous users cannot call the rewarded vote RPC directly'
);

select is(
  has_function_privilege('authenticated', 'public.vote_daily_banger(text,uuid,text,text)', 'execute'),
  false,
  'authenticated users cannot call the rewarded vote RPC directly'
);

select is(
  has_function_privilege('service_role', 'public.vote_daily_banger(text,uuid,text,text)', 'execute'),
  true,
  'service role can call the rewarded vote RPC'
);

select * from finish();
rollback;
