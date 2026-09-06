-- Restate the Card of the Week crowns on copies already opened.
--
-- A copy freezes its card at mint. When the archive is rebuilt with a new
-- crowning rule (scripts/archive-card-edition.ts all), every edition is
-- re-crowned, but the copies opened before the rebuild keep the crowns of
-- whatever the edition said that day — and after several mid-week
-- rebuilds a week can show three Junglers of the Week on one shelf.
--
-- This sets `standout` on every existing copy to what its CURRENT edition
-- says for the same season, week and player, and changes nothing else:
-- ratings, tier, art, ink, finishes, wear, slabs, StatTrak counts and
-- mutations all stay exactly as pulled, so nobody's card changes value.
--
-- Eclipses are skipped on purpose. A one-of-one was minted because its
-- print was crowned at the time; taking the crown off it would leave a
-- 1/1 of nothing. If an Eclipse sits on a print the current edition no
-- longer crowns, that is a decision for a person, not this script.
--
-- Copies whose player is not in their week's edition at all are also left
-- alone: there is nothing to restate them against.
--
-- Safe against the table's triggers: the provenance and curse guards
-- fire only on a change of owner, and the slab seal only refuses a
-- change to the slab or the wear, neither of which this touches.
--
-- Run the preview first; then the update; then the preview again, which
-- should return no rows.

-- === preview: which copies disagree with their edition ====================
select ci.edition_week, ci.role, ci.player_name,
       ci.card->>'standout' as copy_says, coalesce(ce.card->>'standout', 'false') as edition_says,
       count(*) as copies
from public.card_inventory ci
join public.card_editions ce
  on ce.season = ci.season and ce.edition_week = ci.edition_week and ce.slug = ci.slug
where ci.season = 'S5'
  and ci.foil_type is distinct from 'eclipse'
  and coalesce(ci.card->>'standout', 'false') <> coalesce(ce.card->>'standout', 'false')
group by 1, 2, 3, 4, 5
order by 1, 2, 3;

-- === apply =================================================================
update public.card_inventory ci
set card = jsonb_set(ci.card, '{standout}', to_jsonb(coalesce((ce.card->>'standout')::boolean, false)), true)
from public.card_editions ce
where ce.season = ci.season and ce.edition_week = ci.edition_week and ce.slug = ci.slug
  and ci.season = 'S5'
  and ci.foil_type is distinct from 'eclipse'
  and coalesce(ci.card->>'standout', 'false') <> coalesce(ce.card->>'standout', 'false');

-- === afterwards: any Eclipse now sitting on an uncrowned print ============
select ci.edition_week, ci.player_name, ci.discord_id
from public.card_inventory ci
left join public.card_editions ce
  on ce.season = ci.season and ce.edition_week = ci.edition_week and ce.slug = ci.slug
where ci.season = 'S5' and ci.foil_type = 'eclipse'
  and coalesce(ce.card->>'standout', 'false') <> 'true';
