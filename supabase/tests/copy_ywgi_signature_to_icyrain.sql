-- One-off: carry the inked signature from YWGI#Rain to Icy Rain#YWGI.
--
-- The autograph lives in card_art_prefs.signature — a transparent PNG as a
-- data URI, keyed (season, summoner_name, tag) alongside the skin and the
-- motto. The card build reads that table live for the CURRENT name and tag
-- (src/lib/cards/queries.ts), so a signature filed under the old identity
-- simply stops being found once the player is renamed. Nothing is lost; it is
-- just filed under a name the card no longer answers to.
--
-- This copies it across without deleting anything, so it is safe to run
-- before OR after merge_ywgi_into_icyrain.sql:
--
--   merge not yet run   the old row still exists, and this fills the new one
--   merge already run   the row is already under the new identity, nothing
--                       matches, and this is a no-op
--
-- It FILLS RATHER THAN OVERWRITES. If a signature already exists under the
-- new identity — he re-inked it after renaming — that ink is his most recent
-- and it wins. PART 1 prints both so you can see which case you are in.
--
-- Copies already pulled keep the autograph they were pulled with: it is
-- frozen inside card_inventory.card, deliberately, so a signed copy stays
-- exactly as it was pulled even when the player redraws. This only affects
-- the live card and copies pulled from here on.

-- ═══════════════════════════════════════════════════════════════════════
-- PART 1 — LOOK, DON'T TOUCH.
-- ═══════════════════════════════════════════════════════════════════════

-- Signatures are ~tens of KB of base64, so print their SIZE, not the ink.
select season,
       summoner_name || '#' || tag as identity,
       skin,
       motto,
       case when signature is null then 'no signature'
            else 'signed (' || char_length(signature) || ' chars)' end as ink,
       updated_at
  from public.card_art_prefs
 where (lower(summoner_name) = 'ywgi' and lower(tag) = 'rain')
    or (lower(summoner_name) = 'icy rain' and lower(tag) = 'ywgi')
 order by season, summoner_name;


-- ═══════════════════════════════════════════════════════════════════════
-- PART 2 — CARRY IT ACROSS.
-- ═══════════════════════════════════════════════════════════════════════

begin;

-- Per season, because the key includes it: a signature inked in one season
-- belongs to that season's card and must not leak into another's.
insert into public.card_art_prefs
  (season, summoner_name, tag, skin, motto, signature, updated_by, updated_at)
select old.season, 'Icy Rain', 'YWGI', old.skin, old.motto, old.signature, old.updated_by, now()
  from public.card_art_prefs old
 where lower(old.summoner_name) = 'ywgi'
   and lower(old.tag) = 'rain'
on conflict (season, summoner_name, tag) do update
   set signature = coalesce(card_art_prefs.signature, excluded.signature),
       motto     = coalesce(card_art_prefs.motto, excluded.motto),
       -- 0 is the "no preference" default, so only fill a skin nobody chose.
       skin      = case when card_art_prefs.skin = 0 then excluded.skin else card_art_prefs.skin end,
       updated_at = now();

-- Report. The new identity should now read `signed`, at the same length the
-- old row printed in PART 1 — same ink, not a re-render.
select season,
       summoner_name || '#' || tag as identity,
       skin,
       motto,
       case when signature is null then 'no signature'
            else 'signed (' || char_length(signature) || ' chars)' end as ink
  from public.card_art_prefs
 where (lower(summoner_name) = 'ywgi' and lower(tag) = 'rain')
    or (lower(summoner_name) = 'icy rain' and lower(tag) = 'ywgi')
 order by season, summoner_name;

commit;

-- The old row is deliberately left in place. merge_ywgi_into_icyrain.sql is
-- what clears it, and running this first costs that script nothing — it
-- merges the two rows field by field rather than picking one whole.
