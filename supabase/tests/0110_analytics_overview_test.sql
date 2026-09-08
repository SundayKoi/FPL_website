-- The staff analytics read (20261005000001). Two things are worth a test:
-- who may call it, and whether the counting is actually right — a
-- dashboard that quietly miscounts is worse than no dashboard, because
-- somebody will tune the economy off it.
--
-- The window is Eastern Mondays, so every fixture row below is placed
-- relative to now() rather than on a fixed date; the assertions are about
-- totals within the window, which no clock can move.
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

-- ── The door ─────────────────────────────────────────────────────────
select ok(not has_function_privilege('anon', 'public.analytics_overview(int)', 'execute'),
  'anon may not read the dashboard');
select ok(not has_function_privilege('authenticated', 'public.analytics_overview(int)', 'execute'),
  'a signed-in member may not read the dashboard — it carries every player''s spend');
select ok(has_function_privilege('service_role', 'public.analytics_overview(int)', 'execute'),
  'service_role may, which is how the staff page reads it');
select is(
  (select prosecdef from pg_proc where oid = 'public.analytics_overview(int)'::regprocedure),
  true,
  'security definer, so the grant above is the whole gate');
select is(
  (select provolatile from pg_proc where oid = 'public.analytics_overview(int)'::regprocedure),
  's'::"char",
  'stable: it reads and never writes');

-- ── The counting ─────────────────────────────────────────────────────
-- Measured as a DELTA around the fixtures, never as an absolute. These
-- tests run against a database that already holds real seasons of play,
-- so "three opens" is only ever true of the three inserted here.
create temporary table baseline as
select
  (select coalesce(sum((w ->> 'opens')::int), 0) from jsonb_array_elements(j -> 'packs' -> 'by_week') w)          as opens,
  (select coalesce(sum((w ->> 'god_packs')::int), 0) from jsonb_array_elements(j -> 'packs' -> 'by_week') w)      as god_packs,
  (select coalesce(sum((w ->> 'foil')::int), 0) from jsonb_array_elements(j -> 'pulls' -> 'by_week') w)           as foil,
  (select coalesce(sum((w ->> 'signed_copies')::int), 0) from jsonb_array_elements(j -> 'pulls' -> 'by_week') w)  as signed_copies,
  (select coalesce(sum((w ->> 'shiny')::int), 0) from jsonb_array_elements(j -> 'pulls' -> 'by_week') w)          as shiny,
  (select coalesce(sum((w ->> 'stattrak')::int), 0) from jsonb_array_elements(j -> 'pulls' -> 'by_week') w)       as stattrak
from (select public.analytics_overview(2) as j) r;

insert into public.betting_profiles (discord_id, balance, patron_until)
  values ('t_analytics_a', 100, now() + interval '30 days'), ('t_analytics_b', 250, null)
  on conflict (discord_id) do nothing;

insert into public.card_pack_openings (discord_id, season, source, variant, status, created_at)
  values ('t_analytics_a', 'T', 'paid', 'standard', 'fulfilled', now() - interval '1 day'),
         ('t_analytics_a', 'T', 'daily', 'standard', 'fulfilled', now() - interval '1 day'),
         ('t_analytics_b', 'T', 'paid', 'god',      'fulfilled', now() - interval '1 day'),
         -- A refunded open is not an open: the pack never happened.
         ('t_analytics_b', 'T', 'paid', 'standard', 'refunded',  now() - interval '1 day');

insert into public.card_inventory (discord_id, season, tier, foil, foil_type, signed, card, acquired_at)
  values ('t_analytics_a', 'T', 'bronze', false, null,     false, '{}'::jsonb,                          now() - interval '1 day'),
         ('t_analytics_a', 'T', 'gold',   true,  'prisma', false, '{"shiny": true}'::jsonb,             now() - interval '1 day'),
         ('t_analytics_b', 'T', 'master', true,  'ice',    true,  '{"stattrak": {"points": 3}}'::jsonb, now() - interval '1 day');

create temporary table after_fixtures as
select
  (select coalesce(sum((w ->> 'opens')::int), 0) from jsonb_array_elements(j -> 'packs' -> 'by_week') w)          as opens,
  (select coalesce(sum((w ->> 'god_packs')::int), 0) from jsonb_array_elements(j -> 'packs' -> 'by_week') w)      as god_packs,
  (select coalesce(sum((w ->> 'foil')::int), 0) from jsonb_array_elements(j -> 'pulls' -> 'by_week') w)           as foil,
  (select coalesce(sum((w ->> 'signed_copies')::int), 0) from jsonb_array_elements(j -> 'pulls' -> 'by_week') w)  as signed_copies,
  (select coalesce(sum((w ->> 'shiny')::int), 0) from jsonb_array_elements(j -> 'pulls' -> 'by_week') w)          as shiny,
  (select coalesce(sum((w ->> 'stattrak')::int), 0) from jsonb_array_elements(j -> 'pulls' -> 'by_week') w)       as stattrak
