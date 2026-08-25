begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(40);
grant usage on schema tests to authenticated;

-- Schema contract.
select has_table('public', 'player_identity_links', 'player_identity_links exists');
select columns_are(
  'public', 'player_identity_links',
  array[
    'id','player_pool_id','profile_id','league_team_id','league','season',
    'status','source','requested_by','decided_by','requested_at','decided_at'
  ]
);
select has_function('public', 'is_approved_team_member', array['uuid','text']);
select has_function('public', 'is_player_rostered_on_team', array['uuid','uuid','text','text']);
select has_function('public', 'player_identity_state', array['uuid','text','text']);
select has_function('public', 'approve_card_claim', array['text','text','text']);

select col_is_fk('public', 'player_identity_links', 'player_pool_id', 'player_pool_id references the canonical pool');
select col_is_fk('public', 'player_identity_links', 'profile_id', 'profile_id references profiles');
select col_is_fk('public', 'player_identity_links', 'league_team_id', 'league_team_id references league_teams');
select col_is_fk('public', 'player_identity_links', 'requested_by', 'requested_by references profiles');
select col_is_fk('public', 'player_identity_links', 'decided_by', 'decided_by references profiles');
select col_is_fk('public', 'card_claims', 'player_pool_id', 'card claims optionally reference the canonical pool');
select ok(
  coalesce((
    select c.relrowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'player_identity_links'
  ), false),
  'player_identity_links has row-level security enabled'
);
select ok(
  coalesce((
    select not has_table_privilege('anon', c.oid, 'select')
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'player_identity_links'
  ), false),
  'anonymous callers have no direct access to identity rows'
);

-- Stable fixture IDs kept outside the normal fixture UUID range.
insert into public.profiles (id, display_name, is_admin) values
  (tests.admin_id(), 'Identity Admin', true),
  (tests.cap(1), 'Identity Claimant', false),
  (tests.cap(2), 'Identity Team Captain', false),
  (tests.cap(3), 'Identity Other Captain', false),
  (tests.cap(4), 'Identity Card Claimant', false),
  ('67000000-0000-0000-0000-000000000005', 'Identity Existing Owner', false)
on conflict (id) do update set is_admin = excluded.is_admin;

insert into public.drafts (id, name) values
  ('67000000-0000-0000-0000-000000000010', 'Identity Premier Draft'),
  ('67000000-0000-0000-0000-000000000011', 'Identity Academy Draft');

insert into public.league_teams (id, name, abbreviation) values
  ('67000000-0000-0000-0000-000000000020', 'Identity Alpha', 'IAX'),
  ('67000000-0000-0000-0000-000000000021', 'Identity Bravo', 'IBX'),
  ('67000000-0000-0000-0000-000000000022', 'Identity Academy', 'IAC');

insert into public.teams (
  id, draft_id, name, abbreviation, nomination_position, budget_start, points_remaining
) values
  ('67000000-0000-0000-0000-000000000030', '67000000-0000-0000-0000-000000000010', '  identity alpha  ', 'IAX', 1, 100, 100),
  ('67000000-0000-0000-0000-000000000031', '67000000-0000-0000-0000-000000000010', 'Identity Bravo', 'IBX', 2, 100, 100),
  ('67000000-0000-0000-0000-000000000032', '67000000-0000-0000-0000-000000000011', 'Identity Academy', 'IAC', 1, 100, 100);

update public.league_settings
set current_season = 'IDENTITY-S1',
    featured_draft_id = '67000000-0000-0000-0000-000000000010',
    academy_season = 'IDENTITY-A1',
    academy_draft_id = '67000000-0000-0000-0000-000000000011'
where id = 1;

insert into public.player_pool (
  id, season_key, normalized_name, display_name, role
) values
  ('67000000-0000-0000-0000-000000000040', 'identity', 'alpha-mid', 'Alpha Mid', 'mid'),
  ('67000000-0000-0000-0000-000000000041', 'identity', 'alpha-jungle', 'Alpha Jungle', 'jungle'),
  ('67000000-0000-0000-0000-000000000042', 'identity', 'bravo-adc', 'Bravo ADC', 'adc'),
  ('67000000-0000-0000-0000-000000000043', 'identity', 'academy-support', 'Academy Support', 'support');

