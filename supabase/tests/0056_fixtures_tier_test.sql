begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(4);

insert into public.profiles (id, display_name, is_admin, is_owner)
values (tests.cap(41), 'dribb', true, true),
       (tests.cap(43), 'helper', true, false)
on conflict (id) do update set is_admin = excluded.is_admin, is_owner = excluded.is_owner;

insert into public.fixtures (season, stage, team_a, team_b, best_of, sort_order)
values ('S5', 'week_1', 'Alpha', 'Beta', 3, 1);

-- Admins enter results.
select tests.acting_as(tests.cap(43));
set local role authenticated;
update public.fixtures set score_a = 2, score_b = 1 where team_a = 'Alpha';
reset role;
select is((select score_a from public.fixtures where team_a = 'Alpha'), 2,
          'an admin can report a score');

-- But cannot change the season's structure.
select tests.acting_as(tests.cap(43));
set local role authenticated;
select throws_ok($$ insert into public.fixtures (season, stage, team_a, team_b, best_of)
                    values ('S5', 'week_2', 'Alpha', 'Beta', 3) $$, '42501', null,
                 'an admin cannot create a fixture');
delete from public.fixtures where team_a = 'Alpha';
reset role;
select is((select count(*) from public.fixtures where team_a = 'Alpha'), 1::bigint,
          'an admin cannot delete a fixture');

select tests.acting_as(tests.cap(41));
set local role authenticated;
select lives_ok($$ insert into public.fixtures (season, stage, team_a, team_b, best_of)
                   values ('S5', 'week_2', 'Alpha', 'Beta', 3) $$,
                'an owner can create a fixture');
reset role;

select * from finish();
rollback;