from (select public.analytics_overview(2) as j) r;

select is((select a.opens - b.opens from after_fixtures a, baseline b)::int, 3,
  'three fulfilled opens counted, the refunded one left out');
select is((select a.god_packs - b.god_packs from after_fixtures a, baseline b)::int, 1,
  'the God Pack is counted apart from the standard opens');
select is((select a.foil - b.foil from after_fixtures a, baseline b)::int, 2,
  'foils counted off the column');
select is((select a.signed_copies - b.signed_copies from after_fixtures a, baseline b)::int, 1,
  'signed counted off the signed COLUMN, not off card->autograph — the json is not where the ink is recorded');
select is((select a.shiny - b.shiny from after_fixtures a, baseline b)::int, 1,
  'a Shiny is counted as a finish, not as a parallel');
select is((select a.stattrak - b.stattrak from after_fixtures a, baseline b)::int, 1,
  'a StatTrak copy likewise');

-- Every Monday in the window is present even when nothing happened in it,
-- so the page draws a quiet week as a zero rather than closing the gap.
select is(
  (select jsonb_array_length(public.analytics_overview(6) -> 'packs' -> 'by_week')),
  6,
  'six weeks asked for, six weeks answered');

-- The argument is clamped rather than trusted: a dashboard link with
-- ?weeks=100000 must not become a full-table scan of all history.
select is(
  (select jsonb_array_length(public.analytics_overview(100000) -> 'packs' -> 'by_week')),
  52,
  'the window is capped at a year');
select is(
  (select jsonb_array_length(public.analytics_overview(0) -> 'packs' -> 'by_week')),
  1,
  'and floored at one week, so a zero cannot ask for an empty series');

-- ── The two pack anchors ─────────────────────────────────────────────
-- The trap this guards: card_pack_opens is the money/daily row and holds
-- all of history; card_pack_openings is the newer identity and knows the
-- variant and the comped opens. Counting both naively double-counts every
-- modern pack; counting either alone loses half the truth.
create temporary table pack_before as
select
  (select coalesce(sum((w ->> 'opens')::int), 0) from jsonb_array_elements(j -> 'packs' -> 'by_week') w)     as opens,
  (select coalesce(sum((w ->> 'spend')::bigint), 0) from jsonb_array_elements(j -> 'packs' -> 'by_week') w)  as spend,
  (select coalesce(sum((w ->> 'comp')::int), 0) from jsonb_array_elements(j -> 'packs' -> 'by_week') w)      as comp
from (select public.analytics_overview(2) as j) r;

-- One paid pack recorded in BOTH tables, the way every pack has been since
-- the God Packs rewrite. It is one pack.
with paid as (
  insert into public.card_pack_opens (discord_id, season, cost, opened_at)
    values ('t_analytics_a', 'T', 200, now() - interval '1 day')
  returning id
)
insert into public.card_pack_openings (discord_id, season, source, variant, status, created_at, pack_open_id)
  select 't_analytics_a', 'T', 'paid', 'god', 'fulfilled', now() - interval '1 day', id from paid;

-- And one comped pack, which has no money row and exists only in the
-- newer table — the half the old anchor cannot see.
insert into public.card_pack_openings (discord_id, season, source, variant, status, created_at, pack_open_id)
  values ('t_analytics_b', 'T', 'comp', 'standard', 'fulfilled', now() - interval '1 day', null);

create temporary table pack_after as
select
  (select coalesce(sum((w ->> 'opens')::int), 0) from jsonb_array_elements(j -> 'packs' -> 'by_week') w)     as opens,
  (select coalesce(sum((w ->> 'spend')::bigint), 0) from jsonb_array_elements(j -> 'packs' -> 'by_week') w)  as spend,
  (select coalesce(sum((w ->> 'comp')::int), 0) from jsonb_array_elements(j -> 'packs' -> 'by_week') w)      as comp
from (select public.analytics_overview(2) as j) r;

select is((select a.opens - b.opens from pack_after a, pack_before b)::int, 2,
  'a pack in both tables is ONE pack, and the comped pack is the other');
select is((select a.spend - b.spend from pack_after a, pack_before b)::bigint, 200::bigint,
  'spend comes off the money anchor once, not twice');
select is((select a.comp - b.comp from pack_after a, pack_before b)::int, 1,
  'the comped open is counted, though no money row exists for it');

-- The chase roll call names who holds each Dribb, in number order.
insert into public.card_inventory (discord_id, season, tier, foil, signed, card, acquired_at)
  values ('t_analytics_b', 'T', 'challenger', false, false, '{"dribb": {"number": 5, "of": 5}}'::jsonb, now() - interval '1 day');
select is(
  (select (d ->> 'discord_id')
     from jsonb_array_elements(public.analytics_overview(2) -> 'pulls' -> 'dribb') d
    where (d ->> 'number')::int = 5),
  't_analytics_b',
  'the Dribb roll call says which of the five is out and who has it');

select * from finish();
rollback;
