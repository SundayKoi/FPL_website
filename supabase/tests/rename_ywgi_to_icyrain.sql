-- One-off: Riot rename YWGI#Rain → Icy Rain#YWGI (2026-09).
--
-- Same person, same account — but unlike the Archêr rename, THE TAG MOVED
-- TOO, and it moved to the old game name. That is the whole hazard here:
--
--     old:  game_name YWGI      tag Rain
--     new:  game_name Icy Rain  tag YWGI
--
-- So a match on the name alone, or the tag alone, is not safe. `tag = 'ywgi'`
-- selects nothing before this runs and selects THIS PLAYER after it, which
-- would make a second run reverse or corrupt the first. Every statement below
-- matches on the OLD PAIR (game_name = 'ywgi' AND tag = 'rain'). That makes
-- the whole script idempotent for free: after it runs, nothing matches, and
-- re-running is a no-op rather than a second rename.
--
-- The card slug follows cardSlug(name, tag) — the space becomes a hyphen:
--     ywgi-rain  →  icy-rain-ywgi
--
-- Ownership anchors are never touched, which is what keeps the discord link
-- and the collection intact: card_claims.profile_id, card_inventory
-- .discord_id, player_identity_links (keyed by player_pool id), and
-- roster_memberships (keyed by riot_accounts id) all stay exactly as they are.
--
-- Run PART 1 first and read it. Then PART 2 as one script.
--
-- ⚠ After this, the OLD card url (/card/ywgi-rain) stops resolving — cards are
-- built from raw_stats, so the slug follows the name. Any Discord post already
-- made linking the old slug will 404. Same as the last rename; nothing to fix,
-- just don't be surprised.
--
-- ⚠ If an old week's stats are ever RE-INGESTED after this, they re-insert
-- under the old name (the ingest keys on match_id + summoner_name). Re-run
-- this script afterwards to fold them back in.

-- ═══════════════════════════════════════════════════════════════════════
-- PART 1 — LOOK, DON'T TOUCH.
-- ═══════════════════════════════════════════════════════════════════════

-- Who is there under the old identity, and — the thing worth checking twice —
-- is anyone ALREADY sitting on the new one? A second account named Icy Rain,
-- or another player tagged #YWGI, would turn this rename into a merge.
select 'raw_stats (old)' as where_, count(*) as rows
  from public.raw_stats where lower(summoner_name) = 'ywgi' and lower(tag) = 'rain'
union all select 'raw_stats (NEW — must be 0)', count(*)
  from public.raw_stats where lower(summoner_name) = 'icy rain'
union all select 'anyone else tagged #ywgi (must be 0)', count(*)
  from public.raw_stats where lower(tag) = 'ywgi'
union all select 'riot_accounts (old)', count(*)
  from public.riot_accounts where lower(game_name) = 'ywgi' and lower(tag_line) = 'rain'
union all select 'card_inventory (old slug)', count(*)
  from public.card_inventory where slug = 'ywgi-rain'
union all select 'card_inventory (NEW slug — must be 0)', count(*)
  from public.card_inventory where slug = 'icy-rain-ywgi'
union all select 'card_editions (old slug)', count(*)
  from public.card_editions where slug = 'ywgi-rain'
union all select 'card_claims (old)', count(*)
  from public.card_claims where lower(summoner_name) = 'ywgi' and lower(tag) = 'rain'
order by where_;

-- The claim, end to end. Note the discord id — it must be the same one after.
select c.season, c.summoner_name, c.tag, c.status,
       p.display_name as claimed_by, p.discord_id
  from public.card_claims c
  join public.profiles p on p.id = c.profile_id
 where lower(c.summoner_name) = 'ywgi' and lower(c.tag) = 'rain';


-- ═══════════════════════════════════════════════════════════════════════
-- PART 2 — THE RENAME.
-- ═══════════════════════════════════════════════════════════════════════

begin;

-- Two different situations look alike from here, and only one is a problem.
--
--   OLD gone, NEW present   -> this already ran. Every update below matches
--                              on the old pair and finds nothing, so the
--                              script is a no-op. Say so and carry on.
--   OLD present AND NEW present -> two identities coexist, which means the
--                              new one belongs to somebody else. Folding
--                              them together is a MERGE, a different job
--                              with a different script, and doing it by
--                              accident is very hard to unpick. Stop.
do $$
declare
  v_old int;
  v_new int;
  v_old_cards int;
  v_new_cards int;
begin
  select count(*) into v_old from public.raw_stats
   where lower(summoner_name) = 'ywgi' and lower(tag) = 'rain';
  select count(*) into v_new from public.raw_stats
   where lower(summoner_name) = 'icy rain' and lower(tag) = 'ywgi';
  select count(*) into v_old_cards from public.card_inventory where slug = 'ywgi-rain';
  select count(*) into v_new_cards from public.card_inventory where slug = 'icy-rain-ywgi';

  if v_old > 0 and v_new > 0 then
    raise exception
      'Both identities exist in raw_stats (YWGI#Rain: % row(s), Icy Rain#YWGI: % row(s)). That is a merge, not a rename. Nothing changed.',
      v_old, v_new;
  end if;
  if v_old_cards > 0 and v_new_cards > 0 then
    raise exception
      'Both slugs exist in card_inventory (ywgi-rain: %, icy-rain-ywgi: %). That is a merge, not a rename. Nothing changed.',
      v_old_cards, v_new_cards;
  end if;
  if v_old = 0 and v_old_cards = 0 then
    raise notice 'Nothing under the old identity — this already ran. The statements below are no-ops.';
  end if;
