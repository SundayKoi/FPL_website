-- populate_postseason_match_codes() allocates only missing postseason slots,
-- protects the selected league/season, and rejects stale or undersized batches.
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(20);

insert into public.profiles (id, display_name, is_admin) values
  (tests.admin_id(), 'Postseason Codes Admin', true),
  (tests.cap(1), 'Postseason Codes Captain')
on conflict (id) do nothing;

insert into public.drafts (id, name) values
  ('70000000-0000-0000-0000-000000000100', 'Postseason Premier Draft'),
  ('70000000-0000-0000-0000-000000000101', 'Postseason Academy Draft');

insert into public.teams (id, draft_id, name, abbreviation, nomination_position, budget_start, points_remaining) values
  ('70000000-0000-0000-0000-000000000110', '70000000-0000-0000-0000-000000000100', 'Post Alpha FC', 'PAFC', 1, 0, 0),
  ('70000000-0000-0000-0000-000000000111', '70000000-0000-0000-0000-000000000100', 'Post Bravo FC', 'PBFC', 2, 0, 0),
  ('70000000-0000-0000-0000-000000000112', '70000000-0000-0000-0000-000000000100', 'Post Charlie FC', 'PCFC', 3, 0, 0),
  ('70000000-0000-0000-0000-000000000113', '70000000-0000-0000-0000-000000000100', 'Post Delta FC', 'PDFC', 4, 0, 0),
  ('70000000-0000-0000-0000-000000000114', '70000000-0000-0000-0000-000000000101', 'Post Academy A', 'PAA', 1, 0, 0),
  ('70000000-0000-0000-0000-000000000115', '70000000-0000-0000-0000-000000000101', 'Post Academy B', 'PAB', 2, 0, 0);

update public.league_settings
set current_season = 'ZZ',
    academy_season = 'A1',
    featured_draft_id = '70000000-0000-0000-0000-000000000100',
    academy_draft_id = '70000000-0000-0000-0000-000000000101'
where id = 1;

insert into public.league_teams (id, name, abbreviation) values
  ('70000000-0000-0000-0000-000000000001', 'Post Alpha FC', 'PAF'),
  ('70000000-0000-0000-0000-000000000002', 'Post Bravo FC', 'PBF'),
  ('70000000-0000-0000-0000-000000000003', 'Post Charlie FC', 'PCF'),
  ('70000000-0000-0000-0000-000000000004', 'Post Delta FC', 'PDF'),
  ('70000000-0000-0000-0000-000000000005', 'Post Academy A', 'PAA2'),
  ('70000000-0000-0000-0000-000000000006', 'Post Academy B', 'PAB2');

insert into public.fixtures (id, stage, sort_order, team_a, team_b, best_of, season, score_a, score_b) values
  ('70000000-0000-0000-0000-000000000020', 'gauntlet_r1', 3, 'Post Alpha FC', 'Post Bravo FC', 1, 'ZZ', null, null),
  ('70000000-0000-0000-0000-000000000021', 'gauntlet_r2', 1, 'Post Charlie FC', 'Post Delta FC', 3, 'ZZ', null, null),
  ('70000000-0000-0000-0000-000000000022', 'quarterfinals', 0, 'Post Alpha FC', 'Post Charlie FC', 5, 'ZZ', null, null),
  ('70000000-0000-0000-0000-000000000023', 'semifinals', 0, 'Post Bravo FC', 'Post Delta FC', 5, 'ZZ', 3, 1),
  ('70000000-0000-0000-0000-000000000024', 'finals', 0, null, 'Post Alpha FC', 5, 'ZZ', null, null),
  ('70000000-0000-0000-0000-000000000025', 'week_1', 0, 'Post Alpha FC', 'Post Bravo FC', 3, 'ZZ', null, null),
  ('70000000-0000-0000-0000-000000000026', 'gauntlet_r1', 0, 'Post Academy A', 'Post Academy B', 1, 'A1', null, null);