insert into public.players (
  id, draft_id, display_name, role, team_id, price, acquisition, canonical_player_id
) values
  ('67000000-0000-0000-0000-000000000050', '67000000-0000-0000-0000-000000000010', 'Alpha Mid', 'mid', '67000000-0000-0000-0000-000000000030', 1, 'auction', '67000000-0000-0000-0000-000000000040'),
  ('67000000-0000-0000-0000-000000000051', '67000000-0000-0000-0000-000000000010', 'Alpha Jungle', 'jungle', '67000000-0000-0000-0000-000000000030', 1, 'auction', '67000000-0000-0000-0000-000000000041'),
  ('67000000-0000-0000-0000-000000000052', '67000000-0000-0000-0000-000000000010', 'Bravo ADC', 'adc', '67000000-0000-0000-0000-000000000031', 1, 'auction', '67000000-0000-0000-0000-000000000042'),
  ('67000000-0000-0000-0000-000000000053', '67000000-0000-0000-0000-000000000011', 'Academy Support', 'support', '67000000-0000-0000-0000-000000000032', 1, 'auction', '67000000-0000-0000-0000-000000000043');

insert into public.league_team_captains (league_team_id, season, profile_id) values
  ('67000000-0000-0000-0000-000000000020', 'IDENTITY-S1', tests.cap(2)),
  ('67000000-0000-0000-0000-000000000021', 'IDENTITY-S1', tests.cap(3));

insert into public.match_codes (
  id, season, team_a_id, team_b_id, game_number, code
) values (
  '67000000-0000-0000-0000-000000000060', 'IDENTITY-S1',
  '67000000-0000-0000-0000-000000000020',
  '67000000-0000-0000-0000-000000000021', 1, 'IDENTITY-CODE'
);

insert into public.riot_accounts (id, game_name, tag_line, display_name) values
  ('67000000-0000-0000-0000-000000000070', 'Exact Card', 'SYNC', 'Exact Card'),
  ('67000000-0000-0000-0000-000000000071', 'Forged Card', 'SYNC', 'Forged Card'),
  ('67000000-0000-0000-0000-000000000072', 'Conflict Card', 'SYNC', 'Conflict Card');

insert into public.roster_memberships (riot_account_id, season, league_team_id) values
  ('67000000-0000-0000-0000-000000000070', 'IDENTITY-S1', '67000000-0000-0000-0000-000000000020'),
  ('67000000-0000-0000-0000-000000000071', 'IDENTITY-S1', '67000000-0000-0000-0000-000000000021'),
  ('67000000-0000-0000-0000-000000000072', 'IDENTITY-S1', '67000000-0000-0000-0000-000000000021');

-- The public state helper exposes only the neutral state vocabulary.
set local role anon;
select is(
  public.player_identity_state('67000000-0000-0000-0000-000000000040', 'premier', 'IDENTITY-S1'),
  'unclaimed',
  'public identity state is unclaimed without exposing a profile'
);
reset role;

select ok(
  public.is_player_rostered_on_team(
    '67000000-0000-0000-0000-000000000040',
    '67000000-0000-0000-0000-000000000020',
    'premier',
    'IDENTITY-S1'
  ),
  'exact canonical player, active draft, normalized team, league, and season resolve'
);

-- A user can request and withdraw only their own pending, roster-compatible link.
select tests.acting_as(tests.cap(1));
set local role authenticated;
select lives_ok($request$
  insert into public.player_identity_links (
    player_pool_id, profile_id, league_team_id, league, season,
    status, source, requested_by
  ) values (
    '67000000-0000-0000-0000-000000000040', tests.cap(1),
    '67000000-0000-0000-0000-000000000020', 'premier', 'IDENTITY-S1',
    'pending', 'team', tests.cap(1)
  )
$request$, 'a user can insert their own exact pending team claim');
select is(
  (select status from public.player_identity_links
   where player_pool_id = '67000000-0000-0000-0000-000000000040'),
  'pending',
  'a user can read their own pending identity row'
);
reset role;

set local role anon;
select is(
  public.player_identity_state('67000000-0000-0000-0000-000000000040', 'premier', 'IDENTITY-S1'),
  'pending',
  'anonymous state reads reveal pending but no claimant identity'
);
reset role;

