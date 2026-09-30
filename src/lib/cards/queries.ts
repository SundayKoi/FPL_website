// Data layer for player cards. Fetches one season's stats (public tables/
// views only — share pages render for signed-out visitors) and runs every
// player through the rating engine. Cards are computed at request time, so
// they update themselves the moment the nightly ingest lands new games.
//
// Deliberately framework-free (takes any SupabaseClient, no next/headers):
// scripts/weekly-card-drop.ts runs this same code under tsx with a service
// client. The one Next-coupled input — the Weekly Standout, whose pipeline
// lives in src/lib/home/awards.ts — is passed IN via options; pages resolve
// it with fetchStandoutKey (src/lib/cards/standout.ts).
//
// Team branding, fixtures, moments and archived editions live in sibling
// modules; this file re-exports them, so every caller (and every test that
// mocks "@/lib/cards/queries") keeps one import path.

import { fetchAllPages } from "@/lib/supabase/pagination";
import type { SupabaseClient } from "@supabase/supabase-js";
import { mondayOf } from "@/lib/packs/week";
import {
  firstPlayoffWeek,
  isPlayoffWeek,
  stampSendoffs,
  weekRoster,
  type SendoffFixture,
} from "./sendoff";
import { combineSeasonRows, mergeRows } from "@/lib/stats/formulas";
import { styleYardstickFor } from "./styleYardsticks";
import { aggregateWeeklyPlayerRows, type WeeklyRawStatRow } from "@/lib/stats/weekly";
import type { GameLogRow, PlayerAggRow, RecordRow } from "@/lib/stats/types";
import {
  buildSeasonCards,
  cardPlayerKey,
  cardSlug,
  type CardGameMeta,
  type CardGameRow,
  type PlayerCardData,
} from "./build";
import { fetchSeasonFixtures } from "./fixtureQueries";
import { fetchTeamIdentity } from "./teamIdentity";

export {
  fetchCardEditionWeeks,
  fetchEditionCardBySlug,
  fetchEditionCards,
  fetchEditionWeekInfo,
  fetchRatingHistory,
  type EditionWeekInfo,
  type RatingHistoryPoint,
} from "./editionQueries";
export { fetchSeasonFixtures } from "./fixtureQueries";
export { fetchSeasonMoments, fetchWeekMoments, type LeagueMoment } from "./momentQueries";
export { backfillTeamIdentity, fetchTeamIdentity, type TeamIdentity } from "./teamIdentity";

export type CardLeague = "premier" | "academy";

/** The per-game columns a card needs. Objective and turret work is only on
 *  raw_stats — stats_player_agg has no such columns — so both build paths
 *  read it here.
 *
 *  The last line is what the style rating (styleRating.ts, S6 and A2 on)
 *  reads besides: each game's own role and clock, its lane-opponent figures
 *  at 10, and the job stats a style is graded on. A season build rates a
 *  whole split by style, so it needs them as much as the weekly build does,
 *  and a missing one silently grades that stat as absent for everyone.
 *
 *  A single string literal, line-continued with `\` rather than `+`
 *  concatenated: `+` would widen the result to `string` and defeat
 *  Supabase's column-checking `.select()` overload. */
const CARD_GAME_COLUMNS =
  "summoner_name, tag, champion, win, game_date, match_id, team_name, kills, deaths, assists, cs, \
total_damage_to_champions, dragon_kills, baron_kills, objective_damage, turret_kills, turret_damage, \
wards_killed, control_wards_bought, detector_wards_placed, damage_mitigated, \
turret_plates_destroyed, \
role, game_duration_min, damage_share_pct, damage_taken, solo_kills, time_ccing_others_s, \
effective_heal_and_shield, cs_at_10, gold_at_10, xp_at_10";

/**
 * `CARD_GAME_COLUMNS` plus every column `aggregateWeeklyPlayerRows` (see
 * `@/lib/stats/weekly`) reads. `fetchSeasonCards` gets its cohort from
 * `stats_player_agg` and only ever reads raw_stats for CardGameRow fields,
 * so the narrower list is enough there — but `fetchWeekCards` has no
 * per-week agg view to fall back on: the SAME raw rows have to double as
 * both a CardGameRow (for the card bars) and a WeeklyRawStatRow (fed into
 * aggregateWeeklyPlayerRows to build the week's own cohort). Missing a
 * column here doesn't error, it just silently zeroes that stat for every
 * player — e.g. without `game_duration_min` every per-minute rate
 * (dmg/cs/gold per min) reads as 0 for the whole cohort, flattening the
 * ratings the whole feature exists to spread out. The last line is the style
 * rating's, as in CARD_GAME_COLUMNS; the rest of what it reads the weekly
 * aggregation already needed.
 */
