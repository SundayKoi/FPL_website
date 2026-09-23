begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(21);

select tests.fixture() as playoff_draft \gset

insert into public.teams (draft_id, name, abbreviation, nomination_position, budget_start, points_remaining)
values
  (:'playoff_draft', 'Playoff Team E', 'PTE', 5, 0, 0),
  (:'playoff_draft', 'Playoff Team F', 'PTF', 6, 0, 0),
  (:'playoff_draft', 'Playoff Team G', 'PTG', 7, 0, 0),
  (:'playoff_draft', 'Playoff Team H', 'PTH', 8, 0, 0);

insert into public.league_teams (id, name, abbreviation) values
  ('11000000-0000-0000-0000-000000000001', 'Team A', 'PTA'),
  ('11000000-0000-0000-0000-000000000002', 'Team B', 'PTB'),
  ('11000000-0000-0000-0000-000000000003', 'Team C', 'PTC'),
  ('11000000-0000-0000-0000-000000000004', 'Team D', 'PTD'),
  ('11000000-0000-0000-0000-000000000005', 'Playoff Team E', 'PTE'),
  ('11000000-0000-0000-0000-000000000006', 'Playoff Team F', 'PTF'),
  ('11000000-0000-0000-0000-000000000007', 'Playoff Team G', 'PTG'),
  ('11000000-0000-0000-0000-000000000008', 'Playoff Team H', 'PTH');

insert into public.riot_accounts (game_name, tag_line)
select 'Playoff Account ' || n, 'TEST' from generate_series(1, 8) n;
insert into public.roster_memberships (riot_account_id, season, league_team_id)
select ra.id, 'S5', lt.id
from public.riot_accounts ra
join public.league_teams lt on lt.name = case ra.game_name
  when 'Playoff Account 1' then 'Team A'
  when 'Playoff Account 2' then 'Team B'
  when 'Playoff Account 3' then 'Team C'
  when 'Playoff Account 4' then 'Team D'
  else 'Playoff Team ' || chr(64 + right(ra.game_name, 1)::integer)
end
where ra.tag_line = 'TEST' and ra.game_name like 'Playoff Account %';

update public.league_settings set current_season = 'S5', featured_draft_id = :'playoff_draft' where id = 1;
insert into public.profiles (id, display_name) values (tests.cap(9), 'Playoff Bystander')
on conflict (id) do nothing;

select has_table('public', 'premier_playoff_config', 'season playoff config exists');
select has_table('public', 'premier_playoff_entrants', 'frozen playoff entrants exist');
select ok(exists(select 1 from pg_indexes where schemaname = 'public' and indexname = 'fixtures_playoff_slot_uidx'), 'playoff fixture slots have a unique index');
select ok((select relrowsecurity from pg_class where oid = 'public.premier_playoff_config'::regclass), 'playoff config RLS is enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.premier_playoff_entrants'::regclass), 'playoff entrants RLS is enabled');
select ok(has_table_privilege('anon', 'public.premier_playoff_config', 'select'), 'anonymous users can read public playoff config');
select ok(has_table_privilege('anon', 'public.premier_playoff_entrants', 'select'), 'anonymous users can read frozen seeds');
select ok(not has_table_privilege('anon', 'public.premier_playoff_config', 'insert'), 'anonymous users cannot write playoff config');

select tests.acting_as(tests.owner_id());
set local role authenticated;
select lives_ok($playoff_seed$
  select public.initialize_premier_playoffs(
    'S5', (select id from public.drafts where name = 'Test Draft'),
    '[
      {"name":"Team A","division":"Solari","seed":1},
      {"name":"Team B","division":"Solari","seed":2},
      {"name":"Team C","division":"Solari","seed":3},
      {"name":"Team D","division":"Solari","seed":4},
      {"name":"Playoff Team E","division":"Lunari","seed":1},
      {"name":"Playoff Team F","division":"Lunari","seed":2},
      {"name":"Playoff Team G","division":"Lunari","seed":3},
      {"name":"Playoff Team H","division":"Lunari","seed":4}
    ]'::jsonb,
    '[
      {"stage":"quarterfinals","sort_order":0,"team_a":"Team A","team_b":"Playoff Team H","best_of":5,"scheduled_at":"2026-09-28T20:00:00-04:00"},
      {"stage":"quarterfinals","sort_order":1,"team_a":"Team B","team_b":"Playoff Team G","best_of":5,"scheduled_at":"2026-09-28T20:00:00-04:00"},
      {"stage":"quarterfinals","sort_order":2,"team_a":"Playoff Team E","team_b":"Team D","best_of":5,"scheduled_at":"2026-09-28T20:00:00-04:00"},
      {"stage":"quarterfinals","sort_order":3,"team_a":"Playoff Team F","team_b":"Team C","best_of":5,"scheduled_at":"2026-09-28T20:00:00-04:00"},
      {"stage":"semifinals","sort_order":0,"team_a":null,"team_b":null,"best_of":5,"scheduled_at":"2026-10-04T20:00:00-04:00"},
      {"stage":"semifinals","sort_order":1,"team_a":null,"team_b":null,"best_of":5,"scheduled_at":"2026-10-04T20:00:00-04:00"},
      {"stage":"finals","sort_order":0,"team_a":null,"team_b":null,"best_of":5,"scheduled_at":"2026-10-11T20:00:00-04:00"}
    ]'::jsonb,
    '{"pairing_22":null,"pairing_40":null}'::jsonb
  )
