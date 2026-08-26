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

import type { SupabaseClient } from "@supabase/supabase-js";
import { mondayOf } from "@/lib/packs/week";
import { combineSeasonRows, mergeRows } from "@/lib/stats/formulas";
import { aggregateWeeklyPlayerRows, type WeeklyRawStatRow } from "@/lib/stats/weekly";
import type { GameLogRow, PlayerAggRow, RecordRow } from "@/lib/stats/types";
import {
  buildSeasonCards,
  cardPlayerKey,
  teamBadgeKey,
  type CardGameMeta,
  type CardGameRow,
  type PlayerCardData,
} from "./build";

export type CardLeague = "premier" | "academy";

/** The per-game columns a card needs. Objective and turret work is only on
 *  raw_stats — stats_player_agg has no such columns — so both build paths
 *  read it here.
 *
 *  A single string literal, line-continued with `\` rather than `+`
 *  concatenated: `+` would widen the result to `string` and defeat
 *  Supabase's column-checking `.select()` overload. */
const CARD_GAME_COLUMNS =
  "summoner_name, tag, champion, win, game_date, match_id, team_name, kills, deaths, assists, cs, \
total_damage_to_champions, dragon_kills, baron_kills, objective_damage, turret_kills, turret_damage, \
wards_killed, control_wards_bought, detector_wards_placed, damage_mitigated, \
turret_plates_destroyed";

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
 * ratings the whole feature exists to spread out.
 */
const WEEK_GAME_COLUMNS =
  "summoner_name, tag, champion, win, game_date, match_id, team_name, kills, deaths, assists, cs, \
total_damage_to_champions, dragon_kills, baron_kills, objective_damage, turret_kills, turret_damage, \
wards_killed, control_wards_bought, detector_wards_placed, damage_mitigated, \
turret_plates_destroyed, cs_at_10, cs_per_min, damage_per_min, damage_share_pct, damage_taken_per_min, \
double_kills, first_blood_assist, first_blood_kill, game_duration_min, gold_at_10, gold_earned, \
gold_per_min, kda_challenges, kill_participation_pct, penta_kills, quadra_kills, role, season, \
season_phase, solo_kills, triple_kills, vision_score, vision_score_per_min, xp_at_10";

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
 * team name (and abbreviation) -> that team's badge URL, normalized so the
 * lookup survives casing, punctuation and spacing differences between the
 * tables that hold each half.
 *
 * Exported because frozen cards need it too: a pulled copy or an archived
 * edition stores the badge it resolved at mint time, so any card minted
 * before a team's logo was uploaded (or before its name was bridged here)
 * would carry a null badge forever. Callers re-run the lookup over frozen
 * cards with backfillTeamIdentity below.
 */
export interface TeamIdentity {
  /** normalized team name/abbreviation -> logo URL. */
  badges: Map<string, string>;
  /** normalized team name/abbreviation -> the short code the card prints. */
  abbrs: Map<string, string>;
}

