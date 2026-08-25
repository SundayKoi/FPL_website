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
import { combineSeasonRows, mergeRows } from "@/lib/stats/formulas";
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
      .select("summoner_name, tag, champion, win, game_date, match_id, team_name, kills, deaths, assists, cs, total_damage_to_champions")
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
}

/**
 * The season's minted moment cards, newest first.
 *
 * Errors return [] rather than throwing: an environment without the
 * card_moments migration should render an empty wall, not a 500.
 */
export async function fetchSeasonMoments(supabase: SupabaseClient, season: string): Promise<LeagueMoment[]> {
  const { data, error } = await supabase
    .from("card_moments")
    .select("id, week_start, slug, summoner_name, team_name, champion, role, trigger_key, title, headline, game_date")
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
export async function fetchCardEditionWeeks(supabase: SupabaseClient, season: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("card_editions")
    .select("edition_week")
    .eq("season", season)
    .order("edition_week", { ascending: false });
  // Garnish, not load-bearing: an environment without the card_editions
  // migration still sells current-week packs.
  if (error) return [];
  return [...new Set(((data as { edition_week: string }[]) ?? []).map((row) => row.edition_week))];
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
  const cards = await fetchSeasonCards(supabase, season);
  return cards.find((card) => card.slug === slug) ?? null;
}