insert into public.match_codes (id, fixture_id, season, team_a_id, team_b_id, game_number, code) values
  ('70000000-0000-0000-0000-000000000060', '70000000-0000-0000-0000-000000000021', 'ZZ', '70000000-0000-0000-0000-000000000003', '70000000-0000-0000-0000-000000000004', 1, 'KEEP-G2-1'),
  ('70000000-0000-0000-0000-000000000061', '70000000-0000-0000-0000-000000000022', 'ZZ', '70000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000003', 1, 'KEEP-QF-1'),
  ('70000000-0000-0000-0000-000000000062', '70000000-0000-0000-0000-000000000022', 'ZZ', '70000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000003', 3, 'KEEP-QF-3'),
  ('70000000-0000-0000-0000-000000000063', '70000000-0000-0000-0000-000000000025', 'ZZ', '70000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000002', 1, 'REGULAR-KEEP');

select tests.acting_as(tests.admin_id());

select is(
  (public.populate_postseason_match_codes(
    'premier', 'ZZ', 'all-postseason',
    jsonb_build_array(
      jsonb_build_object('id', '70000000-0000-0000-0000-000000000020', 'stage', 'gauntlet_r1', 'sortOrder', 3, 'teamA', 'Post Alpha FC', 'teamB', 'Post Bravo FC', 'bestOf', 1, 'scoreA', null, 'scoreB', null),
      jsonb_build_object('id', '70000000-0000-0000-0000-000000000021', 'stage', 'gauntlet_r2', 'sortOrder', 1, 'teamA', 'Post Charlie FC', 'teamB', 'Post Delta FC', 'bestOf', 3, 'scoreA', null, 'scoreB', null),
      jsonb_build_object('id', '70000000-0000-0000-0000-000000000022', 'stage', 'quarterfinals', 'sortOrder', 0, 'teamA', 'Post Alpha FC', 'teamB', 'Post Charlie FC', 'bestOf', 5, 'scoreA', null, 'scoreB', null),
      jsonb_build_object('id', '70000000-0000-0000-0000-000000000023', 'stage', 'semifinals', 'sortOrder', 0, 'teamA', 'Post Bravo FC', 'teamB', 'Post Delta FC', 'bestOf', 5, 'scoreA', 3, 'scoreB', 1),
      jsonb_build_object('id', '70000000-0000-0000-0000-000000000024', 'stage', 'finals', 'sortOrder', 0, 'teamA', null, 'teamB', 'Post Alpha FC', 'bestOf', 5, 'scoreA', null, 'scoreB', null)
    ),
    jsonb_build_array(
      jsonb_build_object('id', '70000000-0000-0000-0000-000000000060', 'fixtureId', '70000000-0000-0000-0000-000000000021', 'gameNumber', 1, 'code', 'KEEP-G2-1'),
      jsonb_build_object('id', '70000000-0000-0000-0000-000000000061', 'fixtureId', '70000000-0000-0000-0000-000000000022', 'gameNumber', 1, 'code', 'KEEP-QF-1'),
      jsonb_build_object('id', '70000000-0000-0000-0000-000000000062', 'fixtureId', '70000000-0000-0000-0000-000000000022', 'gameNumber', 3, 'code', 'KEEP-QF-3')
    ),
    jsonb_build_array(
      jsonb_build_object('fixtureId', '70000000-0000-0000-0000-000000000020', 'gameNumber', 1, 'code', 'G1-1'),
      jsonb_build_object('fixtureId', '70000000-0000-0000-0000-000000000021', 'gameNumber', 2, 'code', 'G2-2'),
      jsonb_build_object('fixtureId', '70000000-0000-0000-0000-000000000021', 'gameNumber', 3, 'code', 'G2-3'),
      jsonb_build_object('fixtureId', '70000000-0000-0000-0000-000000000022', 'gameNumber', 2, 'code', 'QF-2'),
      jsonb_build_object('fixtureId', '70000000-0000-0000-0000-000000000022', 'gameNumber', 4, 'code', 'QF-4'),
      jsonb_build_object('fixtureId', '70000000-0000-0000-0000-000000000022', 'gameNumber', 5, 'code', 'QF-5')
    ),
    array['G1-1', 'G2-2', 'G2-3', 'QF-2', 'QF-4', 'QF-5', 'EXTRA']::text[],
    6
  )->>'inserted_count'),
  '6',
  'admin populates missing Bo1/Bo3/Bo5 postseason slots in bracket order'
);
select is((select array_agg(code order by game_number) from public.match_codes where fixture_id = '70000000-0000-0000-0000-000000000020'), array['G1-1'], 'gauntlet round 1 receives one code');
select is((select array_agg(code order by game_number) from public.match_codes where fixture_id = '70000000-0000-0000-0000-000000000021'), array['KEEP-G2-1', 'G2-2', 'G2-3'], 'gauntlet round 2 preserves its existing code and fills missing games');
select is((select array_agg(code order by game_number) from public.match_codes where fixture_id = '70000000-0000-0000-0000-000000000022'), array['KEEP-QF-1', 'QF-2', 'KEEP-QF-3', 'QF-4', 'QF-5'], 'quarterfinals fills only missing Bo5 games');
select is((select count(*) from public.match_codes where fixture_id = '70000000-0000-0000-0000-000000000023'), 0::bigint, 'scored semifinals are skipped');
select is((select count(*) from public.match_codes where fixture_id = '70000000-0000-0000-0000-000000000024'), 0::bigint, 'TBD finals are skipped');
select is((select array_agg(code order by game_number) from public.match_codes where fixture_id = '70000000-0000-0000-0000-000000000025'), array['REGULAR-KEEP'], 'regular-season codes remain outside the postseason scope');