export async function fetchTeamIdentity(supabase: SupabaseClient, season: string): Promise<TeamIdentity> {
  const [teamsResult, leagueTeamsResult, settingsResult] = await Promise.all([
    // draft_id comes along so the badge can be scoped to THIS season's
    // teams below — team names get reused season to season, and an
    // unscoped lookup would hand a card whichever era's logo Postgres
    // happened to return first.
    supabase.from("teams").select("name, abbreviation, image_url, draft_id"),
    // The bridge between the two team tables: raw_stats carries
    // league_teams.name, the badge lives on teams.image_url, and nothing
    // enforces that the two spell a team identically.
    supabase.from("league_teams").select("name, abbreviation"),
    supabase
      .from("league_settings")
      .select("current_season, academy_season, featured_draft_id, academy_draft_id")
      .eq("id", 1)
      .maybeSingle(),
  ]);

  // Badges are garnish — a failure here must not take cards down.
  const teamRows = teamsResult.error
    ? []
    : ((teamsResult.data as {
        name: string;
        abbreviation: string | null;
        image_url: string | null;
        draft_id: string | null;
      }[]) ?? []);
  const leagueTeamRows = leagueTeamsResult.error
    ? []
    : ((leagueTeamsResult.data as { name: string; abbreviation: string | null }[]) ?? []);
  const settings = settingsResult.error
    ? null
    : (settingsResult.data as {
        current_season: string | null;
        academy_season: string | null;
        featured_draft_id: string | null;
        academy_draft_id: string | null;
      } | null);

  // Which draft this season's teams live under. A season we can't map (an
  // archived one, or settings that failed to load) falls back to every
  // team, which is the old behaviour — a possibly-stale badge still beats
  // no badge.
  const seasonDraftId =
    settings?.academy_season === season
      ? settings?.academy_draft_id ?? null
      : settings?.current_season === season
        ? settings?.featured_draft_id ?? null
        : null;
  const scopedTeams = seasonDraftId ? teamRows.filter((team) => team.draft_id === seasonDraftId) : teamRows;

  // Every badge is filed under its name AND its abbreviation, both
  // normalized. The abbreviation is what rescues a team the two tables
  // spell differently — a real typo on one side ("Fradulent 5" against
  // "Fraudulent 5") defeats any amount of name normalizing, but the
  // three-letter code still matches.
  const teamImages = new Map<string, string>();
  const addBadge = (key: string, url: string) => {
    const normalized = teamBadgeKey(key);
    if (normalized && !teamImages.has(normalized)) teamImages.set(normalized, url);
  };
  for (const team of scopedTeams) {
    if (!team.image_url) continue;
    addBadge(team.name, team.image_url);
    if (team.abbreviation) addBadge(team.abbreviation, team.image_url);
  }
  // raw_stats speaks league_teams' names, so alias each of those onto the
  // badge its abbreviation points at when the names themselves don't meet.
  for (const leagueTeam of leagueTeamRows) {
    const nameKey = teamBadgeKey(leagueTeam.name);
    if (!nameKey || teamImages.has(nameKey) || !leagueTeam.abbreviation) continue;
    const viaAbbreviation = teamImages.get(teamBadgeKey(leagueTeam.abbreviation));
    if (viaAbbreviation) teamImages.set(nameKey, viaAbbreviation);
  }

  // Abbreviations are filed the same way, from both tables, so a card whose
  // team_name matches either spelling still finds its short code.
  const abbrs = new Map<string, string>();
  const addAbbr = (key: string | null | undefined, abbreviation: string | null | undefined) => {
    if (!key || !abbreviation?.trim()) return;
    const normalized = teamBadgeKey(key);
    if (normalized && !abbrs.has(normalized)) abbrs.set(normalized, abbreviation.trim());
  };
  for (const team of scopedTeams) {
    addAbbr(team.name, team.abbreviation);
    addAbbr(team.abbreviation, team.abbreviation);
  }
  for (const leagueTeam of leagueTeamRows) {
    addAbbr(leagueTeam.name, leagueTeam.abbreviation);
    addAbbr(leagueTeam.abbreviation, leagueTeam.abbreviation);
  }

  return { badges: teamImages, abbrs };
}

/**
 * Re-resolves a frozen card's team branding — badge and abbreviation.
 *
 * Ratings on a frozen copy are the whole point and stay untouched, but
 * branding is for a team that (per league rules) can't change within a
 * season, so filling a null one in is a repair rather than a rewrite. The
 * abbreviation rides along because every copy pulled before the card front
 * started printing it would otherwise wear the full name over its signature
 * forever. Fields that already carry a value are left exactly as they were.
 */
export function backfillTeamIdentity(cards: PlayerCardData[], identity: TeamIdentity): PlayerCardData[] {
  const { badges, abbrs } = identity;
  if (badges.size === 0 && abbrs.size === 0) return cards;
  return cards.map((card) => {
    if (!card.teamName) return card;
    const key = teamBadgeKey(card.teamName);
    const url = card.teamImageUrl ?? badges.get(key) ?? null;
    const abbr = card.teamAbbr ?? abbrs.get(key) ?? null;
    if (url === card.teamImageUrl && abbr === card.teamAbbr) return card;
    return { ...card, teamImageUrl: url, teamAbbr: abbr };
  });
}

