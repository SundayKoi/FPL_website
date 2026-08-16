-- bulk_replace_match_codes() must derive the current Premier target set from
-- league_settings + its featured draft, reject any client/server scope drift,
-- and roll back a delete when a later insert fails.
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(26);

insert into public.profiles (id, display_name, is_admin) values
  (tests.admin_id(), 'Bulk Codes Admin', true)
  on conflict (id) do nothing;
insert into public.profiles (id, display_name) values
  (tests.cap(1), 'Bulk Codes Captain')
  on conflict (id) do nothing;

insert into public.drafts (id, name) values
  ('60000000-0000-0000-0000-000000000100', 'Bulk Premier Draft'),
  ('60000000-0000-0000-0000-000000000101', 'Bulk Academy Draft');

insert into public.teams (
  id, draft_id, name, abbreviation, nomination_position, budget_start, points_remaining
) values
  ('60000000-0000-0000-0000-000000000110', '60000000-0000-0000-0000-000000000100', 'Bulk Alpha FC', 'BAFC', 1, 0, 0),
  ('60000000-0000-0000-0000-000000000111', '60000000-0000-0000-0000-000000000100', 'Bulk Bravo FC', 'BBFC', 2, 0, 0),
  ('60000000-0000-0000-0000-000000000112', '60000000-0000-0000-0000-000000000100', 'Bulk Charlie FC', 'BCFC', 3, 0, 0),
  ('60000000-0000-0000-0000-000000000113', '60000000-0000-0000-0000-000000000100', 'Bulk Delta FC', 'BDFC', 4, 0, 0),
  ('60000000-0000-0000-0000-000000000114', '60000000-0000-0000-0000-000000000100', 'Bulk Echo FC', 'BEFC', 5, 0, 0),
  ('60000000-0000-0000-0000-000000000115', '60000000-0000-0000-0000-000000000100', 'Bulk Foxtrot FC', 'BFFC', 6, 0, 0),
  ('60000000-0000-0000-0000-000000000116', '60000000-0000-0000-0000-000000000101', 'Bulk Academy A', 'BAA', 1, 0, 0),
  ('60000000-0000-0000-0000-000000000117', '60000000-0000-0000-0000-000000000101', 'Bulk Academy B', 'BAB', 2, 0, 0);

update public.league_settings
set current_season = 'ZZ', featured_draft_id = '60000000-0000-0000-0000-000000000100'
where id = 1;

insert into public.league_teams (id, name, abbreviation) values
  ('60000000-0000-0000-0000-000000000001', 'Bulk Alpha FC', 'BAF'),
  ('60000000-0000-0000-0000-000000000002', 'Bulk Bravo FC', 'BBF'),
  ('60000000-0000-0000-0000-000000000003', 'Bulk Charlie FC', 'BCF'),
  ('60000000-0000-0000-0000-000000000004', 'Bulk Delta FC', 'BDF'),
  ('60000000-0000-0000-0000-000000000005', 'Bulk Echo FC', 'BEF'),
  ('60000000-0000-0000-0000-000000000006', 'Bulk Foxtrot FC', 'BFF'),
  ('60000000-0000-0000-0000-000000000007', 'Bulk Academy A', 'BA1'),
  ('60000000-0000-0000-0000-000000000008', 'Bulk Academy B', 'BA2');

insert into public.fixtures (id, stage, sort_order, team_a, team_b, best_of, season, score_a, score_b) values
  ('60000000-0000-0000-0000-000000000020', 'week_2', 40, 'Bulk Charlie FC', 'Bulk Delta FC', 3, 'ZZ', null, null),
  ('60000000-0000-0000-0000-000000000021', 'week_1', 90, 'Bulk Alpha FC', 'Bulk Bravo FC', 3, 'ZZ', null, null),
  ('60000000-0000-0000-0000-000000000022', 'gauntlet_r1', 5, 'Bulk Echo FC', 'Bulk Foxtrot FC', 3, 'ZZ', null, null),
  ('60000000-0000-0000-0000-000000000023', 'quarterfinals', 0, 'Bulk Alpha FC', 'Bulk Charlie FC', 5, 'ZZ', null, null),
  ('60000000-0000-0000-0000-000000000024', 'semifinals', 1, 'Bulk Bravo FC', 'Bulk Delta FC', 5, 'ZZ', 3, 1),
  ('60000000-0000-0000-0000-000000000025', 'week_3', 7, 'Bulk Alpha FC', 'Bulk Charlie FC', 3, 'YY', null, null),
  ('60000000-0000-0000-0000-000000000026', 'week_1', 1, 'Bulk Academy A', 'Bulk Academy B', 3, 'ZZ', null, null),
  ('60000000-0000-0000-0000-000000000027', 'week_1', 2, 'Bulk Alpha FC', 'Bulk Academy A', 3, 'ZZ', null, null);

