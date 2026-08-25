-- Why does a week-2 pack contain a player who did not play in week 2?
--
-- There are only two possible answers, and these queries separate them.
--
--   A. The ARCHIVE is wrong — card_editions holds players for a week they
--      played no games in. That is a live bug and needs a code fix.
--   B. The COPY is old — the card was pulled before the archive rebuild
--      ran, so it was minted from the pre-rebuild pool. Copies freeze at
--      mint time by design, so a pre-rebuild pull keeps the old roster
--      forever. Nothing is broken, and the next pull is correct.
--
-- Read-only. Nothing here writes. Paste into the Supabase SQL editor and
-- run the blocks one at a time. Plain SQL with the season and week written
-- out as literals — the editor is not psql, so \set would not work. Change
-- 'S5' to 'A1' for Academy, and the date to whichever week you are asking
-- about.
--
-- The slug expression mirrors cardSlug() in src/lib/cards/build.ts, TRIM
-- INCLUDED. cardSlug ends with .replace(/^-+|-+$/g, ""), and without it
-- this query reports false mismatches for any player whose name or tag is
-- not ASCII: "Zoodiac#すべて同じ" slugs to "zoodiac-" instead of "zoodiac"
-- and "ΣΠΑΡΤΙΑΤΗΣ#Sprtn" to "-sprtn" instead of "sprtn", so both show up
-- in A and A2 at once. A player appearing in BOTH lists is the signature
-- of a slug mismatch rather than a real archive fault.
--
-- The Eastern-week projection below mirrors mondayOf() in
-- src/lib/packs/week.ts exactly: raw_stats.game_date is a naive `timestamp`
-- holding UTC, and the league's week is a Monday-start EASTERN week, so a
-- Sunday 10 PM ET game (stored as Monday 03:00 UTC) belongs to the week
-- that just ended. Getting that wrong would accuse players who did play of
-- not having played. Verified against a local Postgres at all three
-- boundaries.


-- ── A. Is the archive wrong? ─────────────────────────────────────────
-- Anyone listed here is in that week's edition with NO game that week.
-- Rows returned = a real bug. No rows = the archive is correct, go to B.
select e.player_name, e.slug, e.overall, e.tier
from public.card_editions e
where e.season = 'S5'
  and e.edition_week = date '2026-08-24'
  and not exists (
    select 1
    from public.raw_stats r
    where r.season = e.season
      and trim(both '-' from lower(regexp_replace(r.summoner_name || '-' || r.tag, '[^a-zA-Z0-9]+', '-', 'g'))) = e.slug
      and date_trunc('week', (r.game_date at time zone 'UTC') at time zone 'America/New_York')::date
          = e.edition_week
  )
order by e.overall desc;


-- ── A2. The reverse, as a sanity check on the join ───────────────────
-- Players who DID play that week but are missing from the edition. Should
-- also be empty. If A and A2 both return everyone, the slug match is what
-- is broken rather than the archive — the counts will make that obvious.
select distinct r.summoner_name, r.tag
from public.raw_stats r
where r.season = 'S5'
  and date_trunc('week', (r.game_date at time zone 'UTC') at time zone 'America/New_York')::date
      = date '2026-08-24'
  and not exists (
    select 1 from public.card_editions e
    where e.season = r.season
      and e.edition_week = date '2026-08-24'
      and e.slug = trim(both '-' from lower(regexp_replace(r.summoner_name || '-' || r.tag, '[^a-zA-Z0-9]+', '-', 'g')))
  )
order by r.summoner_name;


-- ── A3. Roster sizes, week by week ───────────────────────────────────
-- What the archive thinks each week's roster is, against what actually
-- played. These two counts should match for every week.
select
  e.edition_week,
  count(*) as cards_in_edition,
  (select count(distinct r.summoner_name || '#' || r.tag)
     from public.raw_stats r
    where r.season = e.season
      and date_trunc('week', (r.game_date at time zone 'UTC') at time zone 'America/New_York')::date
          = e.edition_week) as players_who_played
from public.card_editions e
where e.season = 'S5'
group by e.season, e.edition_week
order by e.edition_week desc;


-- ── B. Or is the copy just older than the rebuild? ───────────────────
-- The rebuild finished 2026-08-25 17:22:40 UTC. Anything pulled before
-- that was minted from the old pool and is frozen that way on purpose.
-- Adjust the timestamp if you rebuild again.
select
  ci.player_name,
  ci.edition_week,
  ci.acquired_at,
  case when ci.acquired_at < timestamptz '2026-08-25 17:22:40Z'
       then 'pulled BEFORE the rebuild - frozen with the old pool'
       else 'pulled after the rebuild'
  end as explains_it
from public.card_inventory ci
where ci.season = 'S5'
  and ci.edition_week = date '2026-08-24'
order by ci.acquired_at desc
limit 50;


-- ── C. One specific player, every week they actually played ──────────
-- Put the name from whichever card looked wrong in place of the literal.
select
  date_trunc('week', (r.game_date at time zone 'UTC') at time zone 'America/New_York')::date as et_week,
  count(*) as games,
  min(r.game_date) as first_game_utc,
  max(r.game_date) as last_game_utc
from public.raw_stats r
where r.season = 'S5'
  and r.summoner_name = 'SomePlayerName'
group by 1
order by 1 desc;