select is(has_function_privilege('anon', 'public.populate_postseason_match_codes(text,text,text,jsonb,jsonb,jsonb,text[],integer)', 'execute'), false, 'anon cannot execute postseason code population');
select is(has_function_privilege('authenticated', 'public.populate_postseason_match_codes(text,text,text,jsonb,jsonb,jsonb,text[],integer)', 'execute'), true, 'authenticated can execute the RPC subject to the admin check');
select is(has_function_privilege('service_role', 'public.populate_postseason_match_codes(text,text,text,jsonb,jsonb,jsonb,text[],integer)', 'execute'), true, 'service_role can execute the trusted RPC');

select tests.acting_as(tests.cap(1));
select throws_like($$
  select public.populate_postseason_match_codes('premier', 'ZZ', 'gauntlet', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, array[]::text[], 0)
$$, '%NOT_ADMIN%', 'non-admin cannot populate postseason codes');

select tests.acting_as(tests.admin_id());
select throws_like($$
  select public.populate_postseason_match_codes(
    'premier', 'ZZ', 'all-postseason',
    jsonb_build_array(jsonb_build_object('id', '70000000-0000-0000-0000-000000000020')),
    jsonb_build_array(jsonb_build_object('id', '70000000-0000-0000-0000-000000000060', 'fixtureId', '70000000-0000-0000-0000-000000000021', 'gameNumber', 1, 'code', 'KEEP-G2-1')),
    '[]'::jsonb,
    array[]::text[],
    0
  )
$$, '%STALE_PREVIEW%', 'a preview from before the insert cannot be applied');

insert into public.fixtures (id, stage, sort_order, team_a, team_b, best_of, season)
values ('70000000-0000-0000-0000-000000000027', 'gauntlet_r2', 99, 'Post Alpha FC', 'Post Bravo FC', 3, 'ZZ');

select throws_like($$
  select public.populate_postseason_match_codes(
    'premier', 'ZZ', 'gauntlet',
    jsonb_build_array(
      jsonb_build_object('id', '70000000-0000-0000-0000-000000000020', 'stage', 'gauntlet_r1', 'sortOrder', 3, 'teamA', 'Post Alpha FC', 'teamB', 'Post Bravo FC', 'bestOf', 1, 'scoreA', null, 'scoreB', null),
      jsonb_build_object('id', '70000000-0000-0000-0000-000000000021', 'stage', 'gauntlet_r2', 'sortOrder', 1, 'teamA', 'Post Charlie FC', 'teamB', 'Post Delta FC', 'bestOf', 3, 'scoreA', null, 'scoreB', null),
      jsonb_build_object('id', '70000000-0000-0000-0000-000000000027', 'stage', 'gauntlet_r2', 'sortOrder', 99, 'teamA', 'Post Alpha FC', 'teamB', 'Post Bravo FC', 'bestOf', 3, 'scoreA', null, 'scoreB', null)
    ),
    (
      select coalesce(jsonb_agg(jsonb_build_object('id', code.id, 'fixtureId', code.fixture_id, 'gameNumber', code.game_number, 'code', code.code) order by case fixture.stage when 'gauntlet_r1' then 0 when 'gauntlet_r2' then 1 end, fixture.sort_order, fixture.id, code.game_number, code.id), '[]'::jsonb)
      from public.match_codes code join public.fixtures fixture on fixture.id = code.fixture_id
      where fixture.id in ('70000000-0000-0000-0000-000000000020', '70000000-0000-0000-0000-000000000021', '70000000-0000-0000-0000-000000000027')
    ),
    jsonb_build_array(jsonb_build_object('fixtureId', '70000000-0000-0000-0000-000000000027', 'gameNumber', 1, 'code', 'ONLY')),
    array['ONLY']::text[],
    3
  )
$$, '%CODES_INSUFFICIENT%', 'insufficient input is rejected before writing the newly eligible Bo3');
select is((select count(*) from public.match_codes where fixture_id = '70000000-0000-0000-0000-000000000027'), 0::bigint, 'insufficient input leaves the new fixture untouched');