insert into public.match_codes (fixture_id, season, team_a_id, team_b_id, game_number, code) values
  ('60000000-0000-0000-0000-000000000020', 'ZZ', '60000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-000000000004', 1, 'OLD-W2'),
  ('60000000-0000-0000-0000-000000000021', 'ZZ', '60000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002', 1, 'OLD-W1'),
  ('60000000-0000-0000-0000-000000000022', 'ZZ', '60000000-0000-0000-0000-000000000005', '60000000-0000-0000-0000-000000000006', 1, 'OLD-G1'),
  ('60000000-0000-0000-0000-000000000023', 'ZZ', '60000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000003', 1, 'OLD-QF');

select tests.acting_as(tests.admin_id());
select is(
  public.bulk_replace_match_codes(
    'ZZ',
    array[
      '60000000-0000-0000-0000-000000000023'::uuid,
      '60000000-0000-0000-0000-000000000020'::uuid,
      '60000000-0000-0000-0000-000000000022'::uuid,
      '60000000-0000-0000-0000-000000000021'::uuid
    ],
    array[
      E'\nW1-1\t', '', 'W1-2', 'W1-3',
      'W2-1', 'W2-2', 'W2-3',
      'G1-1', 'G1-2', 'G1-3',
      'QF-1', 'QF-2', 'QF-3', 'EXTRA'
    ]::text[]
  ),
  12,
  'bulk import inserts exactly three rows for every current unplayed Premier fixture'
);
select is((select count(*) from public.match_codes where fixture_id = '60000000-0000-0000-0000-000000000021'), 3::bigint, 'week 1 fixture is replaced');
select is((select count(*) from public.match_codes where fixture_id = '60000000-0000-0000-0000-000000000020'), 3::bigint, 'week 2 fixture is replaced');
select is(
  (select array_agg(code order by game_number) from public.match_codes where fixture_id = '60000000-0000-0000-0000-000000000021'),
  array['W1-1', 'W1-2', 'W1-3'],
  'week ordering beats input-array order and trims codes'
);
select is(
  (select array_agg(code order by game_number) from public.match_codes where fixture_id = '60000000-0000-0000-0000-000000000020'),
  array['W2-1', 'W2-2', 'W2-3'],
  'week 2 receives the second triplet'
);
select is(
  (select array_agg(code order by game_number) from public.match_codes where fixture_id = '60000000-0000-0000-0000-000000000022'),
  array['G1-1', 'G1-2', 'G1-3'],
  'gauntlet_r1 precedes quarterfinals even when its sort_order is later'
);
select is(
  (select array_agg(code order by game_number) from public.match_codes where fixture_id = '60000000-0000-0000-0000-000000000023'),
  array['QF-1', 'QF-2', 'QF-3'],
  'quarterfinals receives the triplet after gauntlet_r1'
);

select is(has_function_privilege('anon', 'public.bulk_replace_match_codes(text,uuid[],text[])', 'execute'), false, 'anon cannot execute bulk_replace_match_codes');
select is(has_function_privilege('authenticated', 'public.bulk_replace_match_codes(text,uuid[],text[])', 'execute'), true, 'authenticated can execute bulk_replace_match_codes');
select is(has_function_privilege('service_role', 'public.bulk_replace_match_codes(text,uuid[],text[])', 'execute'), true, 'service_role can execute bulk_replace_match_codes');

select tests.acting_as(tests.cap(1));
select throws_like($$
  select public.bulk_replace_match_codes(
    'ZZ',
    array[
      '60000000-0000-0000-0000-000000000020'::uuid,
      '60000000-0000-0000-0000-000000000021'::uuid,
      '60000000-0000-0000-0000-000000000022'::uuid,
      '60000000-0000-0000-0000-000000000023'::uuid
    ],
    array['A1','A2','A3','B1','B2','B3','C1','C2','C3','D1','D2','D3']::text[]
  )
$$, 'NOT_ADMIN%', 'a non-admin cannot bulk replace codes');

