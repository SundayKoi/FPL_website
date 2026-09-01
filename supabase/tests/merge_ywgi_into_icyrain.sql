-- One-off: fold YWGI#Rain INTO Icy Rain#YWGI (2026-09).
--
-- Use this INSTEAD OF rename_ywgi_to_icyrain.sql. That script refused, and it
-- was right to:
--
--     Both identities exist in raw_stats (YWGI#Rain: 28, Icy Rain#YWGI: 2)
--
-- That is not two people. It is one person whose history got split: he
-- renamed, an ingest ran, and the ingest keys on summoner_name — so the two
-- games played since the rename landed under the new identity while the 28
-- before it stayed under the old one. A plain rename cannot fix that, because
-- renaming the old rows would collide with the new ones. This merges them.
--
-- WHICH SIDE WINS, AND WHY IT DIFFERS PER TABLE:
--
--   raw_stats        Rows are per game. The two sides describe DIFFERENT
--                    games, so almost everything just moves across. The only
--                    exception is a match ingested under both names — a true
--                    duplicate of one game — where the new row is kept and
--                    the old dropped.
--   everything else  The OLD identity is the one carrying the history and the
--                    ownership: the claim and its profile_id, the art prefs,
--                    the roster membership, the pool row the identity link
--                    hangs off. Anything that appeared under the new identity
--                    in the last few days is a stub the ingest or a card
--                    build created. The OLD row wins and the stub is removed.
--
-- Ownership anchors are still never touched: card_claims.profile_id,
-- card_inventory.discord_id, player_identity_links, roster_memberships.
--
-- ⚠ AFTER THIS, RE-RUN THE EDITION ARCHIVE for any week that already got
-- archived while the identity was split — the "Archive card edition" workflow
-- with "Rebuild every week" ticked. Until then the archive holds a card built
-- from 28 games and possibly a second one built from 2, and packs mint from
-- the archive. PART 1 below prints exactly which weeks are affected.
--
-- Run PART 1 first. Read it. Then PART 2.

-- ═══════════════════════════════════════════════════════════════════════
-- PART 1 — LOOK, DON'T TOUCH. Confirm this is one person, not two.
-- ═══════════════════════════════════════════════════════════════════════

-- The two sides, side by side. If this is the same person, the new rows are
-- RECENT and the old rows STOP right where the new ones start.
select 'YWGI#Rain (old)' as identity, count(*) as games,
       min(game_date) as first_game, max(game_date) as last_game,
       count(distinct team_name) as teams, string_agg(distinct team_name, ', ') as team_names
  from public.raw_stats where lower(summoner_name) = 'ywgi' and lower(tag) = 'rain'
union all
select 'Icy Rain#YWGI (new)', count(*),
       min(game_date), max(game_date),
       count(distinct team_name), string_agg(distinct team_name, ', ')
  from public.raw_stats where lower(summoner_name) = 'icy rain' and lower(tag) = 'ywgi';

-- ⚠ THE ONE THAT DECIDES IT. Any match id appearing under BOTH names is the
-- same game ingested twice, which only happens for one person. Any row here
-- is confirmation. An empty result is fine too — it just means the new games
-- are simply newer.
select r_old.match_id, r_old.game_date, r_old.team_name,
       r_old.champion as champ_as_ywgi, r_new.champion as champ_as_icyrain
  from public.raw_stats r_old
  join public.raw_stats r_new on r_new.match_id = r_old.match_id
 where lower(r_old.summoner_name) = 'ywgi' and lower(r_old.tag) = 'rain'
   and lower(r_new.summoner_name) = 'icy rain' and lower(r_new.tag) = 'ywgi';

-- ⚠ AND THE ONE THAT WOULD STOP IT. If these two ever played in the SAME
-- game as two different people, they are two different people. Must be empty.
select r_old.match_id, r_old.game_date, r_old.team_name as ywgi_team,
       r_new.team_name as icyrain_team, r_old.champion, r_new.champion
  from public.raw_stats r_old
  join public.raw_stats r_new on r_new.match_id = r_old.match_id
 where lower(r_old.summoner_name) = 'ywgi' and lower(r_old.tag) = 'rain'
   and lower(r_new.summoner_name) = 'icy rain' and lower(r_new.tag) = 'ywgi'
   and r_old.team_name is distinct from r_new.team_name;

-- What exists on each side elsewhere. The new side should be thin — stubs.
select 'riot_accounts' as tbl,
       count(*) filter (where lower(game_name) = 'ywgi' and lower(tag_line) = 'rain') as old_side,
       count(*) filter (where lower(game_name) = 'icy rain' and lower(tag_line) = 'ywgi') as new_side
  from public.riot_accounts
union all select 'player_pool',
       count(*) filter (where normalized_name = 'ywgi'),
       count(*) filter (where normalized_name = 'icy rain') from public.player_pool
union all select 'card_claims',
       count(*) filter (where lower(summoner_name) = 'ywgi' and lower(tag) = 'rain'),
       count(*) filter (where lower(summoner_name) = 'icy rain' and lower(tag) = 'ywgi')
  from public.card_claims
union all select 'card_art_prefs',
       count(*) filter (where lower(summoner_name) = 'ywgi' and lower(tag) = 'rain'),
       count(*) filter (where lower(summoner_name) = 'icy rain' and lower(tag) = 'ywgi')
  from public.card_art_prefs
union all select 'card_inventory',
       count(*) filter (where slug = 'ywgi-rain'),
       count(*) filter (where slug = 'icy-rain-ywgi') from public.card_inventory
union all select 'card_editions',
       count(*) filter (where slug = 'ywgi-rain'),
       count(*) filter (where slug = 'icy-rain-ywgi') from public.card_editions
union all select 'card_snapshots',
       count(*) filter (where slug = 'ywgi-rain'),
       count(*) filter (where slug = 'icy-rain-ywgi') from public.card_snapshots
order by tbl;

-- Weeks whose archived edition was built from a SPLIT player. Re-archive
-- these after PART 2 — or just tick "Rebuild every week", which covers them.
select distinct edition_week, season
  from public.card_editions
 where slug in ('ywgi-rain', 'icy-rain-ywgi')
 order by edition_week;


-- ═══════════════════════════════════════════════════════════════════════
-- PART 2 — THE MERGE.
-- ═══════════════════════════════════════════════════════════════════════

begin;

-- Stop if the two ever appeared in one game on opposite sides. That is the
-- single fact that would make them two people, and it is worth one more check
-- from inside the transaction rather than trusting that PART 1 was read.
do $$
declare v_conflict int;
begin
  select count(*) into v_conflict
    from public.raw_stats r_old
    join public.raw_stats r_new on r_new.match_id = r_old.match_id
   where lower(r_old.summoner_name) = 'ywgi' and lower(r_old.tag) = 'rain'
     and lower(r_new.summoner_name) = 'icy rain' and lower(r_new.tag) = 'ywgi'
     and r_old.team_name is distinct from r_new.team_name;
  if v_conflict > 0 then
    raise exception
      'YWGI#Rain and Icy Rain#YWGI appear in % game(s) on DIFFERENT teams. These are two people. Nothing changed.',
      v_conflict;
  end if;
end $$;

-- ── raw_stats ─────────────────────────────────────────────────────────
-- A match ingested under both names is one game recorded twice. Drop the old
-- copy first so the rename below cannot trip raw_stats_match_summoner_key.
delete from public.raw_stats r_old
 where lower(r_old.summoner_name) = 'ywgi' and lower(r_old.tag) = 'rain'
   and exists (
     select 1 from public.raw_stats r_new
      where r_new.match_id = r_old.match_id
        and lower(r_new.summoner_name) = 'icy rain'
        and lower(r_new.tag) = 'ywgi'
   );

update public.raw_stats
   set summoner_name = 'Icy Rain', tag = 'YWGI'
 where lower(summoner_name) = 'ywgi' and lower(tag) = 'rain';

-- ── Identity ──────────────────────────────────────────────────────────
-- The OLD riot_accounts row is the one roster_memberships points at, so it is
-- the row that must survive. Any row the ingest made under the new name is a
-- stub; remove it only if nothing references it.
delete from public.riot_accounts ra
 where lower(ra.game_name) = 'icy rain' and lower(ra.tag_line) = 'ywgi'
   and exists (
     select 1 from public.riot_accounts old
      where lower(old.game_name) = 'ywgi' and lower(old.tag_line) = 'rain'
   )
   and not exists (select 1 from public.roster_memberships rm where rm.riot_account_id = ra.id);

update public.riot_accounts
   set game_name = 'Icy Rain',
       tag_line = 'YWGI',
       display_name = case
         when display_name is null then null
         when display_name like '%#%' then 'Icy Rain#YWGI'
         else 'Icy Rain'
       end
 where lower(game_name) = 'ywgi' and lower(tag_line) = 'rain';

-- Same shape for the canonical pool: the OLD row is the one the identity link
-- and players.canonical_player_id hang off.
delete from public.player_pool pp
 where pp.normalized_name = 'icy rain'
   and exists (select 1 from public.player_pool old
                where old.normalized_name = 'ywgi' and old.season_key = pp.season_key)
   and not exists (select 1 from public.player_identity_links l where l.player_pool_id = pp.id)
   and not exists (select 1 from public.players p where p.canonical_player_id = pp.id);

update public.player_pool
   set display_name = case when display_name like '%#%' then 'Icy Rain#YWGI' else 'Icy Rain' end,
       normalized_name = 'icy rain'
 where normalized_name = 'ywgi';

update public.players
   set display_name = case when display_name like '%#%' then 'Icy Rain#YWGI' else 'Icy Rain' end
 where lower(trim(split_part(display_name, '#', 1))) = 'ywgi';

update public.free_agency_avg_bids
   set player_name = 'Icy Rain'
 where lower(trim(split_part(player_name, '#', 1))) = 'ywgi'
   and not exists (select 1 from public.free_agency_avg_bids b where b.player_name = 'Icy Rain');

-- ── Cards ─────────────────────────────────────────────────────────────
-- Art prefs and the claim are keyed (season, summoner_name, tag). The OLD row
-- holds the real content — the skin, the motto, the profile_id that IS the
-- discord link. Clear any new-side stub, then move the old row onto the key.
delete from public.card_art_prefs new_row
 where lower(new_row.summoner_name) = 'icy rain' and lower(new_row.tag) = 'ywgi'
   and exists (select 1 from public.card_art_prefs old
                where lower(old.summoner_name) = 'ywgi' and lower(old.tag) = 'rain'
                  and old.season = new_row.season);

update public.card_art_prefs
   set summoner_name = 'Icy Rain', tag = 'YWGI'
 where lower(summoner_name) = 'ywgi' and lower(tag) = 'rain';

delete from public.card_claims new_row
 where lower(new_row.summoner_name) = 'icy rain' and lower(new_row.tag) = 'ywgi'
   and exists (select 1 from public.card_claims old
                where lower(old.summoner_name) = 'ywgi' and lower(old.tag) = 'rain'
                  and old.season = new_row.season);

update public.card_claims
   set summoner_name = 'Icy Rain', tag = 'YWGI'
 where lower(summoner_name) = 'ywgi' and lower(tag) = 'rain';

update public.signature_invites
   set summoner_name = 'Icy Rain',
       tag = 'YWGI',
       display_name = case when display_name like '%#%' then 'Icy Rain#YWGI' else 'Icy Rain' end
 where lower(summoner_name) = 'ywgi' and lower(tag) = 'rain';

-- Owned copies: no unique key on slug, so both sides simply become one slug.
-- Nothing is dropped here — every copy anyone pulled survives.
update public.card_inventory
   set slug = 'icy-rain-ywgi',
       player_name = 'Icy Rain',
       card = jsonb_set(jsonb_set(card, '{name}', '"Icy Rain"'), '{slug}', '"icy-rain-ywgi"')
 where slug = 'ywgi-rain';

update public.card_inventory
   set card = jsonb_set(jsonb_set(card, '{moment,summonerName}', '"Icy Rain"'),
                        '{moment,playerSlug}', '"icy-rain-ywgi"')
 where card -> 'moment' ->> 'playerSlug' = 'ywgi-rain';

-- The archive is keyed (season, edition_week, slug), so a week that already
-- archived BOTH halves has two rows that cannot merge by renaming. Drop the
-- old-slug row for those weeks; the whole week gets rebuilt from the merged
-- stats when you re-run the edition archive, which the header insists on.
delete from public.card_editions old_row
 where old_row.slug = 'ywgi-rain'
   and exists (select 1 from public.card_editions new_row
                where new_row.slug = 'icy-rain-ywgi'
                  and new_row.season = old_row.season
                  and new_row.edition_week = old_row.edition_week);

update public.card_editions
   set slug = 'icy-rain-ywgi',
       player_name = 'Icy Rain',
       card = jsonb_set(jsonb_set(card, '{name}', '"Icy Rain"'), '{slug}', '"icy-rain-ywgi"')
 where slug = 'ywgi-rain';

update public.card_editions
   set card = jsonb_set(jsonb_set(card, '{moment,summonerName}', '"Icy Rain"'),
                        '{moment,playerSlug}', '"icy-rain-ywgi"')
 where card -> 'moment' ->> 'playerSlug' = 'ywgi-rain';

-- card_snapshots is (season, slug): the new side is a card built from 2 games
-- and the old from 28, so the old is the better row to keep — and the next
-- drop overwrites it from merged stats regardless.
delete from public.card_snapshots new_row
 where new_row.slug = 'icy-rain-ywgi'
   and exists (select 1 from public.card_snapshots old
                where old.slug = 'ywgi-rain' and old.season = new_row.season);

update public.card_snapshots set slug = 'icy-rain-ywgi' where slug = 'ywgi-rain';

-- (season, slug, taken_at) — two entries at the same instant would be the
-- same reading recorded twice.
delete from public.card_rating_history new_row
 where new_row.slug = 'icy-rain-ywgi'
   and exists (select 1 from public.card_rating_history old
                where old.slug = 'ywgi-rain' and old.season = new_row.season
                  and old.taken_at = new_row.taken_at);

update public.card_rating_history set slug = 'icy-rain-ywgi' where slug = 'ywgi-rain';

update public.card_moments
   set slug = 'icy-rain-ywgi', summoner_name = 'Icy Rain', tag = 'YWGI'
 where slug = 'ywgi-rain'
    or (lower(summoner_name) = 'ywgi' and lower(tag) = 'rain');

update public.card_chases
   set criteria = jsonb_set(criteria, '{slug}', '"icy-rain-ywgi"')
 where criteria ->> 'slug' = 'ywgi-rain';

-- ── Daily games ───────────────────────────────────────────────────────
-- Display fields only; player_slug is a primary key and a foreign-key target
-- with no ON UPDATE CASCADE, and every future puzzle regenerates from the
-- live cards anyway.
update public.fpldle_daily_candidates
   set player_name = 'Icy Rain', player_tag = 'YWGI'
 where lower(player_name) = 'ywgi' and lower(player_tag) = 'rain';

update public.box_score_daily_candidates
   set player_name = 'Icy Rain', player_tag = 'YWGI'
 where lower(player_name) = 'ywgi' and lower(player_tag) = 'rain';

update public.higher_lower_daily_candidates
   set player_name = 'Icy Rain', card = jsonb_set(card, '{name}', '"Icy Rain"')
 where player_slug = 'ywgi-rain' and player_name <> 'Icy Rain';

-- ── Report ────────────────────────────────────────────────────────────
-- One identity, all the games. `games` should be the two sides added
-- together, less any duplicate match the merge collapsed.
select 'raw_stats' as tbl, count(*) as rows_now,
       min(game_date)::text as first_game, max(game_date)::text as last_game
  from public.raw_stats where summoner_name = 'Icy Rain'
union all select 'card_inventory', count(*), null, null
  from public.card_inventory where slug = 'icy-rain-ywgi'
union all select 'card_editions', count(*), null, null
  from public.card_editions where slug = 'icy-rain-ywgi'
union all select 'card_claims', count(*), null, null
  from public.card_claims where summoner_name = 'Icy Rain'
order by tbl;

-- Nothing may remain on the old identity.
select 'raw_stats' as tbl, count(*) as leftovers
  from public.raw_stats where lower(summoner_name) = 'ywgi' and lower(tag) = 'rain'
union all select 'riot_accounts', count(*)
  from public.riot_accounts where lower(game_name) = 'ywgi' and lower(tag_line) = 'rain'
union all select 'player_pool', count(*) from public.player_pool where normalized_name = 'ywgi'
union all select 'card_claims', count(*)
  from public.card_claims where lower(summoner_name) = 'ywgi' and lower(tag) = 'rain'
union all select 'card_art_prefs', count(*)
  from public.card_art_prefs where lower(summoner_name) = 'ywgi' and lower(tag) = 'rain'
union all select 'card_inventory', count(*) from public.card_inventory where slug = 'ywgi-rain'
union all select 'card_editions', count(*) from public.card_editions where slug = 'ywgi-rain'
union all select 'card_snapshots', count(*) from public.card_snapshots where slug = 'ywgi-rain'
union all select 'card_rating_history', count(*) from public.card_rating_history where slug = 'ywgi-rain'
union all select 'card_moments', count(*) from public.card_moments where slug = 'ywgi-rain'
order by tbl;

-- The discord link, still his.
select c.season, c.summoner_name, c.tag, c.status,
       p.display_name as claimed_by, p.discord_id
  from public.card_claims c
  join public.profiles p on p.id = c.profile_id
 where c.summoner_name = 'Icy Rain';

commit;
