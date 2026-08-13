begin;
create extension if not exists pgtap with schema extensions;

select plan(19);

-- fixtures: two wallets (member + staff actor) and an event to attach props to
select grant_signup_bonus('prop_member', 'PropFan', null, 1000);
select grant_signup_bonus('prop_admin', 'PropAdmin', null, 1000);
insert into betting_events(name, description) values ('Prop Night', 'test');

-- ---- suggest_prop ----------------------------------------------------------
-- capture the return value first: argument subqueries inside one is() call
-- have unspecified evaluation order
create temporary table _first_suggestion as
  select suggest_prop('prop_member', 'How much will Chime go for?', 'Over 500', 'Under 500', 'settle after draft') as id;

select is(
  (select id from _first_suggestion),
  (select id from betting_prop_suggestions where discord_id = 'prop_member'),
  'suggest_prop inserts and returns the suggestion id');

select is(
  (select status from betting_prop_suggestions where discord_id = 'prop_member'),
  'PENDING', 'new suggestion is PENDING');

select throws_like(
  $$select suggest_prop('nobody', 'q?', 'Yes', 'No')$$,
  '%unknown user%', 'suggesting without a wallet throws');

-- cap: 3 pending max
select suggest_prop('prop_member', 'Second question?', 'Yes', 'No');
select suggest_prop('prop_member', 'Third question?', 'Yes', 'No');
select throws_like(
  $$select suggest_prop('prop_member', 'Fourth question?', 'Yes', 'No')$$,
  '%pending suggestions%', 'a fourth pending suggestion is rejected');

-- ---- approve_prop_admin ----------------------------------------------------
select lives_ok(
  format($$select approve_prop_admin('prop_admin', %s, %s, now() + interval '2 hours')$$,
    (select min(id) from betting_prop_suggestions where discord_id = 'prop_member'),
    (select id from betting_events where name = 'Prop Night')),
  'approving a pending suggestion succeeds');

select is(
  (select status from betting_prop_suggestions order by id limit 1),
  'APPROVED', 'suggestion is APPROVED');

select is(
  (select reviewed_by from betting_prop_suggestions order by id limit 1),
  'prop_admin', 'reviewer recorded');

select isnt(
  (select market_id from betting_prop_suggestions order by id limit 1),
  null, 'approval links the created market');

select is(
  (select title from betting_markets where id =
    (select market_id from betting_prop_suggestions order by id limit 1)),
  'How much will Chime go for?', 'market title is the question');

select is(
  (select count(*) from betting_teams where is_prop_outcome), 2::bigint,
  'two synthetic outcome teams created');

select is(
  (select t.name from betting_markets m join betting_teams t on t.id = m.team_a_id
    where m.id = (select market_id from betting_prop_suggestions order by id limit 1)),
  'Over 500', 'side A outcome carries its label');

select is(
  (select draw_enabled from betting_markets where id =
    (select market_id from betting_prop_suggestions order by id limit 1)),
  false, 'prop markets never enable the draw');

-- the approved prop enters the normal announce queue
select ok(
  exists (select 1 from unannounced_markets('open') u where u.id =
    (select market_id from betting_prop_suggestions order by id limit 1)),
  'approved prop queues a betting-open announcement');

-- re-approving is rejected
select throws_like(
  format($$select approve_prop_admin('prop_admin', %s,
    (select id from betting_events where name = 'Prop Night'), now() + interval '2 hours')$$,
    (select min(id) from betting_prop_suggestions where discord_id = 'prop_member')),
  '%not pending%', 'approving a non-pending suggestion throws');

-- ---- reject_prop_admin -----------------------------------------------------
select lives_ok(
  format($$select reject_prop_admin('prop_admin', %s, 'too ambiguous')$$,
    (select max(id) from betting_prop_suggestions where discord_id = 'prop_member')),
  'rejecting a pending suggestion succeeds');

select is(
  (select status from betting_prop_suggestions order by id desc limit 1),
  'REJECTED', 'suggestion is REJECTED with reason kept');

-- ---- betting on the approved prop works like any market --------------------
select lives_ok(
  format($$select place_bet('prop_member', %s,
    (select team_a_id from betting_markets where id = %s), 100)$$,
    (select market_id from betting_prop_suggestions order by id limit 1),
    (select market_id from betting_prop_suggestions order by id limit 1)),
  'members can bet on an approved prop through the normal engine');

-- ---- lockdown --------------------------------------------------------------
select ok(not has_function_privilege('anon', 'public.suggest_prop(text,text,text,text,text)', 'execute'),
  'anon cannot call suggest_prop');
select ok(has_function_privilege('service_role', 'public.approve_prop_admin(text,bigint,bigint,timestamptz)', 'execute'),
  'service_role can call approve_prop_admin');

select * from finish();
rollback;