select throws_like($$
  select public.populate_postseason_match_codes(
    'premier', 'ZZ', 'gauntlet',
    jsonb_build_array(
      jsonb_build_object('id', '70000000-0000-0000-0000-000000000020', 'stage', 'gauntlet_r1', 'sortOrder', 3, 'teamA', 'Post Alpha FC', 'teamB', 'Post Bravo FC', 'bestOf', 1, 'scoreA', null, 'scoreB', null),
      jsonb_build_object('id', '70000000-0000-0000-0000-000000000021', 'stage', 'gauntlet_r2', 'sortOrder', 1, 'teamA', 'Post Charlie FC', 'teamB', 'Post Delta FC', 'bestOf', 3, 'scoreA', null, 'scoreB', null),
      jsonb_build_object('id', '70000000-0000-0000-0000-000000000027', 'stage', 'gauntlet_r2', 'sortOrder', 99, 'teamA', 'Post Alpha FC', 'teamB', 'Post Bravo FC', 'bestOf', 3, 'scoreA', null, 'scoreB', null)
    ),
    (
      select coalesce(jsonb_agg(jsonb_build_object('id', code.id, 'fixtureId', code.fixture_id, 'gameNumber', code.game_number, 'code', code.code) order by case fixture.stage when 'gauntlet_r1' then 0 when 'gauntlet_r2' then 1 end, fixture.sort_order, fixture.id, code.game_number, code.id), '[]'::jsonb)
      from public.match_codes code join public.fixtures fixture on fixture.id = code.fixture_id
      where fixture.id in ('70000000-0000-0000-0000-000000000020', '70000000-0000-0000-0000-000000000021', '70000000-0000-0000-0000-000000000027')
    ),
    '[]'::jsonb,
    array['DUP', 'DUP', 'DUP']::text[],
    3
  )
$$, '%CODES_DUPLICATE%', 'duplicate input codes are rejected');

select throws_like($$
  select public.populate_postseason_match_codes(
    'premier', 'ZZ', 'gauntlet',
    jsonb_build_array(
      jsonb_build_object('id', '70000000-0000-0000-0000-000000000020', 'stage', 'gauntlet_r1', 'sortOrder', 3, 'teamA', 'Post Alpha FC', 'teamB', 'Post Bravo FC', 'bestOf', 1, 'scoreA', null, 'scoreB', null),
      jsonb_build_object('id', '70000000-0000-0000-0000-000000000021', 'stage', 'gauntlet_r2', 'sortOrder', 1, 'teamA', 'Post Charlie FC', 'teamB', 'Post Delta FC', 'bestOf', 3, 'scoreA', null, 'scoreB', null),
      jsonb_build_object('id', '70000000-0000-0000-0000-000000000027', 'stage', 'gauntlet_r2', 'sortOrder', 99, 'teamA', 'Post Alpha FC', 'teamB', 'Post Bravo FC', 'bestOf', 3, 'scoreA', null, 'scoreB', null)
    ),
    (
      select coalesce(jsonb_agg(jsonb_build_object('id', code.id, 'fixtureId', code.fixture_id, 'gameNumber', code.game_number, 'code', code.code) order by case fixture.stage when 'gauntlet_r1' then 0 when 'gauntlet_r2' then 1 end, fixture.sort_order, fixture.id, code.game_number, code.id), '[]'::jsonb)
      from public.match_codes code join public.fixtures fixture on fixture.id = code.fixture_id
      where fixture.id in ('70000000-0000-0000-0000-000000000020', '70000000-0000-0000-0000-000000000021', '70000000-0000-0000-0000-000000000027')
    ),
    '[]'::jsonb,
    array['KEEP-G2-1', 'NEW-2', 'NEW-3']::text[],
    3
  )
$$, '%CODES_INSUFFICIENT%', 'reclaiming an assigned unused code also opens its old slot and requires a replacement code');