/**
 * Every player's card for `season`, best overall first. One fetch pass for
 * the whole league: the rating engine needs the full cohort anyway (all
 * ratings are league-relative), so per-player fetching would save nothing.
 */
export async function fetchSeasonCards(supabase: SupabaseClient, season: string): Promise<PlayerCardData[]> {
  const [aggResult, gamesResult, logResult, recordsResult, teamIdentity, artResult] = await Promise.all([
    supabase.from("stats_player_agg").select("*").eq("season", season),
    supabase
      .from("raw_stats")
      .select(CARD_GAME_COLUMNS)
      .eq("season", season),
    supabase.from("stats_game_log").select("match_id, duration_min, blue_team, red_team").eq("season", season),
    supabase.from("stats_records").select("category, summoner_name, tag").eq("season", season),
    fetchTeamIdentity(supabase, season),
    // select * on purpose: the motto column arrived in a later migration
    // than skin, and naming a missing column would fail the whole select.
    supabase.from("card_art_prefs").select("*").eq("season", season),
  ]);
  if (aggResult.error) throw aggResult.error;
  if (gamesResult.error) throw gamesResult.error;
  if (logResult.error) throw logResult.error;
  // Records / team art / skin prefs are garnish — a failure (e.g. the
  // card_art_prefs migration not applied yet) must not take cards down.
  const recordRows = recordsResult.error ? [] : ((recordsResult.data as Pick<RecordRow, "category" | "summoner_name" | "tag">[]) ?? []);
  const artRows = artResult.error
    ? []
    : ((artResult.data as { summoner_name: string; tag: string; skin: number; motto?: string | null }[]) ?? []);

  // The view emits one row per (season, phase) — merge Regular+Playoffs
  // into a single season row per player, same as the stats tabs do.
  const cohort = mergeRows(
    (aggResult.data as PlayerAggRow[]) ?? [],
    (row) => cardPlayerKey(row.summoner_name, row.tag),
    (group) => combineSeasonRows(group, season),
  );

  const gamesByPlayer = new Map<string, CardGameRow[]>();
  for (const game of (gamesResult.data as CardGameRow[]) ?? []) {
    const key = cardPlayerKey(game.summoner_name, game.tag);
    const list = gamesByPlayer.get(key) ?? [];
    list.push(game);
    gamesByPlayer.set(key, list);
  }

  const gameLog = new Map<string, CardGameMeta>();
  for (const log of (logResult.data as Pick<GameLogRow, "match_id" | "duration_min" | "blue_team" | "red_team">[]) ?? []) {
    gameLog.set(log.match_id, { durationMin: log.duration_min, blueTeam: log.blue_team, redTeam: log.red_team });
  }

  const recordsByPlayer = new Map<string, string[]>();
  for (const record of recordRows) {
    const key = cardPlayerKey(record.summoner_name, record.tag);
    const list = recordsByPlayer.get(key) ?? [];
    if (!list.includes(record.category)) list.push(record.category);
    recordsByPlayer.set(key, list);
  }

  const artPrefs = new Map<string, { skin: number; motto: string | null }>();
  for (const art of artRows) {
    artPrefs.set(cardPlayerKey(art.summoner_name, art.tag), { skin: art.skin, motto: art.motto ?? null });
  }

  return buildSeasonCards({
    cohort,
    gamesByPlayer,
    gameLog,
    recordsByPlayer,
    teamImages: teamIdentity.badges,
    teamAbbrs: teamIdentity.abbrs,
    artPrefs,
  });
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
  if (!week) return fetchSeasonCards(supabase, season);
  const cards = await fetchWeekCards(supabase, season, week);
  // A week that ingested no usable rows would otherwise blank every card
  // surface at once; the season build is a worse answer than the week's,
  // but it is a far better one than nothing.
  return cards.length > 0 ? cards : fetchSeasonCards(supabase, season);
}

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

  const [gamesResult, logResult, teamIdentity, artResult] = await Promise.all([
    supabase
      .from("raw_stats")
      .select(WEEK_GAME_COLUMNS)
      .eq("season", season)
      .gte("game_date", start.toISOString())
      .lt("game_date", end.toISOString()),
    supabase.from("stats_game_log").select("match_id, duration_min, blue_team, red_team").eq("season", season),
    fetchTeamIdentity(supabase, season),
    supabase.from("card_art_prefs").select("*").eq("season", season),
  ]);

  // Loud, exactly like fetchSeasonCards. A swallowed error here reads as
  // "no games this week", and the drop would log "No cards — skipping" and
  // exit green — silently losing a week that can never be re-minted.
  if (gamesResult.error) throw gamesResult.error;
  if (logResult.error) throw logResult.error;

  // Trim the padded UTC window down to the Eastern week. An empty result
  // after this is the legitimate quiet-week case — the throws above are
  // what a failure looks like.
  const games = ((gamesResult.data as CardGameRow[]) ?? []).filter(
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
    gamesByPlayer.set(key, [...(gamesByPlayer.get(key) ?? []), game]);
  }

  const gameLog = new Map<string, CardGameMeta>();
  for (const log of (logResult.data as Pick<GameLogRow, "match_id" | "duration_min" | "blue_team" | "red_team">[]) ?? []) {
    gameLog.set(log.match_id, { durationMin: log.duration_min, blueTeam: log.blue_team, redTeam: log.red_team });
  }

  const artPrefs = new Map<string, { skin: number; motto: string | null }>();
  for (const art of ((artResult.data as { summoner_name: string; tag: string; skin: number; motto?: string | null }[]) ?? [])) {
    artPrefs.set(cardPlayerKey(art.summoner_name, art.tag), { skin: art.skin, motto: art.motto ?? null });
  }

  return buildSeasonCards({
    cohort,
    gamesByPlayer,
    gameLog,
    teamImages: teamIdentity.badges,
    teamAbbrs: teamIdentity.abbrs,
    artPrefs,
  });
}

