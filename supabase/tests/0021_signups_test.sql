begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

select has_table('public', 'signups', 'signups exists');
select has_column('public', 'signups', 'season', 'season column exists');
select has_column('public', 'signups', 'player_status', 'player_status column exists');

-- Signup-window toggle (20260812000003): flag exists and the insert policy
-- is gated on it rather than being an unconditional `true`.
select has_column('public', 'league_settings', 'signups_open', 'signups_open column exists');
select ok(
  exists(
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'signups'
      and policyname = 'signups_public_insert'
      and with_check like '%signups_open%'
  ),
  'insert policy checks signups_open'
);

-- Open form: anon may insert but never read (signups carry Discord handles).
select ok(has_table_privilege('anon', 'public.signups', 'insert'), 'anon can insert signups');
select ok(not has_table_privilege('anon', 'public.signups', 'select'), 'anon cannot read signups');

-- RLS is on (authenticated reads still gate through the is_admin() policy).
select ok((select relrowsecurity from pg_class where oid = 'public.signups'::regclass), 'signups RLS enabled');

-- player_status is limited to the two form options.
prepare bad_status as
  insert into public.signups (season, discord, riot_id, opgg, current_rank, peak_rank, primary_role, player_status)
  values ('S5', 'someone', 'Name#TAG', 'https://op.gg/lol/summoners/na/Name-TAG', 'Diamond 2', 'Master', 'mid', 'veteran');
select throws_ok('bad_status', 23514, null, 'unknown player_status rejected');

-- Secondary role must differ from primary when present.
prepare dup_role as
  insert into public.signups (season, discord, riot_id, opgg, current_rank, peak_rank, primary_role, secondary_role, player_status)
  values ('S5', 'someone', 'Name#TAG', 'https://op.gg/lol/summoners/na/Name-TAG', 'Diamond 2', 'Master', 'jungle', 'jungle', 'new');
select throws_ok('dup_role', 23514, null, 'secondary role equal to primary rejected');

-- Junk-length input is bounded.
prepare short_opgg as
  insert into public.signups (season, discord, riot_id, opgg, current_rank, peak_rank, primary_role, player_status)
  values ('S5', 'someone', 'Name#TAG', 'x', 'Diamond 2', 'Master', 'mid', 'new');
select throws_ok('short_opgg', 23514, null, 'too-short opgg rejected');

-- A complete valid signup inserts.
select lives_ok(
  $$insert into public.signups (season, discord, riot_id, opgg, current_rank, peak_rank, primary_role, secondary_role, captain_interest, player_status)
    values ('S5', 'gratxace6488', 'GratxAce#NA1', 'https://op.gg/lol/summoners/na/GratxAce-NA1', 'Diamond 4', 'Diamond 1', 'adc', 'mid', false, 'returning')$$,
  'valid signup inserts'
);

select * from finish();
rollback;