select tests.acting_as(tests.cap(4));
set local role authenticated;
select is(
  (select count(*) from public.player_identity_links
   where player_pool_id = '67000000-0000-0000-0000-000000000040'),
  0::bigint,
  'an unrelated user cannot read another claimant identity row'
);
select throws_ok($wrong_team$
  insert into public.player_identity_links (
    player_pool_id, profile_id, league_team_id, league, season,
    status, source, requested_by
  ) values (
    '67000000-0000-0000-0000-000000000041', tests.cap(4),
    '67000000-0000-0000-0000-000000000021', 'premier', 'IDENTITY-S1',
    'pending', 'team', tests.cap(4)
  )
$wrong_team$, '42501', null, 'a user cannot forge a claim under the wrong team');
reset role;

select tests.acting_as(tests.cap(1));
set local role authenticated;
delete from public.player_identity_links
where player_pool_id = '67000000-0000-0000-0000-000000000040';
select is(
  (select count(*) from public.player_identity_links
   where player_pool_id = '67000000-0000-0000-0000-000000000040'),
  0::bigint,
  'a user can withdraw their own pending claim'
);
insert into public.player_identity_links (
  player_pool_id, profile_id, league_team_id, league, season,
  status, source, requested_by
) values (
  '67000000-0000-0000-0000-000000000040', tests.cap(1),
  '67000000-0000-0000-0000-000000000020', 'premier', 'IDENTITY-S1',
  'pending', 'team', tests.cap(1)
);
reset role;

-- Captain decisions are team/season scoped and re-check the canonical roster.
-- Identity-defining fields are immutable for captains, and the decision audit
-- must identify the actual caller. Savepoints keep an unexpectedly-permitted
-- mutation from contaminating the following regression assertions.
select tests.acting_as(tests.cap(2));
set local role authenticated;
savepoint captain_profile_mutation;
select throws_like($profile_mutation$
  update public.player_identity_links
  set profile_id = tests.cap(4),
      status = 'approved',
      decided_by = tests.cap(2),
      decided_at = now()
  where player_pool_id = '67000000-0000-0000-0000-000000000040'
$profile_mutation$, 'IDENTITY_DECISION_IMMUTABLE%', 'a captain cannot rewrite the claimant profile while approving');
rollback to savepoint captain_profile_mutation;

savepoint captain_requester_mutation;
select throws_like($requester_mutation$
  update public.player_identity_links
  set requested_by = tests.cap(4),
      status = 'approved',
      decided_by = tests.cap(2),
      decided_at = now()
  where player_pool_id = '67000000-0000-0000-0000-000000000040'
$requester_mutation$, 'IDENTITY_DECISION_IMMUTABLE%', 'a captain cannot rewrite the requester while approving');
rollback to savepoint captain_requester_mutation;

savepoint captain_source_mutation;
select throws_like($source_mutation$
  update public.player_identity_links
  set source = 'admin',
      status = 'approved',
      decided_by = tests.cap(2),
      decided_at = now()
  where player_pool_id = '67000000-0000-0000-0000-000000000040'
$source_mutation$, 'IDENTITY_DECISION_IMMUTABLE%', 'a captain cannot rewrite the claim source while approving');
rollback to savepoint captain_source_mutation;

savepoint captain_decider_forgery;
select throws_like($decider_forgery$
  update public.player_identity_links
  set status = 'approved',
      decided_by = tests.cap(3),
      decided_at = now()
  where player_pool_id = '67000000-0000-0000-0000-000000000040'
$decider_forgery$, 'IDENTITY_DECIDER_MISMATCH%', 'a captain cannot forge the approving profile');
rollback to savepoint captain_decider_forgery;
reset role;

select tests.acting_as(tests.cap(2));
set local role authenticated;
delete from public.player_identity_links
where player_pool_id = '67000000-0000-0000-0000-000000000040';
reset role;
select is(
  (select count(*) from public.player_identity_links
   where player_pool_id = '67000000-0000-0000-0000-000000000040'),
  0::bigint,
  'the exact team captain can reject a pending identity claim'
);

select tests.acting_as(tests.cap(1));
set local role authenticated;
insert into public.player_identity_links (
  player_pool_id, profile_id, league_team_id, league, season,
  status, source, requested_by
) values (
  '67000000-0000-0000-0000-000000000040', tests.cap(1),
  '67000000-0000-0000-0000-000000000020', 'premier', 'IDENTITY-S1',
  'pending', 'team', tests.cap(1)
);
reset role;

