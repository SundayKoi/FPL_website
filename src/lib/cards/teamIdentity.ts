// Team branding for cards: each team's badge, short code and banner colour,
// keyed so the lookup survives the two team tables spelling a name
// differently. Split out of queries.ts, which re-exports every name here.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlayerCardData } from "./build";
import { teamBadgeKey } from "./cardKeys";

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
  /** normalized team name/abbreviation -> the roster's banner colour. What
   *  the team card washes its five champion panels with. */
  colors: Map<string, string>;
}

export async function fetchTeamIdentity(supabase: SupabaseClient, season: string, options: { strictSource?: boolean } = {}): Promise<TeamIdentity> {
  const [teamsResult, leagueTeamsResult, settingsResult] = await Promise.all([
    // draft_id comes along so the badge can be scoped to THIS season's
    // teams below — team names get reused season to season, and an
    // unscoped lookup would hand a card whichever era's logo Postgres
    // happened to return first.
    supabase.from("teams").select("name, abbreviation, image_url, banner_color, draft_id"),
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

  if (options.strictSource && (teamsResult.error || leagueTeamsResult.error || settingsResult.error || !settingsResult.data)) {
    throw new Error(`Team identity source failed for ${season}`);
  }

  // Badges are garnish for normal card reads — a failure here must not take
  // the wider cards page down. Release snapshots opt into strictSource above.
  const teamRows = teamsResult.error
    ? []
    : ((teamsResult.data as {
        name: string;
        abbreviation: string | null;
        image_url: string | null;
        banner_color: string | null;
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

  // Banner colours file exactly like badges — name and abbreviation, both
  // normalized — so a card whose team_name matches either spelling still
  // finds the colour its team card is meant to wear.
  const colors = new Map<string, string>();
  const addColor = (key: string | null | undefined, color: string | null | undefined) => {
    if (!key || !color?.trim()) return;
    const normalized = teamBadgeKey(key);
    if (normalized && !colors.has(normalized)) colors.set(normalized, color.trim());
  };
  for (const team of scopedTeams) {
    addColor(team.name, team.banner_color);
    addColor(team.abbreviation, team.banner_color);
  }

  return { badges: teamImages, abbrs, colors };
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
