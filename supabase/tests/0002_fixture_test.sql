begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(6);

select lives_ok($$ select tests.fixture() $$, 'fixture builds');

-- rebuild into a variable for assertions
create temporary table t as select tests.fixture() as draft_id;

select is((select count(*)::int from public.teams where draft_id=(select draft_id from t)), 4, '4 teams');
select is((select count(*)::int from public.players p where p.draft_id=(select draft_id from t) and p.team_id is null), 12, '12 available players');
select is((select public.open_roles(id) from public.teams where draft_id=(select draft_id from t) and nomination_position=1),
          array['mid','adc','support']::public.lol_role[], 'teams need mid/adc/support');

-- acting_as makes auth.uid() work
select tests.acting_as(tests.cap(1));
select is(auth.uid(), tests.cap(1), 'auth.uid() simulated');
select is((select (public.caller_team((select draft_id from t))).nomination_position), 1, 'caller_team resolves captain 1');

select * from finish();
rollback;
