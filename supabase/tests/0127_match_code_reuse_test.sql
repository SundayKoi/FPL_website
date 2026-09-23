-- Assigned-but-unused tournament codes can be reclaimed; ingested game codes
-- remain attached to their match and cannot be moved or removed.
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(10);

insert into public.profiles (id, display_name, is_admin) values
  (tests.admin_id(), 'Code Reuse Admin', true)
on conflict (id) do nothing;

insert into public.drafts (id, name) values
  ('71000000-0000-0000-0000-000000000100', 'Code Reuse Premier Draft');

insert into public.teams (id, draft_id, name, abbreviation, nomination_position, budget_start, points_remaining) values
  ('71000000-0000-0000-0000-000000000110', '71000000-0000-0000-0000-000000000100', 'Reuse Alpha', 'RA', 1, 0, 0),
  ('71000000-0000-0000-0000-000000000111', '71000000-0000-0000-0000-000000000100', 'Reuse Bravo', 'RB', 2, 0, 0),
  ('71000000-0000-0000-0000-000000000112', '71000000-0000-0000-0000-000000000100', 'Reuse Charlie', 'RC', 3, 0, 0),
  ('71000000-0000-0000-0000-000000000113', '71000000-0000-0000-0000-000000000100', 'Reuse Delta', 'RD', 4, 0, 0);

update public.league_settings
set current_season = 'ZZ',
    academy_season = 'A1',
    academy_draft_id = '71000000-0000-0000-0000-000000000100',
    featured_draft_id = '71000000-0000-0000-0000-000000000100'
where id = 1;

insert into public.league_teams (id, name, abbreviation) values
  ('71000000-0000-0000-0000-000000000001', 'Reuse Alpha', 'RA'),
  ('71000000-0000-0000-0000-000000000002', 'Reuse Bravo', 'RB'),
  ('71000000-0000-0000-0000-000000000003', 'Reuse Charlie', 'RC'),
  ('71000000-0000-0000-0000-000000000004', 'Reuse Delta', 'RD');

insert into public.fixtures (id, stage, sort_order, team_a, team_b, best_of, season) values
  ('71000000-0000-0000-0000-000000000020', 'gauntlet_r1', 0, 'Reuse Alpha', 'Reuse Bravo', 1, 'ZZ'),
  ('71000000-0000-0000-0000-000000000021', 'gauntlet_r1', 1, 'Reuse Charlie', 'Reuse Delta', 1, 'ZZ'),
  ('71000000-0000-0000-0000-000000000028', 'week_1', 0, 'Reuse Alpha', 'Reuse Bravo', 1, 'ZZ'),
  ('71000000-0000-0000-0000-000000000029', 'week_2', 0, 'Reuse Charlie', 'Reuse Delta', 1, 'ZZ');

insert into public.match_codes (fixture_id, season, team_a_id, team_b_id, game_number, code) values
  ('71000000-0000-0000-0000-000000000028', 'ZZ', '71000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000002', 1, 'RECLAIM-UNUSED');

select tests.acting_as(tests.admin_id());
select is(
  (public.populate_postseason_match_codes(
    'premier', 'ZZ', 'gauntlet',
    jsonb_build_array(
      jsonb_build_object('id', '71000000-0000-0000-0000-000000000020', 'stage', 'gauntlet_r1', 'sortOrder', 0, 'teamA', 'Reuse Alpha', 'teamB', 'Reuse Bravo', 'bestOf', 1, 'scoreA', null, 'scoreB', null),
      jsonb_build_object('id', '71000000-0000-0000-0000-000000000021', 'stage', 'gauntlet_r1', 'sortOrder', 1, 'teamA', 'Reuse Charlie', 'teamB', 'Reuse Delta', 'bestOf', 1, 'scoreA', null, 'scoreB', null)
    ),
    '[]'::jsonb,
    jsonb_build_array(
      jsonb_build_object('fixtureId', '71000000-0000-0000-0000-000000000020', 'gameNumber', 1, 'code', 'RECLAIM-UNUSED'),
      jsonb_build_object('fixtureId', '71000000-0000-0000-0000-000000000021', 'gameNumber', 1, 'code', 'NEW-TARGET-2')
    ),
    array['RECLAIM-UNUSED', 'NEW-TARGET-2']::text[],
    2
  )->>'inserted_count'),
  '2',
  'postseason import reassigns an existing code whose source game has no ingested stats'
);
select is(
  (select count(*) from public.match_codes where fixture_id = '71000000-0000-0000-0000-000000000028'),
  0::bigint,
  'the unused source assignment is released'
);
select is(
  (select code from public.match_codes where fixture_id = '71000000-0000-0000-0000-000000000020' and game_number = 1),
  'RECLAIM-UNUSED',
  'the reclaimed code is assigned to the reviewed destination slot'
);