select is(
  (public.populate_postseason_match_codes(
    'premier', 'ZZ', 'gauntlet',
    jsonb_build_array(
      jsonb_build_object('id', '70000000-0000-0000-0000-000000000020', 'stage', 'gauntlet_r1', 'sortOrder', 3, 'teamA', 'Post Alpha FC', 'teamB', 'Post Bravo FC', 'bestOf', 1, 'scoreA', null, 'scoreB', null),
      jsonb_build_object('id', '70000000-0000-0000-0000-000000000021', 'stage', 'gauntlet_r2', 'sortOrder', 1, 'teamA', 'Post Charlie FC', 'teamB', 'Post Delta FC', 'bestOf', 3, 'scoreA', null, 'scoreB', null),
      jsonb_build_object('id', '70000000-0000-0000-0000-000000000027', 'stage', 'gauntlet_r2', 'sortOrder', 99, 'teamA', 'Post Alpha FC', 'teamB', 'Post Bravo FC', 'bestOf', 3, 'scoreA', null, 'scoreB', null)
    ),
    (
      select coalesce(jsonb_agg(jsonb_build_object('id', code.id, 'fixtureId', code.fixture_id, 'gameNumber', code.game_number, 'code', code.code) order by case fixture.stage when 'gauntlet_r1' then 0 when 'gauntlet_r2' then 1 end, fixture.sort_order, fixture.id, code.game_number, code.id), '[]'::jsonb)
      from public.match_codes code join public.fixtures fixture on fixture.id = code.fixture_id
      where fixture.id in ('70000000-0000-0000-0000-000000000020', '70000000-0000-0000-0000-000000000021', '70000000-0000-0000-0000-000000000027')
    ),
    jsonb_build_array(
      jsonb_build_object('fixtureId', '70000000-0000-0000-0000-000000000027', 'gameNumber', 1, 'code', 'LATE-1'),
      jsonb_build_object('fixtureId', '70000000-0000-0000-0000-000000000027', 'gameNumber', 2, 'code', 'LATE-2'),
      jsonb_build_object('fixtureId', '70000000-0000-0000-0000-000000000027', 'gameNumber', 3, 'code', 'LATE-3')
    ),
    array['LATE-1', 'LATE-2', 'LATE-3']::text[],
    3
  )->>'inserted_count'),
  '3',
  'a later run fills only the newly eligible fixture slots'
);
select is((select array_agg(code order by game_number) from public.match_codes where fixture_id = '70000000-0000-0000-0000-000000000027'), array['LATE-1', 'LATE-2', 'LATE-3'], 'later-round reruns are additive');

select is(
  (public.populate_postseason_match_codes(
    'academy', 'A1', 'gauntlet',
    jsonb_build_array(jsonb_build_object('id', '70000000-0000-0000-0000-000000000026', 'stage', 'gauntlet_r1', 'sortOrder', 0, 'teamA', 'Post Academy A', 'teamB', 'Post Academy B', 'bestOf', 1, 'scoreA', null, 'scoreB', null)),
    '[]'::jsonb,
    jsonb_build_array(jsonb_build_object('fixtureId', '70000000-0000-0000-0000-000000000026', 'gameNumber', 1, 'code', 'ACADEMY-1')),
    array['ACADEMY-1']::text[],
    1
  )->>'inserted_count'),
  '1',
  'the selected Academy season uses the Academy draft and season boundary'
);
select is((select code from public.match_codes where fixture_id = '70000000-0000-0000-0000-000000000026' and game_number = 1), 'ACADEMY-1', 'Academy receives its own postseason code');

select * from finish();
rollback;
