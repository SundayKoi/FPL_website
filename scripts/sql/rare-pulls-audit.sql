-- Rare pulls, read straight off the ledger.
--
-- When it feels like "everyone keeps pulling signed copies of the same
-- card", these are the questions to put to the data before the dice. Run
-- them in the Supabase SQL editor (read-only; nothing here writes).
--
-- The two facts that make rare pulls concentrate on the same few players,
-- neither of which is a bug:
--
--   * Ink only rolls for players who have DRAWN a signature. If six of
--     fifty players have one, every signed copy in the league is one of
--     those six.
--   * An Eclipse can only fall on a Card of the Week, the crown changes
--     hands slowly, and an Eclipse is auto-signed. So the same crowned
--     player can produce a signed one-of-one in consecutive weeks — a new
--     print each week, one Eclipse per print.
--
-- Replace 'S5' with the season code where it appears.

-- 1. Who has ink on file — the only players a signed copy can ever be of.
select summoner_name, tag, length(signature) as signature_bytes
from card_art_prefs
where season = 'S5' and signature is not null
order by summoner_name;

-- 2. Signed copies by player: how concentrated the ink is, and the rate
--    against every copy of that player pulled (expect ~1% for players with
--    ink, 0% for players without — any other number is the thing to chase).
select
  slug,
  count(*) filter (where signed) as signed_copies,
  count(*)                         as all_copies,
  round(100.0 * count(*) filter (where signed) / count(*), 2) as signed_pct,
  count(*) filter (where foil_type = 'eclipse') as eclipses
from card_inventory
where season = 'S5'
group by slug
having count(*) filter (where signed) > 0
order by signed_copies desc, all_copies desc;

-- 3. Every signed copy in pull order, with the gap to the previous one.
--    "Back to back" has a shape here: two rows seconds apart from the SAME
--    pack open share pack_open_id; two rows from different people minutes
--    apart are two packs that both hit 1%.
select
  id, discord_id, slug, edition_week, foil_type,
  acquired_at,
  pack_open_id,
  acquired_at - lag(acquired_at) over (order by acquired_at) as since_previous_signed
from card_inventory
where season = 'S5' and signed
order by acquired_at desc
limit 100;

-- 4. Every Eclipse: who, what, which week's print, and the gap between
--    them. A run of the same slug across consecutive edition_weeks is the
--    crown standing still, not the roll repeating.
select
  id, discord_id, slug, edition_week, signed, acquired_at,
  acquired_at - lag(acquired_at) over (order by acquired_at) as since_previous_eclipse
from card_inventory
where season = 'S5' and foil_type = 'eclipse'
order by acquired_at;

-- 5. How often a crowned card is pulled at all, per edition — the gate the
--    Eclipse rate rides on. Expect the Eclipse column to sit near 0.5% of
--    the crowned column once there are a few thousand crowned pulls.
select
  edition_week,
  count(*) as copies,
  count(*) filter (where (card ->> 'standout') = 'true') as crowned_pulls,
  count(*) filter (where foil_type = 'eclipse') as eclipses,
  round(
    100.0 * count(*) filter (where foil_type = 'eclipse')
    / nullif(count(*) filter (where (card ->> 'standout') = 'true'), 0),
    3
  ) as eclipse_pct_of_crowned
from card_inventory
where season = 'S5'
group by edition_week
order by edition_week;

-- 6. Duplicate copies that should not exist: the same pack open minting
--    the same print signed twice would be a bug, not luck. Expect no rows.
select pack_open_id, slug, count(*) as copies
from card_inventory
where season = 'S5' and signed and pack_open_id is not null
group by pack_open_id, slug
having count(*) > 1;
