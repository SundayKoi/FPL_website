begin;
set local search_path = public, extensions;
select plan(17);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-00000000d4a1'::uuid, 'authenticated', 'authenticated',
        'draw-0068@example.test', '', now(), now(), now());

insert into public.betting_profiles (discord_id, profile_id, username, balance)
values ('draw-winner-0068', '00000000-0000-0000-0000-00000000d4a1'::uuid, 'Draw Winner', 500);

-- One eligible ticket — the draw MUST pick it (uniform over a set of one).
insert into public.card_inventory (discord_id, season, slug, player_name, role, edition_week, overall, tier, foil, card)
values ('draw-winner-0068', 'S_TEST_DRAW', 'test-player', 'Test Player', 'MID',
        date '2026-08-24', 80, 'platinum', false, '{"slug":"test-player","name":"Test Player"}'::jsonb);

-- 1. Table exists and is empty for this season.
select is((select count(*) from public.weekly_draws where season = 'S_TEST_DRAW')::int, 0, 'no draws yet');

-- 2-4. Running the draw picks the only ticket, pays, records.
select results_eq(
  $$ select discord_id, already from public.run_weekly_draw('S_TEST_DRAW', date '2026-08-24', 250) $$,
  $$ values ('draw-winner-0068', false) $$,
  'draw picks the only ticket');
select is((select count(*) from public.weekly_draws where season = 'S_TEST_DRAW')::int, 1, 'one draw row');
select is((select pot from public.weekly_draws where season = 'S_TEST_DRAW' and week_start = date '2026-08-24'), 250::bigint, 'pot recorded');

-- 5. Ledger row written with the draw reason.
select is(
  (select count(*) from public.betting_ledger where discord_id = 'draw-winner-0068' and reason = 'weekly_draw')::int,
  1, 'ledger row written');

-- 6. Balance credited.
select is((select balance from public.betting_profiles where discord_id = 'draw-winner-0068'), 750::bigint, 'pot credited');

-- 7. Standard pack comp granted.
select is((select remaining from public.card_pack_comps where discord_id = 'draw-winner-0068' and kind = 'standard'), 1, 'comp granted');

-- 8. The copy is stamped.
select is(
  (select card -> 'drawWin' ->> 'weekStart' from public.card_inventory where discord_id = 'draw-winner-0068' and season = 'S_TEST_DRAW'),
  '2026-08-24', 'copy stamped with drawWin');

-- 9. Frozen snapshot in the draw row carries the stamp too.
select is(
  (select card -> 'drawWin' ->> 'weekStart' from public.weekly_draws where season = 'S_TEST_DRAW'),
  '2026-08-24', 'snapshot frozen with stamp');

-- 10. Rerun is a no-op that reports already = true.
select results_eq(
  $$ select discord_id, already from public.run_weekly_draw('S_TEST_DRAW', date '2026-08-24', 250) $$,
  $$ values ('draw-winner-0068', true) $$,
  'rerun reports already');
select is((select balance from public.betting_profiles where discord_id = 'draw-winner-0068'), 750::bigint, 'rerun does not pay twice');

-- 11-13. The draw credits betting dollars, so only the service role may
-- run it — a security-definer function is exactly as safe as its ACL.
select ok(not has_function_privilege('anon', 'public.run_weekly_draw(text,date,bigint)', 'execute'),
  'anon cannot run the draw');
select ok(not has_function_privilege('authenticated', 'public.run_weekly_draw(text,date,bigint)', 'execute'),
  'authenticated cannot run the draw');
select ok(has_function_privilege('service_role', 'public.run_weekly_draw(text,date,bigint)', 'execute'),
  'service_role can run the draw');

-- 14-17. Anon can read history; anon cannot write. lives_ok alone would
-- pass under a `using (false)` policy, so the row is counted as well.
set local role anon;
select lives_ok($$ select * from public.weekly_draws $$, 'anon reads draw history');
select is((select count(*) from public.weekly_draws where season = 'S_TEST_DRAW')::int, 1,
  'anon sees the draw history');
select throws_ok(
  $$ insert into public.weekly_draws (season, week_start, copy_id, discord_id, card, pot)
     values ('S_TEST_DRAW', date '2026-08-31', 1, 'x', '{}'::jsonb, 1) $$,
  '42501', null, 'anon cannot write draws');

select * from finish();
rollback;
