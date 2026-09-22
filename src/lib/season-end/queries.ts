import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cardPlayerKey, teamBadgeKey } from "@/lib/cards/build";
import { seasonBelongsToLeague } from "@/lib/league/season";
import { normalizePlayerName } from "@/lib/players/normalize";
import type { Division, FixtureRow } from "@/lib/schedule/types";
import { deriveSeasonEnd, type SeasonRow } from "./derive";

export interface SeasonEndTeamIdentity {
  name: string;
  abbreviation: string | null;
  imageUrl: string | null;
  bannerColor: string | null;
}

/** Normalized team identity aliases for the selected season's draft only. */
export type SeasonEndTeamIdentityMap = Record<string, SeasonEndTeamIdentity>;

// Ordered pages are essential: a season exceeds the API's 1,000-row cap.
// No silent safety-cap truncation: failure leaves the entire result unavailable.
export async function loadSeasonEnd(client: SupabaseClient, league: "premier" | "academy", season: string) {
  if (!seasonBelongsToLeague(season, league)) throw new Error("Season does not belong to this league.");
  const [rows, fixtures] = await Promise.all([
    readPages<SeasonRow>(async (from, to) => client.from("raw_stats").select("*").eq("season", season).eq("season_phase", "Regular").order("id").range(from, to)),
    readPages<FixtureRow>(async (from, to) => client.from("fixtures").select("*").eq("season", season).order("id").range(from, to)),
  ]);
  const currentPlayerDivisions = await loadCurrentPlayerDivisions(client, league, season, rows);
  return deriveSeasonEnd(rows, fixtures, season, league, { currentPlayerDivisions });
}

type SeasonEndTeamRow = {
  id: string;
  name: string;
  abbreviation: string | null;
  image_url: string | null;
  banner_color: string | null;
};
type LeagueTeamAliasRow = { name: string; abbreviation: string | null };

function validBannerColor(value: string | null): string | null {
  return value && /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim() : null;
}

/**
 * Resolve Teamwork artwork independently from player/card assembly. Settings
 * must prove the requested season belongs to the intended draft; an unknown
 * season deliberately returns an empty map rather than searching all drafts.
 */
export async function loadSeasonEndTeamIdentities(
  client: SupabaseClient,
  league: "premier" | "academy",
  season: string,
  options: { strictSource?: boolean } = {},
): Promise<SeasonEndTeamIdentityMap> {
  const { data: settings, error: settingsError } = await client
    .from("league_settings")
    .select("current_season, academy_season, featured_draft_id, academy_draft_id")
    .eq("id", 1)
    .single();
  if (settingsError || !settings) {
    if (options.strictSource) throw new Error(`Season's End team settings source failed: ${settingsError?.message ?? "missing settings"}`);
    return {};
  }

  const row = settings as CurrentSettings;
  const expectedSeason = league === "premier" ? row.current_season : row.academy_season;
  const draftId = league === "premier" ? row.featured_draft_id : row.academy_draft_id;
  if (expectedSeason !== season || !draftId) {
    if (options.strictSource) throw new Error("Season's End team identity source is not scoped to the requested season");
    return {};
  }

  let teams: SeasonEndTeamRow[];
  let aliases: LeagueTeamAliasRow[];
  try {
    [teams, aliases] = await Promise.all([
      readPages<SeasonEndTeamRow>(async (from, to) => client
        .from("teams")
        .select("id, name, abbreviation, image_url, banner_color")
        .eq("draft_id", draftId)
        .order("id")
        .range(from, to)),
      readPages<LeagueTeamAliasRow>(async (from, to) => client
        .from("league_teams")
        .select("name, abbreviation")
        .order("id")
        .range(from, to)),
    ]);
  } catch (caught) {
    if (options.strictSource) throw caught;
    return {};
  }

  type InternalIdentity = SeasonEndTeamIdentity & { id: string };
  const scoped = teams.map((team): InternalIdentity => ({
    id: team.id,
    name: team.name,
    abbreviation: team.abbreviation?.trim() || null,
    imageUrl: team.image_url,
    bannerColor: validBannerColor(team.banner_color),
  }));
  const byAlias = new Map<string, InternalIdentity | null>();
  const addAlias = (alias: string | null | undefined, identity: InternalIdentity) => {
    if (!alias?.trim()) return;
    const key = teamBadgeKey(alias);
    if (!key) return;
    const previous = byAlias.get(key);
    if (previous === undefined) byAlias.set(key, identity);
    else if (previous && previous.id !== identity.id) byAlias.set(key, null);
  };

  for (const team of scoped) {
    addAlias(team.name, team);
    addAlias(team.abbreviation, team);
  }

  // The reporting table can preserve an older spelling. Bridge it only when
  // the abbreviation identifies exactly one team in this already-scoped draft.
  const byAbbreviation = new Map<string, InternalIdentity | null>();
  for (const team of scoped) {
    if (!team.abbreviation) continue;
    const key = teamBadgeKey(team.abbreviation);
    const previous = byAbbreviation.get(key);
    if (previous === undefined) byAbbreviation.set(key, team);
    else if (previous && previous.id !== team.id) byAbbreviation.set(key, null);
  }
  for (const alias of aliases) {
    const abbreviation = alias.abbreviation ? byAbbreviation.get(teamBadgeKey(alias.abbreviation)) : null;
    if (abbreviation) addAlias(alias.name, abbreviation);
  }

  return Object.fromEntries([...byAlias.entries()].flatMap(([key, identity]) => {
    if (!identity) return [];
    const publicIdentity: SeasonEndTeamIdentity = {
      name: identity.name,
      abbreviation: identity.abbreviation,
      imageUrl: identity.imageUrl,
      bannerColor: identity.bannerColor,
    };
    return [[key, publicIdentity] as const];
  }));
}

