-- The rescue that could never come home (20261007000001).
--
-- A Rescue targets a 'lost' hold, and three ordinary things close that
-- hold while the rescue is still in the field: the seven-day deadline
-- expires it, its owner ransoms it, or a stranger's route carries the card
-- home. resolve_expedition used to raise 'no such lost card' in that case
-- — and because the rescue run's own claim happens earlier in the same
-- transaction, the raise rolled that back too. The run could never be
-- claimed, and since the board allows one run per route at a time, the
-- rescue slot was blocked for good.
--
-- These tests are about the run surviving, not about the card. Losing the
-- card to a deadline is the game working; losing the mode is the bug.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

-- Fixtures, all named apart from real data so the rollback is belt and
-- braces rather than the only thing keeping them out.
insert into public.betting_profiles (discord_id, balance)
  values ('t_rescue', 5000) on conflict (discord_id) do nothing;

insert into public.card_inventory (discord_id, season, slug, player_name, tier, card)
  values ('t_rescue', 'T', 't-gone', 'Gone', 'gold', '{}'::jsonb),
         ('t_rescue', 'T', 't-home', 'Home', 'gold', '{}'::jsonb);

-- ── A hold whose deadline has passed, with a rescue still in the field ──
insert into public.expedition_runs (discord_id, season, tier, squad, resolves_at, target)
  select 't_rescue', 'T', 'lost', array[ci.id], now() - interval '1 hour', null
    from public.card_inventory ci where ci.slug = 't-gone' and ci.discord_id = 't_rescue';

insert into public.expedition_runs (discord_id, season, tier, squad, resolves_at, target)
  select 't_rescue', 'T', 'rescue', '{}'::bigint[], now() + interval '2 hours', r.id
    from public.expedition_runs r
   where r.discord_id = 't_rescue' and r.tier = 'lost';

select is(
  (select count(*)::int from public.expedition_runs
    where discord_id = 't_rescue' and tier = 'lost' and claimed_at is not null),
  0,
  'the hold starts open');

-- The expiry must leave it alone while a rescue is on its way.
select public.expire_lost_cards();
select is(
  (select count(*)::int from public.expedition_runs
    where discord_id = 't_rescue' and tier = 'lost' and claimed_at is not null),
  0,
  'a hold is not buried while an unclaimed rescue is still in the field');
select isnt_empty(
  $$select 1 from public.card_inventory where slug = 't-gone' and discord_id = 't_rescue'$$,
  'and the card it is holding is still on the shelf');

-- Once the rescue's own clock runs out, the hold is expirable again — the
-- guard buys a fair chance to claim, not an indefinite reprieve.
update public.expedition_runs set resolves_at = now() - interval '1 minute'
  where discord_id = 't_rescue' and tier = 'rescue';
select public.expire_lost_cards();
select is(
  (select count(*)::int from public.expedition_runs
    where discord_id = 't_rescue' and tier = 'lost' and claimed_at is not null),
  1,
  'once the rescue is due, the deadline applies again');
select is_empty(
  $$select 1 from public.card_inventory where slug = 't-gone' and discord_id = 't_rescue'$$,
  'and the card is buried');

-- ── THE BUG ────────────────────────────────────────────────────────────
-- Resolving the rescue now, against a hold that closed underneath it.
select lives_ok(
  $$select * from public.resolve_expedition('t_rescue',
      (select id from public.expedition_runs where discord_id = 't_rescue' and tier = 'rescue'),
      '{"grade":"solid","dollars":0,"rescued":true,"fates":[]}'::jsonb)$$,
  'a rescue whose target is already gone resolves instead of raising');

select isnt(
  (select claimed_at from public.expedition_runs where discord_id = 't_rescue' and tier = 'rescue'),
  null,
  'and the run is CLAIMED — the raise used to roll this back and strand the slot forever');

select is(
  (select outcome ->> 'rescueMissed' from public.expedition_runs
    where discord_id = 't_rescue' and tier = 'rescue'),
  'true',
  'the outcome records that there was nothing left to bring home');

-- ── The happy path is untouched ────────────────────────────────────────
insert into public.expedition_runs (discord_id, season, tier, squad, resolves_at, target)
  select 't_rescue', 'T', 'lost', array[ci.id], now() + interval '3 days', null
    from public.card_inventory ci where ci.slug = 't-home' and ci.discord_id = 't_rescue';

insert into public.expedition_runs (discord_id, season, tier, squad, resolves_at, target)
  select 't_rescue', 'T', 'rescue', '{}'::bigint[], now() - interval '1 minute', r.id
    from public.expedition_runs r
   where r.discord_id = 't_rescue' and r.tier = 'lost' and r.claimed_at is null;

select public.resolve_expedition('t_rescue',
  (select id from public.expedition_runs
    where discord_id = 't_rescue' and tier = 'rescue' and claimed_at is null),
  '{"grade":"solid","dollars":0,"rescued":true,"fates":[]}'::jsonb);

select is(
  (select outcome ->> 'rescued' from public.expedition_runs
    where discord_id = 't_rescue' and tier = 'lost' and claimed_at is not null
    order by id desc limit 1),
  'true',
  'an open hold is still claimed by the rescue that reaches it');

select ok(
  (select card ? 'wounded' from public.card_inventory
    where slug = 't-home' and discord_id = 't_rescue'),
  'and the card comes home wounded, as it always did');

select is(
  (select outcome ->> 'rescueMissed' from public.expedition_runs
    where discord_id = 't_rescue' and tier = 'rescue' order by id desc limit 1),
  null,
  'a rescue that found its card is not marked missed');

select * from finish();
rollback;
