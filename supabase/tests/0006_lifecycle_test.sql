begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(10);

create temporary table t as select tests.fixture() as d;

-- non-admin blocked
select tests.acting_as(tests.cap(1));
select throws_like($$ select public.start_draft((select d from t)) $$,
  'NOT_ADMIN%', 'captain cannot start');

-- setup validation: break the pool (delete all supports), expect SETUP_INVALID
select tests.acting_as(tests.admin_id());
create temporary table gone as
  select display_name from public.players
  where draft_id=(select d from t) and role='support' and team_id is null;
delete from public.players
  where draft_id=(select d from t) and role='support' and team_id is null;
select throws_like($$ select public.start_draft((select d from t)) $$,
  'SETUP_INVALID%', 'insufficient supports blocks start');
insert into public.players (draft_id, display_name, role)
  select (select d from t), display_name, 'support'::public.lol_role from gone;

-- valid start
select lives_ok($$ select public.start_draft((select d from t)) $$, 'valid setup starts');
select is((select status from public.drafts where id=(select d from t)), 'live', 'status live');
select is((select current_nominator_team_id from public.drafts where id=(select d from t)),
          (select id from public.teams where draft_id=(select d from t) and nomination_position=1),
          'position 1 nominates first');

-- can't start twice
select throws_like($$ select public.start_draft((select d from t)) $$,
  'SETUP_INVALID%', 'already live blocks start');

-- pause freezes an open lot's clock
select tests.acting_as(tests.cap(1));
select public.nominate((select d from t),
  (select id from public.players where draft_id=(select d from t) and display_name='Mid1'));
select tests.acting_as(tests.admin_id());
select public.pause_draft((select d from t));
select ok((select paused_time_remaining is not null from public.drafts where id=(select d from t)),
          'time remaining captured');

-- paused draft rejects bids
select tests.acting_as(tests.cap(2));
select throws_like($$
  select public.place_bid((select id from public.lots where draft_id=(select d from t) and status='open'), 11)
$$, 'NOT_LIVE%', 'bids blocked while paused');

-- resume restores clock and play
select tests.acting_as(tests.admin_id());
select public.resume_draft((select d from t));
select ok((select closes_at > now() from public.lots where draft_id=(select d from t) and status='open'),
          'clock restored in the future');
select tests.acting_as(tests.cap(2));
select lives_ok($$
  select public.place_bid((select id from public.lots where draft_id=(select d from t) and status='open'), 11)
$$, 'bidding works after resume');

select * from finish();
rollback;