const WEEK_GAME_COLUMNS =
  "summoner_name, tag, champion, win, game_date, match_id, team_name, kills, deaths, assists, cs, \
total_damage_to_champions, dragon_kills, baron_kills, objective_damage, turret_kills, turret_damage, \
wards_killed, control_wards_bought, detector_wards_placed, damage_mitigated, \
turret_plates_destroyed, cs_at_10, cs_per_min, damage_per_min, damage_share_pct, damage_taken_per_min, \
double_kills, first_blood_assist, first_blood_kill, game_duration_min, gold_at_10, gold_earned, \
gold_per_min, kda_challenges, kill_participation_pct, penta_kills, quadra_kills, role, season, \
season_phase, solo_kills, triple_kills, vision_score, vision_score_per_min, xp_at_10, \
damage_taken, time_ccing_others_s, effective_heal_and_shield";

async function readOptionalPages<T>(
  read: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
): Promise<{ data: T[]; error: { message: string } | null }> {
  try {
    return { data: await fetchAllPages<T>(read), error: null };
  } catch (error) {
    return { data: [], error: { message: error instanceof Error ? error.message : "unknown source error" } };
  }
}

/** The season a league's cards rate — Premier's current season or the
 *  Academy's own code. The two leagues share every stats table and are
 *  separated by season code, so the whole card pipeline is league-agnostic
 *  once the right season is chosen. */
export async function fetchCardSeason(supabase: SupabaseClient, league: CardLeague = "premier"): Promise<string | null> {
  const { data } = await supabase
    .from("league_settings")
    .select("current_season, academy_season")
    .eq("id", 1)
    .maybeSingle();
  const settings = data as { current_season: string | null; academy_season: string | null } | null;
  return (league === "academy" ? settings?.academy_season : settings?.current_season) ?? null;
}

/** Both leagues' seasons (Premier first), deduplicated — for surfaces that
 *  span leagues, like resolving a share slug or the weekly drop. */
export async function fetchAllCardSeasons(supabase: SupabaseClient): Promise<{ league: CardLeague; season: string }[]> {
  const { data } = await supabase
    .from("league_settings")
    .select("current_season, academy_season")
    .eq("id", 1)
    .maybeSingle();
  const settings = data as { current_season: string | null; academy_season: string | null } | null;
  const seasons: { league: CardLeague; season: string }[] = [];
  if (settings?.current_season) seasons.push({ league: "premier", season: settings.current_season });
  if (settings?.academy_season && settings.academy_season !== settings.current_season) {
    seasons.push({ league: "academy", season: settings.academy_season });
  }
  return seasons;
}


/**
 * Each card's playoff run — what a Send-off prints as its record line
 * instead of the season's W-L (see `stamped` in sendoff.ts).
 *
 * The cut is the bracket's FIRST WEEK in the schedule, not `season_phase`:
 * the phase is whatever the ingest was told a game was, while the fixtures
 * are where the bracket is actually settled — and the send-off already
 * trusts them to say who fell, when, and how far they got. A season with no
 * playoff fixture yet has no run to attach and the cards pass through.
 */
function withPlayoffRuns(
  cards: PlayerCardData[],
  gameRows: CardGameRow[],
  fixtures: SendoffFixture[],
): PlayerCardData[] {
  const from = firstPlayoffWeek(fixtures);
  if (!from) return cards;
  const runs = new Map<string, { wins: number; losses: number }>();
  for (const row of gameRows) {
    if (!row.game_date || mondayOf(new Date(row.game_date)) < from) continue;
    const slug = cardSlug(row.summoner_name, row.tag);
    const run = runs.get(slug) ?? { wins: 0, losses: 0 };
    // Only a recorded win is a win; a null result is a game they did not
    // come out of ahead, and the bracket has no third outcome.
    if (row.win === true) run.wins += 1;
    else run.losses += 1;
    runs.set(slug, run);
  }
  return cards.map((card) => ({ ...card, playoffs: runs.get(card.slug) ?? null }));
}