select tests.acting_as(tests.admin_id());
select throws_like($$
  select public.bulk_replace_match_codes(
    'ZZ',
    array[
      '60000000-0000-0000-0000-000000000020'::uuid,
      '60000000-0000-0000-0000-000000000021'::uuid,
      '60000000-0000-0000-0000-000000000022'::uuid,
      '60000000-0000-0000-0000-000000000023'::uuid,
      '60000000-0000-0000-0000-000000000026'::uuid
    ],
    array['1','2','3','4','5','6','7','8','9','10','11','12','13','14','15']::text[]
  )
$$, '%complete current unplayed Premier fixture set%', 'a mixed Premier and Academy fixture payload is rejected');
select throws_like($$
  select public.bulk_replace_match_codes(
    'YY',
    array['60000000-0000-0000-0000-000000000025'::uuid],
    array['1','2','3']::text[]
  )
$$, '%current season%', 'an old season payload is rejected independently of supplied fixtures');
select throws_like($$
  select public.bulk_replace_match_codes(
    'ZZ',
    array[
      '60000000-0000-0000-0000-000000000020'::uuid,
      '60000000-0000-0000-0000-000000000021'::uuid,
      '60000000-0000-0000-0000-000000000022'::uuid
    ],
    array['1','2','3','4','5','6','7','8','9']::text[]
  )
$$, '%complete current unplayed Premier fixture set%', 'a subset missing a current Premier target is rejected');

insert into public.fixtures (id, stage, sort_order, team_a, team_b, best_of, season) values
  ('60000000-0000-0000-0000-000000000028', 'gauntlet_r2', 0, 'Bulk Bravo FC', 'Bulk Echo FC', 1, 'ZZ');

select throws_like($$
  select public.bulk_replace_match_codes(
    'ZZ',
    array[
      '60000000-0000-0000-0000-000000000020'::uuid,
      '60000000-0000-0000-0000-000000000021'::uuid,
      '60000000-0000-0000-0000-000000000022'::uuid,
      '60000000-0000-0000-0000-000000000023'::uuid
    ],
    array['1','2','3','4','5','6','7','8','9','10','11','12']::text[]
  )
$$, '%complete current unplayed Premier fixture set%', 'a fixture added after preview makes the stale target set fail');
select throws_like($$
  select public.bulk_replace_match_codes(
    'ZZ',
    array[
      '60000000-0000-0000-0000-000000000020'::uuid,
      '60000000-0000-0000-0000-000000000021'::uuid,
      '60000000-0000-0000-0000-000000000022'::uuid,
      '60000000-0000-0000-0000-000000000023'::uuid,
      '60000000-0000-0000-0000-000000000024'::uuid,
      '60000000-0000-0000-0000-000000000028'::uuid
    ],
    array['1','2','3','4','5','6','7','8','9','10','11','12','13','14','15','16','17','18']::text[]
  )
$$, '%complete current unplayed Premier fixture set%', 'a played fixture is rejected as an extra target');
select throws_like($$
  select public.bulk_replace_match_codes(
    'ZZ',
    array[
      '60000000-0000-0000-0000-000000000020'::uuid,
      '60000000-0000-0000-0000-000000000021'::uuid,
      '60000000-0000-0000-0000-000000000022'::uuid,
      '60000000-0000-0000-0000-000000000023'::uuid,
      '60000000-0000-0000-0000-000000000028'::uuid,
      '60000000-0000-0000-0000-00000000ffff'::uuid
    ],
    array['1','2','3','4','5','6','7','8','9','10','11','12','13','14','15','16','17','18']::text[]
  )
$$, '%complete current unplayed Premier fixture set%', 'an unknown fixture is rejected as an extra target');

