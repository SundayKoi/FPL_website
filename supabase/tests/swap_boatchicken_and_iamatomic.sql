-- One-off: Boat Chicken and I am Atomic swap teams (2026-09).
--
-- The team page moves `players.team_id` — the draft roster, which is what
-- that page renders. It is not what anything else reads:
--
--   roster_memberships     riot account -> league team, per season. THIS is
--                          the map the nightly ingest uses to stamp
--                          raw_stats.team_name, so until it moves, every
--                          future game either player plays is filed under
--                          their old team. It is also what card moderation
--                          resolves a captain against.
--   player_identity_links  the claim. league_team_id here is why a claimed
--                          player keeps showing up attached to the team they
--                          left.
--
-- Cards need no fix of their own: a card takes its team from the team_name on
-- the player's most recent game (src/lib/cards/build.ts), so once the ingest
-- is stamping the right team, the cards follow on the next build.
--
-- The two teams are NOT named anywhere below. The script reads where each
-- player currently sits and gives each the other's team, which is what makes
-- it a swap rather than two independent moves that could both land wrong.
--
-- Run PART 1 by itself first and read the output. Only run PART 2 if PART 1
-- named the two people you expect, sitting on the two teams you expect.
--
-- Safe to re-run — but note that re-running PART 2 swaps them BACK. It is a
-- swap, not an assignment. Run it once.

-- ═══════════════════════════════════════════════════════════════════════
-- PART 1 — LOOK, DON'T TOUCH. Run this on its own.
-- ═══════════════════════════════════════════════════════════════════════

-- Edit these two if the game names are spelled differently. Everything
-- below reads from here; the names appear in exactly one place on purpose.
with wanted(label, game_name) as (
  values ('player 1', 'boat chicken'),
         ('player 2', 'i am atomic')
)
select
  w.label,
  w.game_name                          as searched_for,
  ra.id                                as riot_account_id,
  ra.game_name || '#' || ra.tag_line   as found,
  rm.season,
  lt.name                              as currently_on_team
from wanted w
left join public.riot_accounts ra
  on lower(ra.game_name) = lower(w.game_name)
left join public.roster_memberships rm on rm.riot_account_id = ra.id
left join public.league_teams lt on lt.id = rm.league_team_id
order by w.label, rm.season;

-- The claim side, which is the "still shows claimed on the other team" half.
with wanted(label, game_name) as (
  values ('player 1', 'boat chicken'),
         ('player 2', 'i am atomic')
)
select
  w.label,
  pp.display_name,
  pil.league,
  pil.season,
  pil.status,
  lt.name as claim_attached_to_team
from wanted w
join public.player_pool pp
  on lower(pp.normalized_name) = lower(w.game_name)
  or lower(split_part(pp.display_name, '#', 1)) = lower(w.game_name)
left join public.player_identity_links pil on pil.player_pool_id = pp.id
left join public.league_teams lt on lt.id = pil.league_team_id
order by w.label, pil.season;

-- And the draft roster you already edited, for confirmation only. This
-- script does not write to `players`: the team page owns that table, and a
-- swap here can trip the one-player-per-role unique index mid-statement.
with wanted(label, game_name) as (
  values ('player 1', 'boat chicken'),
         ('player 2', 'i am atomic')
)
select w.label, p.display_name, p.role, d.name as draft, t.name as team_page_says
from wanted w
join public.players p
  on lower(trim(split_part(p.display_name, '#', 1))) = lower(w.game_name)
left join public.teams t on t.id = p.team_id
left join public.drafts d on d.id = p.draft_id
order by w.label, d.name;


-- ═══════════════════════════════════════════════════════════════════════
-- PART 2 — THE SWAP. Only after PART 1 looked right.
-- ═══════════════════════════════════════════════════════════════════════

begin;

-- Resolve both once, so every statement below works off the same two rows.
create temp table swap_pair on commit drop as
with wanted(label, game_name) as (
  values ('player 1', 'boat chicken'),
         ('player 2', 'i am atomic')
)
select
  w.label,
  ra.id as riot_account_id,
  pp.id as player_pool_id
from wanted w
left join public.riot_accounts ra on lower(ra.game_name) = lower(w.game_name)
left join public.player_pool pp
  on lower(pp.normalized_name) = lower(w.game_name)
  or lower(split_part(pp.display_name, '#', 1)) = lower(w.game_name);

-- Refuse to half-apply. A name that resolved to nothing, or to two people,
-- would otherwise move one player and leave the other where they were —
-- which is worse than not running at all, because the rosters would then
-- disagree with each other instead of with reality.
do $$
declare
  v_rows int;
  v_accounts int;
begin
  select count(*), count(riot_account_id) into v_rows, v_accounts from swap_pair;
  if v_rows <> 2 then
    raise exception 'Expected exactly 2 players, resolved % row(s). Fix the names in PART 1 and re-check.', v_rows;
  end if;
  if v_accounts <> 2 then
    raise exception 'One of the two names did not match a riot_accounts row. Nothing changed.';
  end if;
end $$;

