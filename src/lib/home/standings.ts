import { createServerSupabase } from "@/lib/supabase/server";
import { PREMIER_SEASON } from "./awards";
import { fetchDraftId } from "./fetchDraftId";
import { normalizeTeamName } from "@/lib/league/context";

export interface HomeStandingTeam {
  id: string;
  name: string;
  abbreviation: string;
  nomination_position: number;
  wins: number;
  losses: number;
  winrate_pct?: number;
}

type TeamRow = Pick<HomeStandingTeam, "id" | "name" | "abbreviation" | "nomination_position">;

export interface StandingsFixture {
  season: string;
  team_a: string | null;
  team_b: string | null;
  score_a: number | null;
  score_b: number | null;
}

/**
 * Series records, not game records.
 *
 * The homepage used to derive standings from raw_stats, which counts
 * individual games: a team that won a Bo3 2-1 showed as "2-1", and one that
 * won 2-0 showed as "2-0", so both a win and its margin were mixed into the
 * same column and every team looked like it had played more than it had.
 * A fixture's score IS the series, so one row here is one series.
 *
 * Reading fixtures rather than raw_stats also means a reported result stands
 * up on the homepage without waiting on the stats ingest to resolve sides.
 */
export function deriveSeriesStandings(
  fixtures: StandingsFixture[],
  season: string,
  teams: TeamRow[],
): HomeStandingTeam[] {
  const record = new Map<string, { wins: number; losses: number }>();
  const bump = (name: string | null, won: boolean) => {
    const key = normalizeTeamName(name);
    if (!key) return;
    const entry = record.get(key) ?? { wins: 0, losses: 0 };
    if (won) entry.wins += 1;
    else entry.losses += 1;
    record.set(key, entry);
  };

  for (const fixture of fixtures) {
    if (fixture.season !== season) continue;
    if (fixture.score_a === null || fixture.score_b === null) continue;
    if (fixture.score_a === fixture.score_b) continue; // a series has a winner
    const aWon = fixture.score_a > fixture.score_b;
    bump(fixture.team_a, aWon);
    bump(fixture.team_b, !aWon);
  }

  // Driven by the draft roster rather than by whoever appears in a fixture, so
  // a team that has not played yet still shows at 0-0 instead of vanishing.
  return teams
    .map((team) => {
      const entry = record.get(normalizeTeamName(team.name)) ?? { wins: 0, losses: 0 };
      const played = entry.wins + entry.losses;
      return {
        ...team,
        wins: entry.wins,
        losses: entry.losses,
        winrate_pct: played === 0 ? 0 : Number(((100 * entry.wins) / played).toFixed(1)),
      };
    })
    .sort(
      (a, b) =>
        b.wins - a.wins ||
        a.losses - b.losses ||
        (b.winrate_pct ?? 0) - (a.winrate_pct ?? 0) ||
        a.name.localeCompare(b.name),
    );
}

/**
 * Standings for one league's homepage. Premier reads the featured draft and
 * its own season; Academy passes its draft column, season code and team names
 * so the two never mix (they share raw_stats and the teams table).
 */
export async function fetchHomepageStandings(
  season: string = PREMIER_SEASON,
  teamNames?: string[],
  draftColumn: "featured_draft_id" | "academy_draft_id" = "featured_draft_id",
): Promise<HomeStandingTeam[]> {
  const supabase = await createServerSupabase();
  const featuredDraftId = await fetchDraftId(supabase, draftColumn);
  if (!featuredDraftId) return [];

  const { data: teams, error: teamsError } = await supabase
    .from("teams")
    .select("id, name, abbreviation, nomination_position")
    .eq("draft_id", featuredDraftId)
    .order("nomination_position", { ascending: true });

  if (teamsError) throw teamsError;
  const draftTeams = (teams ?? []) as TeamRow[];
  if (draftTeams.length === 0) return [];

  const scoped = teamNames?.length
    ? draftTeams.filter((team) => teamNames.some((name) => normalizeTeamName(name) === normalizeTeamName(team.name)))
    : draftTeams;

  try {
    const { data: fixtures } = await supabase
      .from("fixtures")
      .select("season, team_a, team_b, score_a, score_b")
      .eq("season", season);
    return deriveSeriesStandings((fixtures as StandingsFixture[]) ?? [], season, scoped);
  } catch {
    // A fixtures outage should leave the roster on screen at 0-0 rather than
    // blanking the panel.
    return scoped.map((team) => ({ ...team, wins: 0, losses: 0 }));
  }
}