select throws_like($$
  insert into public.match_codes (fixture_id, season, team_a_id, team_b_id, game_number, code)
  values ('71000000-0000-0000-0000-000000000020', 'ZZ', '71000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000002', 1, 'RECLAIM-UNUSED')
$$, '%CODES_ALREADY_ASSIGNED%', 'a currently assigned unused code cannot be duplicated through direct table writes');

insert into public.fixtures (id, stage, sort_order, team_a, team_b, best_of, season) values
  ('71000000-0000-0000-0000-000000000022', 'gauntlet_r1', 2, 'Reuse Alpha', 'Reuse Charlie', 1, 'ZZ');

insert into public.match_codes (fixture_id, season, team_a_id, team_b_id, game_number, code) values
  ('71000000-0000-0000-0000-000000000029', 'ZZ', '71000000-0000-0000-0000-000000000003', '71000000-0000-0000-0000-000000000004', 1, 'USED-CODE');
insert into public.match_reports (id, season, season_phase, team_a_id, team_b_id, score_a, score_b, fixture_id) values
  ('71000000-0000-0000-0000-000000000030', 'ZZ', 'regular', '71000000-0000-0000-0000-000000000003', '71000000-0000-0000-0000-000000000004', 1, 0, '71000000-0000-0000-0000-000000000029');
insert into public.match_report_games (id, report_id, game_number, match_id) values
  ('71000000-0000-0000-0000-000000000031', '71000000-0000-0000-0000-000000000030', 1, 'NA1_7100000000000000001');
insert into public.raw_stats (match_id, summoner_name) values ('NA1_7100000000000000001', 'Reuse Player');

select throws_like($$
  select public.populate_postseason_match_codes(
    'premier', 'ZZ', 'gauntlet',
    jsonb_build_array(
      jsonb_build_object('id', '71000000-0000-0000-0000-000000000020', 'stage', 'gauntlet_r1', 'sortOrder', 0, 'teamA', 'Reuse Alpha', 'teamB', 'Reuse Bravo', 'bestOf', 1, 'scoreA', null, 'scoreB', null),
      jsonb_build_object('id', '71000000-0000-0000-0000-000000000021', 'stage', 'gauntlet_r1', 'sortOrder', 1, 'teamA', 'Reuse Charlie', 'teamB', 'Reuse Delta', 'bestOf', 1, 'scoreA', null, 'scoreB', null),
      jsonb_build_object('id', '71000000-0000-0000-0000-000000000022', 'stage', 'gauntlet_r1', 'sortOrder', 2, 'teamA', 'Reuse Alpha', 'teamB', 'Reuse Charlie', 'bestOf', 1, 'scoreA', null, 'scoreB', null)
    ),
    (
      select coalesce(jsonb_agg(jsonb_build_object('id', code.id, 'fixtureId', code.fixture_id, 'gameNumber', code.game_number, 'code', code.code) order by fixture.sort_order, fixture.id, code.game_number, code.id), '[]'::jsonb)
      from public.match_codes code join public.fixtures fixture on fixture.id = code.fixture_id
      where fixture.id in ('71000000-0000-0000-0000-000000000020', '71000000-0000-0000-0000-000000000021', '71000000-0000-0000-0000-000000000022')
    ),
    jsonb_build_array(jsonb_build_object('fixtureId', '71000000-0000-0000-0000-000000000022', 'gameNumber', 1, 'code', 'USED-CODE')),
    array['USED-CODE']::text[],
    1
  )
$$, '%CODES_ALREADY_USED%', 'the postseason importer refuses a code attached to ingested game stats');
select is(
  (select count(*) from public.match_codes where fixture_id = '71000000-0000-0000-0000-000000000029' and code = 'USED-CODE'),
  1::bigint,
  'a rejected reuse leaves the ingested code on its source game'
);
select is(
  (select count(*) from public.match_codes where fixture_id = '71000000-0000-0000-0000-000000000022'),
  0::bigint,
  'a rejected reuse leaves the destination slot empty'
);

select throws_like($$
  delete from public.match_codes where fixture_id = '71000000-0000-0000-0000-000000000029' and code = 'USED-CODE'
$$, '%CODES_ALREADY_USED%', 'direct deletion cannot detach a code from an ingested game');
select throws_like($$
  insert into public.match_codes (fixture_id, season, team_a_id, team_b_id, game_number, code)
  values ('71000000-0000-0000-0000-000000000022', 'ZZ', '71000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000003', 1, 'USED-CODE')
$$, '%CODES_ALREADY_USED%', 'direct assignment cannot reuse a code from an ingested game');
select throws_like($$
  insert into public.match_codes (fixture_id, season, team_a_id, team_b_id, game_number, code)
  values ('71000000-0000-0000-0000-000000000029', 'ZZ', '71000000-0000-0000-0000-000000000003', '71000000-0000-0000-0000-000000000004', 1, 'FRESH-ON-PLAYED-SLOT')
$$, '%CODES_ALREADY_USED%', 'no tournament code can be assigned to an already ingested fixture game');

select * from finish();
rollback;