end $$;

-- ── The source of truth ───────────────────────────────────────────────
-- Every stats view (aggregates, records, game log) and the nightly card
-- build derive from raw_stats, so this one update moves the whole stats
-- surface and the card with it.
update public.raw_stats
   set summoner_name = 'Icy Rain', tag = 'YWGI'
 where lower(summoner_name) = 'ywgi' and lower(tag) = 'rain';

-- ── Identity ──────────────────────────────────────────────────────────
-- Roster identity used by captain moderation (can_moderate_card joins on
-- lower(game_name), lower(tag_line)). The row id never changes, so
-- roster_memberships stays attached without being touched.
update public.riot_accounts
   set game_name = 'Icy Rain',
       tag_line = 'YWGI',
       display_name = case
         when display_name is null then null
         when display_name like '%#%' then 'Icy Rain#YWGI'
         else 'Icy Rain'
       end
 where lower(game_name) = 'ywgi' and lower(tag_line) = 'rain';

-- Canonical pool (display keeps the site convention: Name#tag, or the bare
-- name if that is what the row held).
update public.player_pool
   set display_name = case when display_name like '%#%' then 'Icy Rain#YWGI' else 'Icy Rain' end,
       normalized_name = 'icy rain'
 where normalized_name = 'ywgi';

-- Draft rosters (players.display_name is free text in the same two shapes).
update public.players
   set display_name = case when display_name like '%#%' then 'Icy Rain#YWGI' else 'Icy Rain' end
 where lower(trim(split_part(display_name, '#', 1))) = 'ywgi';

-- Historical free-agency prices, keyed by name. Guarded: if a row somehow
-- already exists under the new name this would trip the primary key.
update public.free_agency_avg_bids
   set player_name = 'Icy Rain'
 where lower(trim(split_part(player_name, '#', 1))) = 'ywgi'
   and not exists (
     select 1 from public.free_agency_avg_bids b where b.player_name = 'Icy Rain'
   );

-- ── Cards ─────────────────────────────────────────────────────────────
-- Cosmetics follow the identity (PK is season+summoner+tag): skin, motto and
-- drawn signature all keep working under the new name.
update public.card_art_prefs
   set summoner_name = 'Icy Rain', tag = 'YWGI'
 where lower(summoner_name) = 'ywgi' and lower(tag) = 'rain';

-- The card claim IS the discord link for card editing: profile_id stays put,
-- the name it matches against moves.
update public.card_claims
   set summoner_name = 'Icy Rain', tag = 'YWGI'
 where lower(summoner_name) = 'ywgi' and lower(tag) = 'rain';

-- A pending or accepted signature invite, so a drawn autograph does not end
-- up orphaned from the player who drew it.
update public.signature_invites
   set summoner_name = 'Icy Rain',
       tag = 'YWGI',
       display_name = case when display_name like '%#%' then 'Icy Rain#YWGI' else 'Icy Rain' end
 where lower(summoner_name) = 'ywgi' and lower(tag) = 'rain';

-- Owned copies: flat columns plus the frozen card json. The rename is the one
-- thing that DOES reach frozen cards — it is the same player, and a
-- collection that splits into two people over a Riot rename is wrong in a way
-- a restatted rating would not be.
update public.card_inventory
   set slug = 'icy-rain-ywgi',
       player_name = 'Icy Rain',
       card = jsonb_set(jsonb_set(card, '{name}', '"Icy Rain"'), '{slug}', '"icy-rain-ywgi"')
 where slug = 'ywgi-rain';

-- Moment copies carry the name and slug a second time inside the plate.
update public.card_inventory
   set card = jsonb_set(jsonb_set(card, '{moment,summonerName}', '"Icy Rain"'),
                        '{moment,playerSlug}', '"icy-rain-ywgi"')
 where card -> 'moment' ->> 'playerSlug' = 'ywgi-rain';

-- Print-run archive — what packs mint from. The new slug cannot collide: the
-- guard above proved it did not exist.
update public.card_editions
   set slug = 'icy-rain-ywgi',
       player_name = 'Icy Rain',
       card = jsonb_set(jsonb_set(card, '{name}', '"Icy Rain"'), '{slug}', '"icy-rain-ywgi"')
 where slug = 'ywgi-rain';

update public.card_editions
   set card = jsonb_set(jsonb_set(card, '{moment,summonerName}', '"Icy Rain"'),
                        '{moment,playerSlug}', '"icy-rain-ywgi"')
 where card -> 'moment' ->> 'playerSlug' = 'ywgi-rain';