-- ── The ingest's map ──────────────────────────────────────────────────
-- Each player takes the other's team, per season, and only for seasons
-- where BOTH have a membership: swapping into a season where one of them
-- has no row would silently invent a roster spot.
update public.roster_memberships rm
   set league_team_id = other.league_team_id
  from (
    select a.riot_account_id, b.league_team_id, b.season
      from swap_pair sa
      join public.roster_memberships a on a.riot_account_id = sa.riot_account_id
      join swap_pair sb on sb.label <> sa.label
      join public.roster_memberships b
        on b.riot_account_id = sb.riot_account_id and b.season = a.season
  ) as other
 where rm.riot_account_id = other.riot_account_id
   and rm.season = other.season;

-- ── The claim ─────────────────────────────────────────────────────────
-- Same rule: swap only where both sides have a link in the same league and
-- season, so the pairing stays symmetric.
update public.player_identity_links pil
   set league_team_id = other.league_team_id
  from (
    select a.player_pool_id, b.league_team_id, b.league, b.season
      from swap_pair sa
      join public.player_identity_links a on a.player_pool_id = sa.player_pool_id
      join swap_pair sb on sb.label <> sa.label
      join public.player_identity_links b
        on b.player_pool_id = sb.player_pool_id
       and b.league = a.league
       and b.season = a.season
  ) as other
 where pil.player_pool_id = other.player_pool_id
   and pil.league = other.league
   and pil.season = other.season;

-- ── Report ────────────────────────────────────────────────────────────
-- Read this before committing. Each player should now show the team the
-- OTHER one had in PART 1.
select 'roster_memberships' as surface, ra.game_name, rm.season, lt.name as now_on_team
  from swap_pair sp
  join public.riot_accounts ra on ra.id = sp.riot_account_id
  join public.roster_memberships rm on rm.riot_account_id = sp.riot_account_id
  join public.league_teams lt on lt.id = rm.league_team_id
union all
select 'player_identity_links', pp.display_name, pil.league || ' ' || pil.season, lt.name
  from swap_pair sp
  join public.player_pool pp on pp.id = sp.player_pool_id
  join public.player_identity_links pil on pil.player_pool_id = sp.player_pool_id
  left join public.league_teams lt on lt.id = pil.league_team_id
order by surface, game_name;

commit;


-- ═══════════════════════════════════════════════════════════════════════
-- PART 3 — OPTIONAL, AND PROBABLY NOT WHAT YOU WANT. History.
-- ═══════════════════════════════════════════════════════════════════════
--
-- Parts 1 and 2 fix the future: from the next ingest on, both players are
-- filed under their new teams. They do NOT touch raw_stats, so games already
-- played stay filed under the team the player was on at the time.
--
-- That is correct for a TRADE. If these two swapped teams this week, the
-- games they played before the swap really were played for their old teams,
-- and rewriting them would put a player in a team's win column for a game
-- they were not on that team for. Team records, head-to-heads and the weekly
-- stats pages all read raw_stats.
--
-- It is wrong for a MISTAKE. If they were entered on the wrong teams from
-- the start of the season, then every game so far is misfiled and this part
-- is the fix.
--
-- Only run this if it is the second case. Set the cutoff first: it is
-- deliberately an impossible date so an accidental run changes nothing.
-- Use the season's first game date to move everything, or the date of the
-- swap to move only what came after it.

begin;

do $$
declare
  -- ⚠ EDIT THIS. Rows on or after this date move; everything before stays.
  v_from date := date '9999-01-01';
  v_name_1 text := 'boat chicken';
  v_name_2 text := 'i am atomic';
  v_team_1 text;
  v_team_2 text;
  v_moved int;
begin
  if v_from > current_date then
    raise notice 'PART 3 skipped — cutoff is still the placeholder date. Nothing changed.';
    return;
  end if;

  -- Take each player's team from their most recent game before the cutoff.
  -- Reading it from the data rather than typing two team names is what stops
  -- a typo from filing a season of games under a team that never played.
  select team_name into v_team_1 from public.raw_stats
   where lower(summoner_name) = v_name_1 and game_date < v_from
   order by game_date desc limit 1;
  select team_name into v_team_2 from public.raw_stats
   where lower(summoner_name) = v_name_2 and game_date < v_from
   order by game_date desc limit 1;

  if v_team_1 is null or v_team_2 is null or v_team_1 = v_team_2 then
    raise exception 'Could not read two distinct prior teams (% / %). Nothing changed.', v_team_1, v_team_2;
  end if;

  update public.raw_stats
     set team_name = case when lower(summoner_name) = v_name_1 then v_team_2 else v_team_1 end
   where lower(summoner_name) in (v_name_1, v_name_2)
     and game_date >= v_from;
  get diagnostics v_moved = row_count;
  raise notice 'Refiled % raw_stats row(s): % -> %, % -> %.', v_moved, v_name_1, v_team_2, v_name_2, v_team_1;
end $$;

-- Read this before committing.
select summoner_name, team_name, count(*) as games, min(game_date) as first, max(game_date) as last
  from public.raw_stats
 where lower(summoner_name) in ('boat chicken', 'i am atomic')
 group by summoner_name, team_name
 order by summoner_name, first;

commit;