export interface LeagueMoment {
  id: number;
  weekStart: string;
  slug: string;
  summonerName: string;
  teamName: string | null;
  champion: string | null;
  role: string | null;
  triggerKey: string;
  title: string;
  headline: string;
  gameDate: string | null;
  /** Provenance the Signature print shows — null on moments minted before
   *  the columns existed (the backfill migration repairs those). */
  opponent: string | null;
  durationMin: number | null;
}

/**
 * The season's minted moment cards, newest first.
 *
 * Errors return [] rather than throwing: an environment without the
 * card_moments migration should render an empty wall, not a 500.
 */
export async function fetchSeasonMoments(supabase: SupabaseClient, season: string): Promise<LeagueMoment[]> {
  // select("*") on purpose: opponent/duration_min arrive in a later
  // migration than the table, and naming them here would blank the whole
  // wall on a deploy that beat the migration.
  const { data, error } = await supabase
    .from("card_moments")
    .select("*")
    .eq("season", season)
    .order("week_start", { ascending: false })
    .order("rarity", { ascending: false });
  if (error) return [];
  return ((data as {
    id: number;
    week_start: string;
    slug: string;
    summoner_name: string;
    team_name: string | null;
    champion: string | null;
    role: string | null;
    trigger_key: string;
    title: string;
    headline: string;
    game_date: string | null;
    opponent?: string | null;
    duration_min?: number | null;
  }[]) ?? []).map((row) => ({
    id: row.id,
    weekStart: row.week_start,
    slug: row.slug,
    summonerName: row.summoner_name,
    teamName: row.team_name,
    champion: row.champion,
    role: row.role,
    triggerKey: row.trigger_key,
    title: row.title,
    headline: row.headline,
    gameDate: row.game_date,
    opponent: row.opponent ?? null,
    durationMin: row.duration_min === null || row.duration_min === undefined ? null : Number(row.duration_min),
  }));
}

/** One week's minted moments — the pool a pack bought for that week can
 *  draw from. Empty is the normal case: most weeks mint none that anyone
 *  opens a pack for. */
