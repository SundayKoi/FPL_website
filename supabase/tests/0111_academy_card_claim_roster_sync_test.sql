begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(9);

select has_function(
  'public',
  'sync_approved_academy_card_claim_identities',
  array[]::text[],
  'the Academy card-claim roster sync helper exists'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.sync_approved_academy_card_claim_identities()',
    'execute'
  ),
  'only the service role can execute the Academy card-claim roster sync'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.sync_approved_academy_card_claim_identities()',
    'execute'
  ),
  'authenticated callers cannot execute the Academy card-claim roster sync'
);

insert into public.profiles (id, display_name, is_admin) values
  (tests.admin_id(), 'Academy Sync Admin', true),
  (tests.cap(1), 'Exact Claimant', false),
  (tests.cap(2), 'Doki Claimant', false),
  (tests.cap(3), 'Existing Owner', false),
  (tests.cap(4), 'Conflict Claimant', false)
on conflict (id) do update set is_admin = excluded.is_admin;

insert into public.drafts (id, name)
values ('11000000-0000-0000-0000-000000000010', 'Academy Card Claim Sync Draft');

insert into public.league_settings (id, academy_draft_id, academy_season)
values (1, '11000000-0000-0000-0000-000000000010', 'TEST-ACADEMY-CARD')
on conflict (id) do update
set academy_draft_id = excluded.academy_draft_id,
    academy_season = excluded.academy_season;

insert into public.league_teams (id, name, abbreviation) values
  ('11000000-0000-0000-0000-000000000020', 'Exact Academy Team', 'EAT'),
  ('11000000-0000-0000-0000-000000000021', 'Doki Academy Team', 'DAT'),
  ('11000000-0000-0000-0000-000000000022', 'Ambiguous Academy A', 'AAA'),
  ('11000000-0000-0000-0000-000000000023', 'Ambiguous Academy B', 'AAB'),
  ('11000000-0000-0000-0000-000000000024', 'Conflict Academy Team', 'CAT');

insert into public.teams (
  id, draft_id, name, abbreviation, nomination_position, budget_start, points_remaining
) values
  ('11000000-0000-0000-0000-000000000030', '11000000-0000-0000-0000-000000000010', 'Exact Academy Team', 'EAT', 1, 100, 100),
  ('11000000-0000-0000-0000-000000000031', '11000000-0000-0000-0000-000000000010', 'Doki Academy Team', 'DAT', 2, 100, 100),
  ('11000000-0000-0000-0000-000000000032', '11000000-0000-0000-0000-000000000010', 'Ambiguous Academy A', 'AAA', 3, 100, 100),
  ('11000000-0000-0000-0000-000000000033', '11000000-0000-0000-0000-000000000010', 'Ambiguous Academy B', 'AAB', 4, 100, 100),
  ('11000000-0000-0000-0000-000000000034', '11000000-0000-0000-0000-000000000010', 'Conflict Academy Team', 'CAT', 5, 100, 100);

insert into public.player_pool (
  id, season_key, normalized_name, display_name, role
) values
  ('11000000-0000-0000-0000-000000000040', 'test-academy-card-sync', 'exact academy', 'Exact Academy', 'top'),
  ('11000000-0000-0000-0000-000000000041', 'test-academy-card-sync', 'dokiftw', 'dokiftw', 'jungle'),
  ('11000000-0000-0000-0000-000000000042', 'test-academy-card-sync', 'ambiguous-one', 'Ambiguous One', 'mid'),
  ('11000000-0000-0000-0000-000000000043', 'test-academy-card-sync', 'ambiguous-two', 'Ambiguous Two', 'mid'),
  ('11000000-0000-0000-0000-000000000044', 'test-academy-card-sync', 'conflict academy', 'Conflict Academy', 'adc');

