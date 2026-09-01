-- One-off: repair fantasy lineups that fielded Imperialarcher#ezpz.
--
-- The rename script moved him everywhere the SITE reads — raw_stats, the
-- cards, the claim — but it did not reach inside fantasy_lineups.slots, a
-- jsonb column holding a snapshot of each fielded card taken at submit time.
--
-- That snapshot includes the card's SLUG, and scoring looks the week's points
-- up by slug:
--
--     slot.slug            imperialarcher-ezpz   (frozen when the lineup
--                                                 was filed)
--     weeklyScoresBySlug   archer-ezpz           (rebuilt from raw_stats,
--                                                 which the rename moved)
--
-- The two never meet. The lineup takes a 0 for that slot, and Archêr's real
-- points sit in the map with no lineup asking for them — exactly what was
-- reported.
--
-- The CODE fix ships alongside this: scoring now resolves each slot through
-- its card_inventory id, which does not move when a player is renamed, so no
-- future rename can do this again. This script repairs the rows that were
-- already written before that landed.
--
-- Run PART 1. Read it. Then PART 2. PART 3 is opt-in and involves money.

-- ═══════════════════════════════════════════════════════════════════════
-- PART 1 — LOOK, DON'T TOUCH.
-- ═══════════════════════════════════════════════════════════════════════

-- Every lineup that fielded him, what it scored, and whether it has been paid.
-- A `points` of 0 next to a week he actually played is the bug showing.
select l.week_start,
       l.discord_id,
       l.score        as lineup_score,
       l.paid_out,
       e.role_key     as role,
       e.slot ->> 'playerName' as fielded_as,
       e.slot ->> 'slug'       as slot_slug,
       (l.breakdown -> e.role_key ->> 'points')::numeric as points_awarded
  from public.fantasy_lineups l
  cross join lateral jsonb_each(l.slots) as e(role_key, slot)
 where e.slot ->> 'slug' = 'imperialarcher-ezpz'
 order by l.week_start, l.discord_id;

-- Did he actually play those weeks? If a week shows games here and 0 points
-- above, that week was mis-scored. If a week shows no games, the 0 was
-- honest and only the name needs fixing.
select date_trunc('week', game_date)::date as week_monday,
       count(*) as games,
       min(game_date) as first, max(game_date) as last
  from public.raw_stats
 where lower(summoner_name) = 'archêr' and lower(tag) = 'ezpz'
 group by 1 order by 1;


-- ═══════════════════════════════════════════════════════════════════════
-- PART 2 — FIX THE STORED ROWS. No money moves here.
-- ═══════════════════════════════════════════════════════════════════════

begin;

-- Rewrite the slot snapshot in place: same inventory id, same frozen overall
-- and edition (those are valuation, and a lineup's salary cap must stay
-- exactly as it was), new identity.
update public.fantasy_lineups l
   set slots = (
     select jsonb_object_agg(
       e.role_key,
       case when e.slot ->> 'slug' = 'imperialarcher-ezpz'
            then e.slot || jsonb_build_object('slug', 'archer-ezpz', 'playerName', 'Archêr')
            else e.slot
       end
     )
     from jsonb_each(l.slots) as e(role_key, slot)
   )
 where l.slots::text like '%imperialarcher-ezpz%';

-- The breakdown is what a manager reads back on the leaderboard. Only the
-- identity is corrected here — the POINTS stay whatever was awarded, because
-- changing those is a scoring decision and it lives in PART 3.
update public.fantasy_lineups l
   set breakdown = (
     select jsonb_object_agg(
       e.role_key,
       case when e.slot ->> 'slug' = 'imperialarcher-ezpz'
            then e.slot || jsonb_build_object('slug', 'archer-ezpz', 'playerName', 'Archêr')
            else e.slot
       end
     )
     from jsonb_each(l.breakdown) as e(role_key, slot)
   )
 where l.breakdown is not null
   and l.breakdown::text like '%imperialarcher-ezpz%';

-- Must both be 0.
select 'slots' as jsonb_col, count(*) as still_old
  from public.fantasy_lineups where slots::text like '%imperialarcher-ezpz%'
union all
select 'breakdown', count(*)
  from public.fantasy_lineups
 where breakdown is not null and breakdown::text like '%imperialarcher-ezpz%';

commit;


-- ═══════════════════════════════════════════════════════════════════════
-- PART 3 — OPT-IN. RE-SCORE THE AFFECTED WEEKS. THIS CAN MOVE MONEY.
-- ═══════════════════════════════════════════════════════════════════════
--
-- Clearing scored_at makes the next drop re-score those lineups, and with
-- PART 2 done and the code fix deployed they will finally score his real
-- points. That is the honest number. But read this first:
--
--   The payout pass skips any lineup whose paid_out is already set, so
--   nobody is paid twice and nobody's winnings are clawed back. What CAN
--   happen is that a corrected lineup now ranks into the money and gets paid
--   ON TOP of whoever was paid for that rank the first time. The prize pool
--   for those weeks would then pay out more than it should.
--
-- So there are three defensible choices, and it is a league call, not a
-- database one:
--
--   1. Leave it. Scores stay wrong for past weeks; nothing else moves.
--   2. Re-score only weeks nobody was paid for (paid_out is null). Free.
--   3. Re-score everything and settle the difference by hand.
--
-- The block below is choice 2 — the safe one. Widen the filter yourself for
-- choice 3, deliberately.

begin;

update public.fantasy_lineups l
   set score = null, breakdown = null, scored_at = null
 where l.slots::text like '%archer-ezpz%'
   and l.paid_out is null
   and l.scored_at is not null;

-- What will be re-scored on the next drop.
select week_start, discord_id, paid_out
  from public.fantasy_lineups
 where scored_at is null and slots::text like '%archer-ezpz%'
 order by week_start, discord_id;

commit;