export async function fetchWeekMoments(
  supabase: SupabaseClient,
  season: string,
  weekStart: string,
): Promise<LeagueMoment[]> {
  return (await fetchSeasonMoments(supabase, season)).filter((moment) => moment.weekStart === weekStart);
}

export interface RatingHistoryPoint {
  overall: number;
  tier: string;
  takenAt: string;
}

/** One card's weekly rating readings, oldest first — the season journey.
 *  Errors (e.g. the history migration not applied yet) return empty: the
 *  journey strip is garnish. */
/**
 * Every edition week on offer for `season`, newest first.
 *
 * Empty until the weekly drop has archived at least one week — the pack
 * shop treats that as "current cards only" rather than an error, so packs
 * keep working on a league that has never run a drop.
 */
export async function fetchCardEditionWeeks(
  supabase: SupabaseClient,
  season: string,
  /** Must not exceed the API's max_rows or every page comes back short and
   *  paging stops after the first. Exposed for tests. */
  paging: { pageSize?: number; maxPages?: number } = {},
): Promise<string[]> {
  const pageSize = paging.pageSize ?? 1000;
  const maxPages = paging.maxPages ?? 100;
  const weeks = new Set<string>();

  // Paged, because this reads one row per CARD and only wants the distinct
  // weeks. PostgREST caps an unpaged select at max_rows (1000) and says
  // nothing, so at ~50 cards a week the archive crosses that line after
  // about twenty weeks — and since the order is newest-first, the rows that
  // fall off the end are the OLDEST weeks. They would simply stop appearing
  // in the pack shop, with no error anywhere to explain it.
  for (let page = 0; page < maxPages; page += 1) {
    const from = page * pageSize;
    const { data, error } = await supabase
      .from("card_editions")
      .select("edition_week")
      .eq("season", season)
      .order("edition_week", { ascending: false })
      // Total order, not just newest-first: thousands of rows share an
      // edition_week, and paging on a non-unique sort key lets the database
      // return a row twice on one page and skip another. Duplicates the Set
      // absorbs; a skipped row could drop a whole week off the list. The
      // primary key is (season, edition_week, slug), so adding slug makes
      // the ordering unique and the pages disjoint.
      .order("slug", { ascending: true })
      .range(from, from + pageSize - 1);
    // Garnish, not load-bearing: an environment without the card_editions
    // migration still sells current-week packs. A later page failing leaves
    // the weeks already collected, which beats losing the list entirely.
    if (error) break;
    const batch = (data as { edition_week: string }[]) ?? [];
    for (const row of batch) weeks.add(row.edition_week);
    if (batch.length < pageSize) break;
  }

  return [...weeks];
}

/**
 * The cards exactly as they stood in one archived week — the pool a pack
 * bought for that week mints from. Returns [] when the week was never
 * archived, which callers read as "fall back to the live cards".
 */
export async function fetchEditionCards(
  supabase: SupabaseClient,
  season: string,
  editionWeek: string,
): Promise<PlayerCardData[]> {
  const { data, error } = await supabase
    .from("card_editions")
    .select("card")
    .eq("season", season)
    .eq("edition_week", editionWeek);
  if (error) return [];
  const cards = ((data as { card: PlayerCardData }[]) ?? []).map((row) => row.card);
  return backfillTeamIdentity(cards, await fetchTeamIdentity(supabase, season));
}

export async function fetchRatingHistory(
  supabase: SupabaseClient,
  season: string,
  slug: string,
): Promise<RatingHistoryPoint[]> {
  const { data, error } = await supabase
    .from("card_rating_history")
    .select("overall, tier, taken_at")
    .eq("season", season)
    .eq("slug", slug)
    .order("taken_at");
  if (error) return [];
  return ((data as { overall: number; tier: string; taken_at: string }[]) ?? []).map((row) => ({
    overall: row.overall,
    tier: row.tier,
    takenAt: row.taken_at,
  }));
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
  return cards.find((card) => card.slug === slug) ?? null;
}