select throws_like($$
  select public.bulk_replace_match_codes(
    'ZZ',
    array[
      '60000000-0000-0000-0000-000000000020'::uuid,
      '60000000-0000-0000-0000-000000000021'::uuid,
      '60000000-0000-0000-0000-000000000022'::uuid,
      '60000000-0000-0000-0000-000000000023'::uuid,
      '60000000-0000-0000-0000-000000000028'::uuid
    ],
    array['1','2','3','4','5','6','7','8','9','10','11','12','13','14']::text[]
  )
$$, '%at least 3 nonblank codes%', 'insufficient codes are rejected before deletion');
select is(
  (select count(*) from public.match_codes where fixture_id in (
    '60000000-0000-0000-0000-000000000020',
    '60000000-0000-0000-0000-000000000021',
    '60000000-0000-0000-0000-000000000022',
    '60000000-0000-0000-0000-000000000023'
  )),
  12::bigint,
  'validation failure preserves all previously imported rows'
);
select throws_like($$
  select public.bulk_replace_match_codes(
    'ZZ',
    array[
      '60000000-0000-0000-0000-000000000020'::uuid,
      '60000000-0000-0000-0000-000000000021'::uuid,
      '60000000-0000-0000-0000-000000000022'::uuid,
      '60000000-0000-0000-0000-000000000023'::uuid,
      '60000000-0000-0000-0000-000000000028'::uuid
    ],
    array['   ', '', E'\n\t']::text[]
  )
$$, '%at least 3 nonblank codes%', 'blank-only code input is rejected');
select throws_like($$
  select public.bulk_replace_match_codes('ZZ', array[]::uuid[], array['A', 'B', 'C']::text[])
$$, '%at least one fixture%', 'empty fixture selections are rejected');
select throws_like($$
  select public.bulk_replace_match_codes(
    'ZZ',
    array[
      '60000000-0000-0000-0000-000000000020'::uuid,
      '60000000-0000-0000-0000-000000000020'::uuid
    ],
    array['1','2','3','4','5','6']::text[]
  )
$$, '%duplicate fixture%', 'duplicate fixture IDs are rejected');

create temporary table codes_before_forced_failure as
select fixture_id, game_number, code
from public.match_codes
where fixture_id in (
  '60000000-0000-0000-0000-000000000020',
  '60000000-0000-0000-0000-000000000021',
  '60000000-0000-0000-0000-000000000022',
  '60000000-0000-0000-0000-000000000023',
  '60000000-0000-0000-0000-000000000028'
);

create function tests.fail_forced_match_code_insert() returns trigger
language plpgsql as $$
begin
  if new.code = 'FORCE-INSERT-FAIL' then
    raise exception 'FORCED_INSERT_FAILURE';
  end if;
  return new;
end
$$;
create trigger fail_forced_match_code_insert
before insert on public.match_codes
for each row execute function tests.fail_forced_match_code_insert();

select throws_like($$
  select public.bulk_replace_match_codes(
    'ZZ',
    array[
      '60000000-0000-0000-0000-000000000020'::uuid,
      '60000000-0000-0000-0000-000000000021'::uuid,
      '60000000-0000-0000-0000-000000000022'::uuid,
      '60000000-0000-0000-0000-000000000023'::uuid,
      '60000000-0000-0000-0000-000000000028'::uuid
    ],
    array[
      'N1','N2','N3','N4','N5','N6','N7','N8','N9',
      'FORCE-INSERT-FAIL','N11','N12','N13','N14','N15'
    ]::text[]
  )
$$, '%FORCED_INSERT_FAILURE%', 'an insert failure is raised after the delete path starts');
select is(
  (select count(*) from public.match_codes where fixture_id in (
    '60000000-0000-0000-0000-000000000020',
    '60000000-0000-0000-0000-000000000021',
    '60000000-0000-0000-0000-000000000022',
    '60000000-0000-0000-0000-000000000023',
    '60000000-0000-0000-0000-000000000028'
  )),
  12::bigint,
  'post-delete insert failure restores the pre-existing row count'
);
select is(
  (select array_agg(format('%s:%s:%s', fixture_id, game_number, code) order by fixture_id, game_number) from public.match_codes where fixture_id in (
    '60000000-0000-0000-0000-000000000020',
    '60000000-0000-0000-0000-000000000021',
    '60000000-0000-0000-0000-000000000022',
    '60000000-0000-0000-0000-000000000023',
    '60000000-0000-0000-0000-000000000028'
  )),
  (select array_agg(format('%s:%s:%s', fixture_id, game_number, code) order by fixture_id, game_number) from codes_before_forced_failure),
  'post-delete insert failure restores every pre-existing code value'
);
select is(
  (select count(*) from public.match_codes where fixture_id = '60000000-0000-0000-0000-000000000028'),
  0::bigint,
  'post-delete insert failure does not leave rows for the newly added target'
);

select * from finish();
rollback;
