begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(14);

select ok(not has_function_privilege(
  'anon', 'public.admin_reorder_setup_teams(uuid,uuid[])', 'execute'
), 'anon cannot reorder the nomination order');
select ok(has_function_privilege(
  'authenticated', 'public.admin_reorder_setup_teams(uuid,uuid[])', 'execute'
), 'authenticated callers may reach the admin-gated reorder RPC');

create temporary table t as select tests.fixture() as d;
create temporary table ids as
  select
    (select id from public.teams where draft_id = (select d from t) and nomination_position = 1) as a,
    (select id from public.teams where draft_id = (select d from t) and nomination_position = 2) as b,
    (select id from public.teams where draft_id = (select d from t) and nomination_position = 3) as c,
    (select id from public.teams where draft_id = (select d from t) and nomination_position = 4) as dd;

select tests.acting_as(tests.cap(1));
select throws_like($$ select public.admin_reorder_setup_teams(
  (select d from t),
  array[(select b from ids), (select a from ids), (select c from ids), (select dd from ids)]
) $$, 'NOT_OWNER%', 'captain cannot reorder the nomination order');
select is(
  (select string_agg(name, ',' order by nomination_position)
     from public.teams where draft_id = (select d from t)),
  'Team A,Team B,Team C,Team D',
  'rejected reorder leaves the order untouched'
);

-- admin_reorder_setup_teams is owner-gated (2026-08-23).
select tests.acting_as(tests.owner_id());

-- The case the old numbered inputs could not express: two teams trading places
-- collides with the unique (draft_id, nomination_position) index mid-update.
select lives_ok($$ select public.admin_reorder_setup_teams(
  (select d from t),
  array[(select b from ids), (select a from ids), (select c from ids), (select dd from ids)]
) $$, 'admin swaps two adjacent teams');
select is(
  (select string_agg(name, ',' order by nomination_position)
     from public.teams where draft_id = (select d from t)),
  'Team B,Team A,Team C,Team D',
  'swapped teams trade positions'
);

-- A full reversal: every row moves, so no row can keep its old position.
select lives_ok($$ select public.admin_reorder_setup_teams(
  (select d from t),
  array[(select dd from ids), (select c from ids), (select a from ids), (select b from ids)]
) $$, 'admin reverses the whole order');
select is(
  (select string_agg(name, ',' order by nomination_position)
     from public.teams where draft_id = (select d from t)),
  'Team D,Team C,Team A,Team B',
  'a full reorder lands every team on its new slot'
);
select is(
  (select array_agg(nomination_position order by nomination_position)
     from public.teams where draft_id = (select d from t)),
  array[1, 2, 3, 4],
  'positions stay a contiguous 1..n run with no negatives left behind'
);

select throws_like($$ select public.admin_reorder_setup_teams(
  (select d from t), array[(select dd from ids), (select c from ids)]
) $$, 'ORDER_INVALID%', 'a partial order is rejected');
select throws_like($$ select public.admin_reorder_setup_teams(
  (select d from t),
  array[(select dd from ids), (select dd from ids), (select a from ids), (select b from ids)]
) $$, 'ORDER_INVALID%', 'a repeated team is rejected');

create temporary table other as select tests.fixture() as d;
select throws_like($$ select public.admin_reorder_setup_teams(
  (select d from t),
  array[(select dd from ids), (select c from ids), (select a from ids),
        (select id from public.teams
          where draft_id = (select d from other) and nomination_position = 1)]
) $$, 'ORDER_INVALID%', 'a team from another draft is rejected');
select is(
  (select string_agg(name, ',' order by nomination_position)
     from public.teams where draft_id = (select d from t)),
  'Team D,Team C,Team A,Team B',
  'rejected orders leave the stored order intact'
);

select tests.go_live((select d from t));
select throws_like($$ select public.admin_reorder_setup_teams(
  (select d from t),
  array[(select a from ids), (select b from ids), (select c from ids), (select dd from ids)]
) $$, 'SETUP_INVALID%', 'a live draft cannot have its nomination order shuffled');

select * from finish();
rollback;