select tests.acting_as(tests.cap(3));
set local role authenticated;
update public.player_identity_links
set status = 'approved', decided_by = tests.cap(3), decided_at = now()
where player_pool_id = '67000000-0000-0000-0000-000000000040';
reset role;
select is(
  (select status from public.player_identity_links
   where player_pool_id = '67000000-0000-0000-0000-000000000040'),
  'pending',
  'a captain cannot approve a claim for another team'
);

select tests.acting_as(tests.cap(2));
set local role authenticated;
select results_eq($approve$
  update public.player_identity_links
  set status = 'approved', decided_by = tests.cap(2), decided_at = now()
  where player_pool_id = '67000000-0000-0000-0000-000000000040'
  returning status
$approve$, $$ values ('approved'::text) $$, 'the exact team captain can approve the claim');
reset role;

select tests.acting_as(tests.cap(1));
set local role authenticated;
select is(
  (select code from public.match_codes
   where id = '67000000-0000-0000-0000-000000000060'),
  'IDENTITY-CODE',
  'an approved team member can read their own fixture code'
);
reset role;

select tests.acting_as(tests.cap(4));
set local role authenticated;
select is(
  (select count(*) from public.match_codes
   where id = '67000000-0000-0000-0000-000000000060'),
  0::bigint,
  'an unrelated signed-in user cannot read another team fixture code'
);
reset role;

select throws_ok($duplicate_player$
  insert into public.player_identity_links (
    player_pool_id, profile_id, league_team_id, league, season,
    status, source, requested_by, decided_by, decided_at
  ) values (
    '67000000-0000-0000-0000-000000000040',
    '67000000-0000-0000-0000-000000000005',
    '67000000-0000-0000-0000-000000000020', 'premier', 'IDENTITY-S1',
    'approved', 'admin', tests.admin_id(), tests.admin_id(), now()
  )
$duplicate_player$, '23505', null, 'one canonical player has at most one identity per league and season');

select throws_ok($duplicate_profile$
  insert into public.player_identity_links (
    player_pool_id, profile_id, league_team_id, league, season,
    status, source, requested_by, decided_by, decided_at
  ) values (
    '67000000-0000-0000-0000-000000000041', tests.cap(1),
    '67000000-0000-0000-0000-000000000020', 'premier', 'IDENTITY-S1',
    'approved', 'admin', tests.admin_id(), tests.admin_id(), now()
  )
$duplicate_profile$, '23505', null, 'one profile has at most one identity per league and season');

select tests.acting_as(tests.cap(1));
set local role authenticated;
delete from public.player_identity_links
where player_pool_id = '67000000-0000-0000-0000-000000000040';
reset role;
select is(
  (select count(*) from public.player_identity_links
   where player_pool_id = '67000000-0000-0000-0000-000000000040'),
  1::bigint,
  'a user cannot withdraw their own identity after approval'
);

select tests.acting_as(tests.cap(2));
set local role authenticated;
delete from public.player_identity_links
where player_pool_id = '67000000-0000-0000-0000-000000000040';
reset role;
select is(
  (select count(*) from public.player_identity_links
   where player_pool_id = '67000000-0000-0000-0000-000000000040'),
  1::bigint,
  'a captain cannot revoke an approved identity link'
);

select tests.acting_as(tests.admin_id());
set local role authenticated;
delete from public.player_identity_links
where player_pool_id = '67000000-0000-0000-0000-000000000040';
reset role;
select tests.acting_as(tests.cap(1));
set local role authenticated;
select ok(
  not public.is_approved_team_member(
    '67000000-0000-0000-0000-000000000020', 'IDENTITY-S1'
  ),
  'admin revocation removes member access immediately'
);
reset role;

select tests.acting_as(tests.admin_id());
set local role authenticated;
select lives_ok($admin_assignment$
  do $body$
  begin
    insert into public.player_identity_links (
      player_pool_id, profile_id, league_team_id, league, season,
      status, source, requested_by, decided_by, decided_at
    ) values (
      '67000000-0000-0000-0000-000000000040', tests.cap(1),
      '67000000-0000-0000-0000-000000000020', 'premier', 'IDENTITY-S1',
      'approved', 'admin', tests.admin_id(), tests.admin_id(), now()
    );
    delete from public.player_identity_links
    where player_pool_id = '67000000-0000-0000-0000-000000000040';
    if found then
      return;
    end if;
    raise exception 'admin revocation did not delete the assignment';
  end
  $body$
$admin_assignment$, 'an admin can assign and revoke an identity');
reset role;