type CurrentSettings = {
  current_season: string | null;
  academy_season: string | null;
  featured_draft_id: string | null;
  academy_draft_id: string | null;
};
type TeamDivisionRow = { id: string; name: string; division: Division | null };
type CurrentPlayerRow = { display_name: string; team_id: string | null };
type MembershipRow = {
  riot_accounts: { game_name: string; tag_line: string } | { game_name: string; tag_line: string }[] | null;
  league_teams: { name: string } | { name: string }[] | null;
};

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function teamKey(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * The active draft is the authority for a player's current division. The
 * roster membership is keyed by Riot identity, so a trade updates this map
 * even when the player's historical raw_stats rows still show the old team.
 */
async function loadCurrentPlayerDivisions(
  client: SupabaseClient,
  league: "premier" | "academy",
  season: string,
  rows: SeasonRow[],
): Promise<Map<string, Division>> {
  const { data: settings, error: settingsError } = await client
    .from("league_settings")
    .select("current_season, academy_season, featured_draft_id, academy_draft_id")
    .eq("id", 1)
    .single();
  if (settingsError) throw settingsError;

  const row = settings as CurrentSettings | null;
  const currentSeason = league === "premier" ? row?.current_season : row?.academy_season;
  const draftId = league === "premier" ? row?.featured_draft_id : row?.academy_draft_id;
  if (currentSeason !== season || !draftId) return new Map();

  const [teams, players, memberships] = await Promise.all([
    readPages<TeamDivisionRow>(async (from, to) => client.from("teams").select("id, name, division").eq("draft_id", draftId).order("id").range(from, to)),
    readPages<CurrentPlayerRow>(async (from, to) => client.from("players").select("display_name, team_id").eq("draft_id", draftId).order("id").range(from, to)),
    readPages<MembershipRow>(async (from, to) => client
      .from("roster_memberships")
      .select("riot_accounts(game_name, tag_line), league_teams(name)")
      .eq("season", season)
      .order("id")
      .range(from, to)),
  ]);
  const divisionsByTeam = new Map(
    teams
      .filter((team): team is TeamDivisionRow & { division: Division } => team.division === "Solari" || team.division === "Lunari")
      .map((team) => [teamKey(team.name), team.division] as const),
  );
  const divisionsByTeamId = new Map(
    teams
      .filter((team): team is TeamDivisionRow & { division: Division } => team.division === "Solari" || team.division === "Lunari")
      .map((team) => [team.id, team.division] as const),
  );
  const divisionsByPlayerName = new Map<string, Division | null>();
  for (const player of players) {
    const division = player.team_id ? divisionsByTeamId.get(player.team_id) : undefined;
    if (!division) continue;
    const key = normalizePlayerName(player.display_name);
    const previous = divisionsByPlayerName.get(key);
    divisionsByPlayerName.set(key, divisionsByPlayerName.has(key) && previous !== division ? null : division);
  }
  const divisionsByIdentity = new Map<string, Division | null>();
  for (const membership of memberships) {
    const account = one(membership.riot_accounts);
    const leagueTeam = one(membership.league_teams);
    const division = leagueTeam ? divisionsByTeam.get(teamKey(leagueTeam.name)) : undefined;
    if (!account || !division) continue;
    const key = cardPlayerKey(account.game_name, account.tag_line);
    const previous = divisionsByIdentity.get(key);
    divisionsByIdentity.set(key, divisionsByIdentity.has(key) && previous !== division ? null : division);
  }
  const divisions = new Map<string, Division>();
  for (const row of rows) {
    if (typeof row.summoner_name !== "string" || typeof row.tag !== "string") continue;
    const identity = cardPlayerKey(row.summoner_name, row.tag);
    const division = divisionsByIdentity.has(identity)
      ? divisionsByIdentity.get(identity)
      : divisionsByPlayerName.get(normalizePlayerName(row.summoner_name));
    if (division) divisions.set(identity, division);
  }
  return divisions;
}

async function readPages<T>(read: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = [];
  // A short page can reflect a server cap smaller than requested. Continue
  // by actual rows returned until an empty page proves exhaustion.
  for (let page = 0; page < 1000; page++) {
    const { data, error } = await read(rows.length, rows.length + 999);
    if (error) throw new Error(error.message);
    if (!data?.length) return rows;
    rows.push(...data as T[]);
  }
  throw new Error("Season data exceeded the paging safety limit; no awards were calculated.");
}
