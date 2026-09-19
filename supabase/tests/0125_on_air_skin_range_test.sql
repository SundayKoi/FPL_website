-- The On Air skin num runs to 200, not 99. Riot's skin nums are sparse and
-- go well past a hundred for the champions with many skins, so the original
-- 0..99 check (20261020000001) made real skins unsettable on the casters'
-- desk. 20261021000001 lifts it to the 0..200 the card-art path already
-- uses; this is that ceiling, on insert and on the desk's update.

begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(2);

insert into public.profiles (id, discord_id, display_name, is_broadcaster)
values ('00000000-0000-0000-0000-0000000e0125'::uuid, 'onair-0125', 'Caster C', true);

-- === 1. a num past the old ceiling is a setting, not an error ============
select lives_ok($$
  insert into public.on_air_casters (profile_id, champion, skin, role_label, tagline)
  values ('00000000-0000-0000-0000-0000000e0125'::uuid, 'Ahri', 150, 'Colour', 'Nine tails, one take.') $$,
  'a skin num past the old 99 ceiling is stored');

-- === 2. and 200 is still a ceiling ======================================
-- The desk upserts, so the check has to hold on the way in AND on the way
-- back through an edit.
select throws_ok($$
  update public.on_air_casters set skin = 201
   where profile_id = '00000000-0000-0000-0000-0000000e0125'::uuid $$,
  '23514', null, 'a num past 200 is refused by the check');

select * from finish();
rollback;
