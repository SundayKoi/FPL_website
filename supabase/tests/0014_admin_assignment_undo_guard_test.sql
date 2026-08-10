begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(18);

create temporary table after_case as select tests.fixture() as d;
select tests.go_live((select d from after_case));
create temporary table after_ids as
  select
    (select id from public.teams
      where draft_id = (select d from after_case) and nomination_position = 1) as team_a,
    (select id from public.teams
      where draft_id = (select d from after_case) and nomination_position = 2) as team_b,
    (select id from public.teams
      where draft_id = (select d from after_case) and nomination_position = 3) as team_c,
    (select id from public.players
      where draft_id = (select d from after_case) and display_name = 'Mid1') as mid1,
    (select id from public.players
      where draft_id = (select d from after_case) and display_name = 'Mid2') as mid2;
select tests.acting_as(tests.cap(1));
create temporary table after_lot as
  select public.nominate((select d from after_case), (select mid1 from after_ids)) as id;
select tests.acting_as(tests.admin_id());
select is(public.force_close_lot((select id from after_lot)), true,
          'latest auction sale closes before the direct assignment');
select lives_ok($$ select public.admin_assign_player(
  (select d from after_case), (select mid2 from after_ids), (select team_b from after_ids), 7
) $$, 'live direct assignment succeeds after the sale');
select throws_like($$ select public.undo_last_sale((select d from after_case)) $$,
  'UNDO_BLOCKED_NEWER_ASSIGNMENT%',
  'undo rejects a sale when a newer direct assignment advanced the draft');
select is((select status::text from public.lots where id = (select id from after_lot)), 'sold',
          'blocked undo leaves the sale history intact');
select ok((select team_id = (select team_a from after_ids) and price = 10
                  and acquisition::text = 'auction'
           from public.players where id = (select mid1 from after_ids)),
          'blocked undo leaves the auction player assigned');
select is((select points_remaining from public.teams where id = (select team_a from after_ids)), 90,
          'blocked undo does not refund the auction winner');
select ok((select team_id = (select team_b from after_ids) and price = 7
                  and acquisition::text = 'admin'
           from public.players where id = (select mid2 from after_ids)),
          'blocked undo leaves the newer direct assignment intact');
select is((select points_remaining from public.teams where id = (select team_b from after_ids)), 83,
          'blocked undo preserves the direct-assignment charge');
select ok((select status::text = 'live'
                  and current_nominator_team_id = (select team_c from after_ids)
           from public.drafts where id = (select d from after_case)),
          'blocked undo preserves the advanced draft state');

create temporary table before_case as select tests.fixture() as d;
select tests.go_live((select d from before_case));
create temporary table before_ids as
  select
    (select id from public.teams
      where draft_id = (select d from before_case) and nomination_position = 1) as team_a,
    (select id from public.teams
      where draft_id = (select d from before_case) and nomination_position = 2) as team_b,
    (select id from public.players
      where draft_id = (select d from before_case) and display_name = 'Mid1') as mid1,
    (select id from public.players
      where draft_id = (select d from before_case) and display_name = 'Mid2') as mid2;
select tests.acting_as(tests.admin_id());
select lives_ok($$ select public.admin_assign_player(
  (select d from before_case), (select mid1 from before_ids), (select team_a from before_ids), 1
) $$, 'direct assignment may occur before the latest sale');
select tests.acting_as(tests.cap(2));
create temporary table before_lot as
  select public.nominate((select d from before_case), (select mid2 from before_ids)) as id;
select tests.acting_as(tests.admin_id());
select is(public.force_close_lot((select id from before_lot)), true,
          'a newer auction sale closes after the direct assignment');
select lives_ok($$ select public.undo_last_sale((select d from before_case)) $$,
                'undo remains available for a sale newer than the direct assignment');
select is((select status::text from public.lots where id = (select id from before_lot)), 'cancelled',
          'allowed undo cancels the newer sale');
select ok((select team_id is null and price is null and acquisition is null
           from public.players where id = (select mid2 from before_ids)),
          'allowed undo returns the auction player to the pool');
select is((select points_remaining from public.teams where id = (select team_b from before_ids)), 90,
          'allowed undo refunds the auction winner');
select ok((select team_id = (select team_a from before_ids) and price = 1
                  and acquisition::text = 'admin'
           from public.players where id = (select mid1 from before_ids)),
          'allowed undo preserves the older direct assignment');
select is((select points_remaining from public.teams where id = (select team_a from before_ids)), 99,
          'allowed undo preserves the older direct-assignment charge');
select ok((select status::text = 'live'
                  and current_nominator_team_id = (select team_b from before_ids)
           from public.drafts where id = (select d from before_case)),
          'allowed undo restores the sale nominator without rewinding past the assignment');

select * from finish();
rollback;