/**
 * Every player's card for `season`, best overall first. One fetch pass for
 * the whole league: the rating engine needs the full cohort anyway (all
 * ratings are league-relative), so per-player fetching would save nothing.
 */
export async function fetchSeasonCards(
  supabase: SupabaseClient,
  season: string,
  options: { strictSource?: boolean } = {},
): Promise<PlayerCardData[]> {
  const [aggRows, gameRows, logRows, recordsResult, teamIdentity, artResult, fixtures] = await Promise.all([
    fetchAllPages<PlayerAggRow>((from, to) => supabase.from("stats_player_agg").select("*").eq("season", season)
      .order("summoner_name").order("tag").order("season_phase").range(from, to)),
    fetchAllPages<CardGameRow>((from, to) => supabase.from("raw_stats").select(CARD_GAME_COLUMNS)
      .eq("season", season).order("id").range(from, to)),
    fetchAllPages<Pick<GameLogRow, "match_id" | "duration_min" | "blue_team" | "red_team">>((from, to) => supabase.from("stats_game_log")
      .select("match_id, duration_min, blue_team, red_team").eq("season", season).order("match_id").range(from, to)),
    readOptionalPages<Pick<RecordRow, "category" | "summoner_name" | "tag">>((from, to) => supabase.from("stats_records").select("category, summoner_name, tag").eq("season", season).order("category").order("summoner_name").range(from, to)),
    fetchTeamIdentity(supabase, season, options),
    // select * on purpose: the motto column arrived in a later migration
    // than skin, and naming a missing column would fail the whole select.
    readOptionalPages<{ summoner_name: string; tag: string; art_champion?: string | null; skin: number; motto?: string | null }>((from, to) => supabase.from("card_art_prefs").select("*").eq("season", season).order("summoner_name").order("tag").range(from, to)),
    // Garnish too, by the same rule: fetchSeasonFixtures returns [] on
    // error, and cards with no playoff run attached print the season's
    // record the way they always did.
    fetchSeasonFixtures(supabase, season),
  ]);
  // Records / team art / skin prefs are garnish — a failure (e.g. the
  // card_art_prefs migration not applied yet) must not take cards down.
  if (options.strictSource && recordsResult.error) throw new Error(`Season card record source failed: ${recordsResult.error.message}`);
  if (options.strictSource && artResult.error) throw new Error(`Season card artwork source failed: ${artResult.error.message}`);
  const recordRows = recordsResult.error ? [] : ((recordsResult.data as Pick<RecordRow, "category" | "summoner_name" | "tag">[]) ?? []);
  const artRows = artResult.error ? [] : ((artResult.data as { summoner_name: string; tag: string; art_champion?: string | null; skin: number; motto?: string | null }[]) ?? []);

  // The view emits one row per (season, phase) — merge Regular+Playoffs
  // into a single season row per player, same as the stats tabs do.
  const cohort = mergeRows(
    aggRows,
    (row) => cardPlayerKey(row.summoner_name, row.tag),
    (group) => combineSeasonRows(group, season),
  );

  const gamesByPlayer = new Map<string, CardGameRow[]>();
  for (const game of gameRows) {
    const key = cardPlayerKey(game.summoner_name, game.tag);
    const list = gamesByPlayer.get(key) ?? [];
    list.push(game);
    gamesByPlayer.set(key, list);
  }

  const gameLog = new Map<string, CardGameMeta>();
  for (const log of logRows) {
    gameLog.set(log.match_id, { durationMin: log.duration_min, blueTeam: log.blue_team, redTeam: log.red_team });
  }

  const recordsByPlayer = new Map<string, string[]>();
  for (const record of recordRows) {
    const key = cardPlayerKey(record.summoner_name, record.tag);
    const list = recordsByPlayer.get(key) ?? [];
    if (!list.includes(record.category)) list.push(record.category);
    recordsByPlayer.set(key, list);
  }

  const artPrefs = new Map<string, { artChampion: string | null; skin: number; motto: string | null }>();
  for (const art of artRows) {
    artPrefs.set(cardPlayerKey(art.summoner_name, art.tag), {
      artChampion: art.art_champion ?? null,
      skin: art.skin,
      motto: art.motto ?? null,
    });
  }

  return withPlayoffRuns(
    buildSeasonCards({
      cohort,
      gamesByPlayer,
      gameLog,
      recordsByPlayer,
      teamImages: teamIdentity.badges,
      teamAbbrs: teamIdentity.abbrs,
      artPrefs,
      yardstick: styleYardstickFor(season),
    }),
    gameRows,
    fixtures,
  );
}