-- Card approval synchronizes only an exact, non-conflicting canonical link.
insert into public.card_claims (
  season, summoner_name, tag, profile_id, player_pool_id
) values (
  'IDENTITY-S1', 'Exact Card', 'SYNC', tests.cap(4),
  '67000000-0000-0000-0000-000000000041'
);
select tests.acting_as(tests.cap(2));
set local role authenticated;
select public.approve_card_claim('IDENTITY-S1', 'Exact Card', 'SYNC');
reset role;
select ok(
  (select status = 'approved' from public.card_claims
   where season = 'IDENTITY-S1' and summoner_name = 'Exact Card' and tag = 'SYNC')
  and exists (
    select 1 from public.player_identity_links
    where player_pool_id = '67000000-0000-0000-0000-000000000041'
      and profile_id = tests.cap(4)
      and league_team_id = '67000000-0000-0000-0000-000000000020'
      and league = 'premier' and season = 'IDENTITY-S1'
      and status = 'approved' and source = 'card'
  ),
  'card approval and its exact compatible identity link are committed together'
);

create or replace function tests.forged_card_mapping_rolls_back() returns boolean
language plpgsql
as $test$
begin
  perform tests.acting_as(tests.cap(3));
  perform public.approve_card_claim('IDENTITY-S1', 'Forged Card', 'SYNC');
  return false;
exception when others then
  return sqlerrm = 'CARD_IDENTITY_MISMATCH' and (
    select status = 'pending' and decided_by is null and decided_at is null
    from public.card_claims
    where season = 'IDENTITY-S1' and summoner_name = 'Forged Card' and tag = 'SYNC'
  ) and not exists (
    select 1 from public.player_identity_links
    where profile_id = tests.cap(1) and league = 'premier' and season = 'IDENTITY-S1'
  );
end
$test$;

insert into public.card_claims (
  season, summoner_name, tag, profile_id, player_pool_id
) values (
  'IDENTITY-S1', 'Forged Card', 'SYNC', tests.cap(1),
  '67000000-0000-0000-0000-000000000040'
);
select ok(
  tests.forged_card_mapping_rolls_back(),
  'a forged player-to-team card mapping rolls back the whole approval RPC'
);

insert into public.player_identity_links (
  player_pool_id, profile_id, league_team_id, league, season,
  status, source, requested_by, decided_by, decided_at
) values (
  '67000000-0000-0000-0000-000000000042',
  '67000000-0000-0000-0000-000000000005',
  '67000000-0000-0000-0000-000000000021', 'premier', 'IDENTITY-S1',
  'approved', 'admin', tests.admin_id(), tests.admin_id(), now()
);
insert into public.card_claims (
  season, summoner_name, tag, profile_id, player_pool_id
) values (
  'IDENTITY-S1', 'Conflict Card', 'SYNC', tests.cap(1),
  '67000000-0000-0000-0000-000000000042'
);

create or replace function tests.conflicting_card_mapping_rolls_back() returns boolean
language plpgsql
as $test$
begin
  perform tests.acting_as(tests.cap(3));
  perform public.approve_card_claim('IDENTITY-S1', 'Conflict Card', 'SYNC');
  return false;
exception when others then
  return sqlerrm = 'PLAYER_IDENTITY_CONFLICT' and (
    select status = 'pending' and decided_by is null and decided_at is null
    from public.card_claims
    where season = 'IDENTITY-S1' and summoner_name = 'Conflict Card' and tag = 'SYNC'
  ) and exists (
    select 1 from public.player_identity_links
    where player_pool_id = '67000000-0000-0000-0000-000000000042'
      and profile_id = '67000000-0000-0000-0000-000000000005'
      and status = 'approved'
  );
end
$test$;

select ok(
  tests.conflicting_card_mapping_rolls_back(),
  'a conflicting identity owner rolls back the whole card approval RPC'
);

select * from finish();
rollback;
