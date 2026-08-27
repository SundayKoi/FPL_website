-- One-off: Riot rename Imperialarcher#ezpz → Archêr#ezpz (2026-08).
--
-- Same person, same #ezpz tag, same discord (archer3258) — only the game
-- name changed, so this moves the NAME and everything derived from it (the
-- card slug becomes archer-ezpz, per cardSlug's diacritic fold) while every
-- ownership anchor stays put: card_claims.profile_id, card_inventory
-- .discord_id, and player_identity_links (keyed by player_pool id) are
-- never touched, which is exactly what keeps the discord link intact.
--
-- Run in the Supabase SQL editor as one script (single transaction).
-- Safe to re-run: every update matches on the OLD name/slug and finds
-- nothing the second time.
--
-- ⚠ If an old week's stats sheet is ever RE-INGESTED after this, it will
-- re-insert rows under the old name (the ingest keys on match_id +
-- summoner_name). Re-run this script afterwards to fold them back in.

begin;

-- Stats: every view (aggregates, records, game log) derives from raw_stats,
-- so this one update renames the whole stats surface and the nightly card
-- build with it.
update public.raw_stats
   set summoner_name = 'Archêr'
 where lower(summoner_name) = 'imperialarcher' and lower(tag) = 'ezpz';

-- Card cosmetics follow the identity (PK is season+summoner+tag): skin,
-- motto, and drawn signature all keep working under the new name.
update public.card_art_prefs
   set summoner_name = 'Archêr'
 where lower(summoner_name) = 'imperialarcher' and lower(tag) = 'ezpz';

-- The card claim IS the discord link for card editing: profile_id stays,
-- the name it matches against moves.
update public.card_claims
   set summoner_name = 'Archêr'
 where lower(summoner_name) = 'imperialarcher' and lower(tag) = 'ezpz';

-- Roster identity used by captain moderation (can_moderate_card joins on
-- lower(game_name), lower(tag_line)).
update public.riot_accounts
   set game_name = 'Archêr'
 where lower(game_name) = 'imperialarcher' and lower(tag_line) = 'ezpz';

-- Canonical pool (display keeps the site convention: Name#tag, or the
-- bare name if that's what the row held).
update public.player_pool
   set display_name = case when display_name like '%#%' then 'Archêr#ezpz' else 'Archêr' end,
       normalized_name = 'archêr'
 where normalized_name = 'imperialarcher';

-- Draft rosters (players.display_name is free text in the same shapes).
update public.players
   set display_name = case when display_name like '%#%' then 'Archêr#ezpz' else 'Archêr' end
 where lower(trim(split_part(display_name, '#', 1))) = 'imperialarcher';

-- Owned copies: flat columns plus the frozen card json. The rename is the
-- one thing that DOES reach frozen cards — it's the same player, and a
-- collection that splits into two people over a Riot rename is wrong in a
-- way a restatted rating would be.
update public.card_inventory
   set slug = 'archer-ezpz',
       player_name = 'Archêr',
       card = jsonb_set(jsonb_set(card, '{name}', '"Archêr"'), '{slug}', '"archer-ezpz"')
 where slug = 'imperialarcher-ezpz';

-- Moment copies carry the name and slug a second time inside the plate.
update public.card_inventory
   set card = jsonb_set(jsonb_set(card, '{moment,summonerName}', '"Archêr"'), '{moment,playerSlug}', '"archer-ezpz"')
 where slug = 'archer-ezpz' and card -> 'moment' is not null;

-- Print-run archive (slug is part of the PK; the new one can't collide —
-- it didn't exist before this rename).
update public.card_editions
   set slug = 'archer-ezpz',
       player_name = 'Archêr',
       card = jsonb_set(jsonb_set(card, '{name}', '"Archêr"'), '{slug}', '"archer-ezpz"')
 where slug = 'imperialarcher-ezpz';

-- Rating journey + latest snapshot, keyed by slug.
update public.card_snapshots      set slug = 'archer-ezpz' where slug = 'imperialarcher-ezpz';
update public.card_rating_history set slug = 'archer-ezpz' where slug = 'imperialarcher-ezpz';

-- The moment mint ledger.
update public.card_moments
   set slug = 'archer-ezpz', summoner_name = 'Archêr'
 where slug = 'imperialarcher-ezpz'
    or (lower(summoner_name) = 'imperialarcher' and lower(tag) = 'ezpz');

-- A chase aimed at his card, if one is live.
update public.card_chases
   set criteria = jsonb_set(criteria, '{slug}', '"archer-ezpz"')
 where criteria ->> 'slug' = 'imperialarcher-ezpz';

-- ── Report ────────────────────────────────────────────────────────────
-- Rows now under the new identity, per table.
select 'raw_stats' as tbl, count(*) as renamed from public.raw_stats where summoner_name = 'Archêr'
union all select 'card_art_prefs', count(*) from public.card_art_prefs where summoner_name = 'Archêr'
union all select 'card_claims', count(*) from public.card_claims where summoner_name = 'Archêr'
union all select 'riot_accounts', count(*) from public.riot_accounts where game_name = 'Archêr'
union all select 'player_pool', count(*) from public.player_pool where normalized_name = 'archêr'
union all select 'players', count(*) from public.players where display_name in ('Archêr', 'Archêr#ezpz')
union all select 'card_inventory', count(*) from public.card_inventory where slug = 'archer-ezpz'
union all select 'card_editions', count(*) from public.card_editions where slug = 'archer-ezpz'
union all select 'card_snapshots', count(*) from public.card_snapshots where slug = 'archer-ezpz'
union all select 'card_rating_history', count(*) from public.card_rating_history where slug = 'archer-ezpz'
union all select 'card_moments', count(*) from public.card_moments where slug = 'archer-ezpz'
order by tbl;

-- Leftovers under the old name anywhere — every count here must be 0.
select 'raw_stats' as tbl, count(*) as leftovers from public.raw_stats where lower(summoner_name) = 'imperialarcher'
union all select 'card_art_prefs', count(*) from public.card_art_prefs where lower(summoner_name) = 'imperialarcher'
union all select 'card_claims', count(*) from public.card_claims where lower(summoner_name) = 'imperialarcher'
union all select 'riot_accounts', count(*) from public.riot_accounts where lower(game_name) = 'imperialarcher'
union all select 'player_pool', count(*) from public.player_pool where normalized_name = 'imperialarcher'
union all select 'players', count(*) from public.players where lower(trim(split_part(display_name, '#', 1))) = 'imperialarcher'
union all select 'card_inventory', count(*) from public.card_inventory where slug = 'imperialarcher-ezpz'
union all select 'card_editions', count(*) from public.card_editions where slug = 'imperialarcher-ezpz'
union all select 'card_snapshots', count(*) from public.card_snapshots where slug = 'imperialarcher-ezpz'
union all select 'card_rating_history', count(*) from public.card_rating_history where slug = 'imperialarcher-ezpz'
union all select 'card_moments', count(*) from public.card_moments where slug = 'imperialarcher-ezpz'
order by tbl;

-- The discord link, end to end: the claim's profile (this should show
-- archer3258's discord id / display name, unchanged).
select c.season, c.summoner_name, c.tag, c.status,
       p.display_name as claimed_by, p.discord_id
  from public.card_claims c
  join public.profiles p on p.id = c.profile_id
 where c.summoner_name = 'Archêr';

commit;