/**
 * The Monday of the most recent week this season played, or null before
 * any game is ingested.
 *
 * Derived from the last game rather than from today's date: early in a
 * week no games have been played yet, and "this week" would then be an
 * empty cohort with no cards in it at all. The last game's week is always
 * a week that has something to show, and it rolls over on its own the
 * moment Monday night's ingest lands.
 */
export async function fetchLatestGameWeek(supabase: SupabaseClient, season: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("raw_stats")
    .select("game_date")
    .eq("season", season)
    .not("game_date", "is", null)
    .order("game_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const { game_date: gameDate } = data as { game_date: string | null };
  return gameDate ? mondayOf(new Date(gameDate)) : null;
}

/**
 * The cards as this week's drop rates them — the live view everywhere a
 * card is shown.
 *
 * Cards used to be season-cumulative, which averaged a player's best week
 * together with their worst and pulled everyone toward the middle. A drop
 * is a weekly event, so the rating it publishes is a weekly one.
 *
 * Falls back to the season build only when no game has been ingested yet;
 * that is a season with no weeks rather than a preference.
 *
 * Frozen copies are untouched by any of this. A card someone already
 * pulled keeps the numbers it was pulled with, which is the whole point of
 * freezing it.
 */
export async function fetchCurrentWeekCards(supabase: SupabaseClient, season: string): Promise<PlayerCardData[]> {
  const week = await fetchLatestGameWeek(supabase, season);
  if (!week) {
    return (await fetchSeasonCards(supabase, season)).map((card) => ({ ...card, snapshotWeek: null }));
  }
  // During the bracket the hub, browse, compare and the teams page show the
  // week the way the week's edition prints it (weekRoster): a player whose
  // split has ended wears the season-rated send-off their team's exit
  // minted, because rating a knocked-out finalist against the nine other
  // people who played the final is how a runner-up ends up with a bad card
  // for reaching the final — and everyone still in the bracket is one of
  // the week's own cards, the way a regular-season week shows the people
  // who played it. Both builds are read: the fallen come out of the season
  // one, the rest out of the week's.
  const fixtures = await fetchSeasonFixtures(supabase, season);
  if (isPlayoffWeek(fixtures, week)) {
    const [seasonBuild, weekBuild] = await Promise.all([
      fetchSeasonCards(supabase, season),
      fetchWeekCards(supabase, season, week),
    ]);
    return weekRoster(seasonBuild, weekBuild, fixtures, week).map((card) => ({ ...card, snapshotWeek: week }));
  }
  const cards = await fetchWeekCards(supabase, season, week);
  // A week that ingested no usable rows would otherwise blank every card
  // surface at once; the season build is a worse answer than the week's,
  // but it is a far better one than nothing.
  if (cards.length > 0) return cards.map((card) => ({ ...card, snapshotWeek: week }));
  return (await fetchSeasonCards(supabase, season)).map((card) => ({ ...card, snapshotWeek: null }));
}

/**
 * Every player's card for ONE week, rated against that week's cohort.
 *
 * The sibling of fetchSeasonCards, and the builder a weekly drop archives:
 * a card stops meaning "how good is this player this season" and starts
 * meaning "how did they play that week". Ratings are cohort-relative, so a
 * narrower window spreads them — which is the point, and why the curve was
 * retuned alongside this.
 *
 * `week` is the Monday (YYYY-MM-DD) of an EASTERN-calendar week — the same
 * week `mondayOf` (src/lib/packs/week.ts) stamps on pack pulls and fantasy
 * lineups. raw_stats.game_date is an instant, and ET runs 4-5 hours behind
 * UTC, so the query cannot express that week as a date range: a UTC
 * [Monday, next Monday) window would hand a 23:00 ET Sunday game to the
 * FOLLOWING edition, permanently, because editions freeze at mint. Instead
 * the fetch pulls a deliberately WIDER UTC window (padded a day either
 * side, which no ET offset can escape) and `mondayOf` itself trims it —
 * one definition of a week, not a second one written in query params.
 * A game at 23:00 ET on Sunday therefore belongs to the week that just
 * ended, and Monday's opener starts the next one.
 */
export async function fetchWeekCards(
  supabase: SupabaseClient,
  season: string,
  week: string,
): Promise<PlayerCardData[]> {
  // Padding, not precision: the exact boundary is mondayOf's job below.
  const start = new Date(`${week}T00:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() - 1);
  const end = new Date(`${week}T00:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() + 8);

  const [gameRows, logRows, teamIdentity, artResult] = await Promise.all([
    fetchAllPages<CardGameRow>((from, to) => supabase.from("raw_stats").select(WEEK_GAME_COLUMNS)
      .eq("season", season).gte("game_date", start.toISOString()).lt("game_date", end.toISOString())
      .order("id").range(from, to)),
    fetchAllPages<Pick<GameLogRow, "match_id" | "duration_min" | "blue_team" | "red_team">>((from, to) => supabase.from("stats_game_log")
      .select("match_id, duration_min, blue_team, red_team").eq("season", season)
      .gte("game_date", start.toISOString()).lt("game_date", end.toISOString())
      .order("match_id").range(from, to)),
    fetchTeamIdentity(supabase, season),
    supabase.from("card_art_prefs").select("*").eq("season", season),
  ]);

  // Trim the padded UTC window down to the Eastern week. An empty result
  // after this is the legitimate quiet-week case — the throws above are
  // what a failure looks like.
  const games = gameRows.filter(
    (game) => game.game_date && mondayOf(new Date(game.game_date)) === week,
  );
  if (games.length === 0) return [];

  // The week's own cohort: aggregate the raw rows the same way the weekly
  // standouts and the fantasy scorer do, so one rating engine answers for
  // all three.
  const cohort = aggregateWeeklyPlayerRows(games as unknown as WeeklyRawStatRow[]);

  const gamesByPlayer = new Map<string, CardGameRow[]>();
  for (const game of games) {
    const key = cardPlayerKey(game.summoner_name, game.tag);
    const group = gamesByPlayer.get(key);
    if (group) group.push(game);
    else gamesByPlayer.set(key, [game]);
  }

  const gameLog = new Map<string, CardGameMeta>();
  for (const log of logRows) {
    gameLog.set(log.match_id, { durationMin: log.duration_min, blueTeam: log.blue_team, redTeam: log.red_team });
  }

  const artPrefs = new Map<string, { artChampion: string | null; skin: number; motto: string | null }>();
  for (const art of ((artResult.data as { summoner_name: string; tag: string; art_champion?: string | null; skin: number; motto?: string | null }[]) ?? [])) {
    artPrefs.set(cardPlayerKey(art.summoner_name, art.tag), {
      artChampion: art.art_champion ?? null,
      skin: art.skin,
      motto: art.motto ?? null,
    });
  }

  return buildSeasonCards({
    cohort,
    gamesByPlayer,
    gameLog,
    teamImages: teamIdentity.badges,
    teamAbbrs: teamIdentity.abbrs,
    artPrefs,
    yardstick: styleYardstickFor(season),
  });
}

/** One card by its URL slug, or null. */
export async function fetchCardBySlug(
  supabase: SupabaseClient,
  season: string,
  slug: string,
): Promise<PlayerCardData | null> {
  // The week's build, like every other live surface — a share link and the
  // hub must not disagree about what a player's card says.
  const cards = await fetchCurrentWeekCards(supabase, season);
  const hit = cards.find((card) => card.slug === slug);
  if (hit) return hit;
  // Off the week's roster during the bracket — a bye, or a split that
  // ended in an earlier round — the card is the season build, bracket
  // stamps and all, rather than "Card not found".
  const week = await fetchLatestGameWeek(supabase, season);
  if (!week) return null;
  const fixtures = await fetchSeasonFixtures(supabase, season);
  if (!isPlayoffWeek(fixtures, week)) return null;
  return stampSendoffs(await fetchSeasonCards(supabase, season), fixtures).find((card) => card.slug === slug) ?? null;
}