-- Rating journey + latest snapshot, keyed by slug.
update public.card_snapshots      set slug = 'icy-rain-ywgi' where slug = 'ywgi-rain';
update public.card_rating_history set slug = 'icy-rain-ywgi' where slug = 'ywgi-rain';

-- The moment mint ledger.
update public.card_moments
   set slug = 'icy-rain-ywgi', summoner_name = 'Icy Rain', tag = 'YWGI'
 where slug = 'ywgi-rain'
    or (lower(summoner_name) = 'ywgi' and lower(tag) = 'rain');

-- A live chase aimed at his card.
update public.card_chases
   set criteria = jsonb_set(criteria, '{slug}', '"icy-rain-ywgi"')
 where criteria ->> 'slug' = 'ywgi-rain';

-- ── Daily games ───────────────────────────────────────────────────────
-- Display fields only. player_slug is part of these tables' primary keys AND
-- the target of the puzzles' answer_slug foreign key, with no ON UPDATE
-- CASCADE — moving it would need the puzzle rows moved in the same statement,
-- for no benefit: a past puzzle is a settled record, and today's and every
-- future one is regenerated from the live cards, which now carry the new
-- name. The names are worth fixing so a replay does not show a player who no
-- longer exists.
update public.fpldle_daily_candidates
   set player_name = 'Icy Rain', player_tag = 'YWGI'
 where lower(player_name) = 'ywgi' and lower(player_tag) = 'rain';

update public.box_score_daily_candidates
   set player_name = 'Icy Rain', player_tag = 'YWGI'
 where lower(player_name) = 'ywgi' and lower(player_tag) = 'rain';

update public.higher_lower_daily_candidates
   set player_name = 'Icy Rain',
       card = jsonb_set(card, '{name}', '"Icy Rain"')
 where player_slug = 'ywgi-rain' and player_name <> 'Icy Rain';

-- ── Report ────────────────────────────────────────────────────────────
-- Rows now under the new identity.
select 'raw_stats' as tbl, count(*) as renamed from public.raw_stats where summoner_name = 'Icy Rain'
union all select 'riot_accounts', count(*) from public.riot_accounts where game_name = 'Icy Rain'
union all select 'player_pool', count(*) from public.player_pool where normalized_name = 'icy rain'
union all select 'players', count(*) from public.players where display_name in ('Icy Rain', 'Icy Rain#YWGI')
union all select 'card_art_prefs', count(*) from public.card_art_prefs where summoner_name = 'Icy Rain'
union all select 'card_claims', count(*) from public.card_claims where summoner_name = 'Icy Rain'
union all select 'signature_invites', count(*) from public.signature_invites where summoner_name = 'Icy Rain'
union all select 'card_inventory', count(*) from public.card_inventory where slug = 'icy-rain-ywgi'
union all select 'card_editions', count(*) from public.card_editions where slug = 'icy-rain-ywgi'
union all select 'card_snapshots', count(*) from public.card_snapshots where slug = 'icy-rain-ywgi'
union all select 'card_rating_history', count(*) from public.card_rating_history where slug = 'icy-rain-ywgi'
union all select 'card_moments', count(*) from public.card_moments where slug = 'icy-rain-ywgi'
order by tbl;

-- Leftovers under the old identity. Every count here must be 0.
select 'raw_stats' as tbl, count(*) as leftovers
  from public.raw_stats where lower(summoner_name) = 'ywgi' and lower(tag) = 'rain'
union all select 'riot_accounts', count(*)
  from public.riot_accounts where lower(game_name) = 'ywgi' and lower(tag_line) = 'rain'
union all select 'player_pool', count(*) from public.player_pool where normalized_name = 'ywgi'
union all select 'players', count(*)
  from public.players where lower(trim(split_part(display_name, '#', 1))) = 'ywgi'
union all select 'card_art_prefs', count(*)
  from public.card_art_prefs where lower(summoner_name) = 'ywgi' and lower(tag) = 'rain'
union all select 'card_claims', count(*)
  from public.card_claims where lower(summoner_name) = 'ywgi' and lower(tag) = 'rain'
union all select 'signature_invites', count(*)
  from public.signature_invites where lower(summoner_name) = 'ywgi' and lower(tag) = 'rain'
union all select 'card_inventory', count(*) from public.card_inventory where slug = 'ywgi-rain'
union all select 'card_editions', count(*) from public.card_editions where slug = 'ywgi-rain'
union all select 'card_snapshots', count(*) from public.card_snapshots where slug = 'ywgi-rain'
union all select 'card_rating_history', count(*) from public.card_rating_history where slug = 'ywgi-rain'
union all select 'card_moments', count(*) from public.card_moments where slug = 'ywgi-rain'
order by tbl;

-- The discord link, unchanged. Same id as PART 1 printed.
select c.season, c.summoner_name, c.tag, c.status,
       p.display_name as claimed_by, p.discord_id
  from public.card_claims c
  join public.profiles p on p.id = c.profile_id
 where c.summoner_name = 'Icy Rain';

commit;