$playoff_seed$, 'owner initializes an eight-team Premier bracket');
reset role;

select is((select count(*)::integer from public.premier_playoff_entrants where season = 'S5'), 8, 'exactly eight frozen seeds are stored');
select is((select count(*)::integer from public.fixtures where season = 'S5' and stage in ('quarterfinals','semifinals','finals')), 7, 'seven stable playoff fixture slots are stored');

select tests.acting_as(tests.owner_id());
set local role authenticated;
select is(public.update_premier_playoff_policy('S5', 'solari_high_vs_lunari_low', null), 2, 'setting a league ruling increments the config version');
reset role;

update public.fixtures set score_a = 3, score_b = 0 where season = 'S5' and stage = 'quarterfinals';

create or replace function tests.premier_semifinal_preview() returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'config_version', c.config_version,
    'source_snapshots', (
      select jsonb_agg(private.playoff_source_snapshot(f.id) order by f.sort_order)
      from public.fixtures f where f.season = 'S5' and f.stage = 'quarterfinals'
    ),
    'target_fixture_ids', (
      select jsonb_agg(f.id::text order by f.sort_order)
      from public.fixtures f where f.season = 'S5' and f.stage = 'semifinals'
    ),
    'matches', jsonb_build_array(
      jsonb_build_object('sort_order', 0,
        'team_a_id', (select e.team_id::text from public.premier_playoff_entrants e where e.season = 'S5' and e.canonical_name = 'Team A'),
        'team_b_id', (select e.team_id::text from public.premier_playoff_entrants e where e.season = 'S5' and e.canonical_name = 'Playoff Team F')),
      jsonb_build_object('sort_order', 1,
        'team_a_id', (select e.team_id::text from public.premier_playoff_entrants e where e.season = 'S5' and e.canonical_name = 'Playoff Team E'),
        'team_b_id', (select e.team_id::text from public.premier_playoff_entrants e where e.season = 'S5' and e.canonical_name = 'Team B'))
    )
  )
  from public.premier_playoff_config c where c.season = 'S5'
$$;
grant usage on schema tests to authenticated;
grant execute on function tests.premier_semifinal_preview() to authenticated;

select tests.acting_as(tests.owner_id());
set local role authenticated;
select lives_ok($publish$
  select public.publish_premier_playoff_round('S5', 'semifinals', tests.premier_semifinal_preview())
$publish$, 'owner publishes a current, rule-compliant semifinal preview');
reset role;

select is((select count(*)::integer from public.fixtures where season = 'S5' and stage = 'semifinals' and team_a is not null and team_b is not null), 2, 'published semifinals fill the two pre-existing slots');
select is((select string_agg(team_a || ':' || team_b, ',' order by sort_order) from public.fixtures where season = 'S5' and stage = 'semifinals'), 'Team A:Playoff Team F,Playoff Team E:Team B', 'rulebook cross-division policy pairs highest seeds across first');

select tests.acting_as(tests.owner_id());
set local role authenticated;
select throws_ok($policy_locked$select public.update_premier_playoff_policy('S5', 'solari_high_vs_lunari_high', null)$policy_locked$, 'P0001', 'PLAYOFF_POLICY_LOCKED: semifinal matchups have already been published', 'pairing policy is locked after matchups publish');
select lives_ok($republish$select public.publish_premier_playoff_round('S5', 'semifinals', tests.premier_semifinal_preview())$republish$, 'republishing identical advancement is idempotent');
reset role;

select tests.acting_as(tests.cap(9));
set local role authenticated;
select throws_ok($unauthorized$
  select public.update_premier_playoff_policy('S5', null, null)
$unauthorized$, 'P0001', 'NOT_AUTHORIZED: playoff pairing policy requires admin or owner access', 'ordinary authenticated users cannot change playoff policy');
reset role;

insert into public.match_codes (fixture_id, season, team_a_id, team_b_id, game_number, code)
select f.id, 'S5', a.team_id, b.team_id, 1, 'TEST-CODE'
from public.fixtures f
join public.premier_playoff_entrants a on a.season = 'S5' and a.canonical_name = 'Team A'
join public.premier_playoff_entrants b on b.season = 'S5' and b.canonical_name = 'Playoff Team F'
where f.season = 'S5' and f.stage = 'semifinals' and f.sort_order = 0;
select throws_ok($protected_fixture$
  update public.fixtures set team_a = 'Playoff Team E'
  where season = 'S5' and stage = 'semifinals' and sort_order = 0
$protected_fixture$, 'P0001', 'PLAYOFF_FIXTURE_PROTECTED: participants cannot be reassigned after scores or dependent work exist', 'fixture participant edits stop after dependent work exists');

select lives_ok($non_playoff$
  insert into public.fixtures (season, stage, best_of, sort_order)
  values ('S99', 'week_1', 3, 0), ('S99', 'week_1', 3, 0)
$non_playoff$, 'regular-season rows retain their existing slot behavior');
select throws_ok($duplicate_playoff$
  insert into public.fixtures (season, stage, best_of, sort_order) values ('S5', 'quarterfinals', 5, 0)
$duplicate_playoff$, '23505', null, 'duplicate playoff slot is rejected');

select * from finish();
rollback;