insert into public.players (
  id, draft_id, display_name, role, team_id, price, acquisition, canonical_player_id
) values
  ('11000000-0000-0000-0000-000000000050', '11000000-0000-0000-0000-000000000010', 'Exact Academy', 'top', '11000000-0000-0000-0000-000000000030', 1, 'auction', '11000000-0000-0000-0000-000000000040'),
  ('11000000-0000-0000-0000-000000000051', '11000000-0000-0000-0000-000000000010', 'dokiftw', 'jungle', '11000000-0000-0000-0000-000000000031', 1, 'auction', '11000000-0000-0000-0000-000000000041'),
  ('11000000-0000-0000-0000-000000000052', '11000000-0000-0000-0000-000000000010', 'Ambiguous Academy', 'mid', '11000000-0000-0000-0000-000000000032', 1, 'auction', '11000000-0000-0000-0000-000000000042'),
  ('11000000-0000-0000-0000-000000000053', '11000000-0000-0000-0000-000000000010', 'Ambiguous Academy', 'mid', '11000000-0000-0000-0000-000000000033', 1, 'auction', '11000000-0000-0000-0000-000000000043'),
  ('11000000-0000-0000-0000-000000000054', '11000000-0000-0000-0000-000000000010', 'Conflict Academy', 'adc', '11000000-0000-0000-0000-000000000034', 1, 'auction', '11000000-0000-0000-0000-000000000044');

insert into public.player_identity_links (
  player_pool_id, profile_id, league_team_id, league, season,
  status, source, requested_by, decided_by, decided_at
) values (
  '11000000-0000-0000-0000-000000000044', tests.cap(3),
  '11000000-0000-0000-0000-000000000024', 'academy', 'TEST-ACADEMY-CARD',
  'approved', 'admin', tests.admin_id(), tests.admin_id(), now()
);

insert into public.card_claims (
  season, summoner_name, tag, profile_id, status, decided_by, decided_at
) values
  ('TEST-ACADEMY-CARD', 'Exact Academy', 'EXACT', tests.cap(1), 'approved', tests.admin_id(), now()),
  ('TEST-ACADEMY-CARD', 'Doki', '0001', tests.cap(2), 'approved', tests.admin_id(), now()),
  ('TEST-ACADEMY-CARD', 'Ambiguous Academy', 'DUPE', tests.cap(4), 'approved', tests.admin_id(), now()),
  ('TEST-ACADEMY-CARD', 'Conflict Academy', 'CONFLICT', tests.cap(4), 'approved', tests.admin_id(), now());

select is(
  public.sync_approved_academy_card_claim_identities(),
  2,
  'one exact Academy claim and the verified Doki alias are synchronized'
);

select ok(
  (select player_pool_id = '11000000-0000-0000-0000-000000000040'::uuid
   from public.card_claims
   where season = 'TEST-ACADEMY-CARD' and summoner_name = 'Exact Academy' and tag = 'EXACT')
  and exists (
    select 1 from public.player_identity_links
    where player_pool_id = '11000000-0000-0000-0000-000000000040'
      and profile_id = tests.cap(1)
      and league_team_id = '11000000-0000-0000-0000-000000000020'
      and league = 'academy' and season = 'TEST-ACADEMY-CARD'
      and status = 'approved' and source = 'card'
  ),
  'an exact Academy card claim becomes its approved roster identity'
);

select ok(
  (select player_pool_id = '11000000-0000-0000-0000-000000000041'::uuid
   from public.card_claims
   where season = 'TEST-ACADEMY-CARD' and summoner_name = 'Doki' and tag = '0001')
  and exists (
    select 1 from public.player_identity_links
    where player_pool_id = '11000000-0000-0000-0000-000000000041'
      and profile_id = tests.cap(2)
      and league_team_id = '11000000-0000-0000-0000-000000000021'
      and league = 'academy' and season = 'TEST-ACADEMY-CARD'
      and status = 'approved' and source = 'card'
  ),
  'the verified Doki Academy alias becomes its approved roster identity'
);

select ok(
  (select player_pool_id is null from public.card_claims
   where season = 'TEST-ACADEMY-CARD' and summoner_name = 'Ambiguous Academy' and tag = 'DUPE')
  and not exists (
    select 1 from public.player_identity_links
    where player_pool_id in (
      '11000000-0000-0000-0000-000000000042',
      '11000000-0000-0000-0000-000000000043'
    ) and league = 'academy' and season = 'TEST-ACADEMY-CARD'
  ),
  'ambiguous Academy names remain card-only'
);

select ok(
  (select player_pool_id is null from public.card_claims
   where season = 'TEST-ACADEMY-CARD' and summoner_name = 'Conflict Academy' and tag = 'CONFLICT')
  and exists (
    select 1 from public.player_identity_links
    where player_pool_id = '11000000-0000-0000-0000-000000000044'
      and profile_id = tests.cap(3)
      and status = 'approved'
  ),
  'a conflicting Academy owner is left untouched'
);

select is(
  public.sync_approved_academy_card_claim_identities(),
  0,
  'the Academy card-claim roster sync is idempotent'
);

select * from finish();
rollback;
