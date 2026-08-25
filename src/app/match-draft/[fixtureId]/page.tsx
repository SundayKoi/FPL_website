import Link from "next/link";
import MatchDraftBoard from "@/components/match-draft/MatchDraftBoard";
import { ROLE_ORDER, type LolRole } from "@/lib/draft/types";
import { fearlessBlockedByGame, fearlessBlockedChampions, matchDraftBestOf, matchDraftGameLinks } from "@/lib/match-draft/rules";
import { fetchLiveChampions } from "@/lib/match-draft/liveRoster";
import type { MatchDraftAction, MatchDraftBestOf, MatchDraftGameTab, MatchDraftLayout, MatchDraftRow, MatchDraftSeriesFormat, MatchDraftSettingsRow, MatchDraftState, MatchDraftTeam } from "@/lib/match-draft/types";
import type { FixtureRow } from "@/lib/schedule/types";
import { createServerSupabase } from "@/lib/supabase/server";
import { fetchStaffTier } from "@/lib/auth/staffTier";
import { leaguePath } from "@/lib/league/links";
import { teamSlug } from "@/lib/teams/teamPage";

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function gameParam(value: string | undefined, bestOf: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return 1;
  return Math.min(parsed, bestOf);
}

/** Explicit ?layout= choice, or null to fall back to the viewer-based
 *  default (captains/admins get board, spectators get stage). */
function layoutParam(value: string | undefined): MatchDraftLayout | null {
  return value === "board" ? "board" : value === "stage" ? "stage" : null;
}

function fallbackIdentity(name: string | null, side: "Blue" | "Red"): MatchDraftTeam {
  const label = name?.trim() || `${side} side`;
  return {
    name: label,
    abbreviation: label === `${side} side` ? side.slice(0, 3).toUpperCase() : label.slice(0, 3).toUpperCase(),
    imageUrl: null,
    players: [],
  };
}

function identityFor(name: string | null, identities: Record<string, MatchDraftTeam>, side: "Blue" | "Red"): MatchDraftTeam {
  return identities[teamSlug(name ?? "")] ?? fallbackIdentity(name, side);
}

function stateFor({
  fixture,
  row,
  rows,
  gameNumber,
  layout,
  teams,
  fearless,
}: {
  fixture: FixtureRow;
  row: MatchDraftRow | null;
  rows: MatchDraftRow[];
  gameNumber: number;
  layout: MatchDraftLayout;
  teams: Record<string, MatchDraftTeam>;
  fearless: boolean;
}): MatchDraftState {
  const actions = row?.actions ?? [];
  const prior = rows.map((draft) => ({ gameNumber: draft.game_number, actions: draft.actions ?? [] }));
  const scheduledTeams: [MatchDraftTeam, MatchDraftTeam] = [
    identityFor(fixture.team_a, teams, "Blue"),
    identityFor(fixture.team_b, teams, "Red"),
  ];
  const blueTeam = identityFor(row?.blue_team_name || fixture.team_a, teams, "Blue");
  const redTeam = identityFor(row?.red_team_name || fixture.team_b, teams, "Red");
  return {
    fixtureId: fixture.id,
    gameNumber,
    status: row?.status ?? "drafting",
    layout,
    currentStepIndex: row?.current_step_index ?? 0,
    turnStartedAt: row?.turn_started_at ?? null,
    blueTeam,
    redTeam,
    scheduledTeams,
    canChooseSides: gameNumber > 1 && actions.length === 0,
    blueReady: row?.blue_ready ?? false,
    redReady: row?.red_ready ?? false,
    changeRequest: row?.change_request ?? null,
    positions: row?.positions ?? null,
    winnerTeam: row?.winner_team ?? null,
    sideChoiceRequired: gameNumber > 1 && actions.length === 0 && !(row?.blue_team_name && row?.red_team_name),
    actions: actions.filter((action): action is MatchDraftAction => Boolean(action && (action.champion || action.skipped))),
    blockedChampions: fearless ? [...fearlessBlockedChampions(prior, gameNumber)] : [],
    blockedGames: fearless ? fearlessBlockedByGame(prior, gameNumber) : {},
  };
}

export default async function MatchDraftPage({
  params,
  searchParams,
}: {
  params: Promise<{ fixtureId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { fixtureId } = await params;
  const query = await searchParams;
  const supabase = await createServerSupabase();

  const { data: fixtureData } = await supabase.from("fixtures").select("*").eq("id", fixtureId).single();
  const fixture = fixtureData as FixtureRow | null;
  if (!fixture) {
    return (
      <main className="flex flex-1 items-center justify-center bg-hash p-8">
        <section className="card-brand max-w-md p-6 text-center">
          <h1 className="type-display text-2xl text-white">Match not found</h1>
          <p className="mt-2 text-sm text-steel">This draft link does not match a scheduled fixture.</p>
          <Link href="/captain" className="btn-pill mt-4 inline-block px-4 py-2 text-sm">Back to captain</Link>
        </section>
      </main>
    );
  }

  const overlay = firstParam(query.overlay) === "1";
  const teamNames = [fixture.team_a, fixture.team_b].filter((name): name is string => Boolean(name?.trim()));
  const [draftRowsResult, teamsResult, staffTier, settingsResult, champions, codesResult, leagueSettingsResult] = await Promise.all([
    supabase.from("match_drafts").select("*").eq("fixture_id", fixture.id).order("game_number"),
    teamNames.length
      ? supabase.from("teams").select("id, name, abbreviation, image_url").in("name", teamNames)
      : Promise.resolve({ data: [] }),
    fetchStaffTier(supabase),
    supabase.from("match_draft_settings").select("fixture_id, best_of, fearless").eq("fixture_id", fixture.id).maybeSingle(),
    fetchLiveChampions(),
    // Tourney codes for this fixture. RLS (match_codes_select) does the
    // gating: this returns rows only for the two teams' captains and
    // admins — spectators and the OBS overlay get an empty list.
    supabase.from("match_codes").select("game_number, code").eq("fixture_id", fixture.id).order("game_number"),
    supabase.from("league_settings").select("academy_season").eq("id", 1).maybeSingle(),
  ]);
  const tourneyCodes: Record<number, string> = {};
  for (const row of (codesResult.data as { game_number: number; code: string }[]) ?? []) {
    tourneyCodes[row.game_number] = row.code;
  }
  // Academy runs on its own season code, so the season tells us which
  // league's captain page the "report this result" link should target.
  const academySeason = (leagueSettingsResult.data as { academy_season: string | null } | null)?.academy_season ?? null;
  const reportHref = leaguePath("captain", academySeason && fixture.season === academySeason ? "academy" : "premier");

  const settings = settingsResult.data as MatchDraftSettingsRow | null;
  const seriesFormat: MatchDraftSeriesFormat = {
    bestOf: settings && [1, 3, 5].includes(settings.best_of) ? (settings.best_of as MatchDraftBestOf) : ((matchDraftBestOf(fixture) as MatchDraftBestOf) ?? 3),
    fearless: settings?.fearless ?? true,
  };
  const gameNumber = gameParam(firstParam(query.game), seriesFormat.bestOf);

  const rows = (draftRowsResult.data as MatchDraftRow[]) ?? [];
  const teamRows = (teamsResult.data as { id: string; name: string; abbreviation: string | null; image_url: string | null }[]) ?? [];
  const playerRowsResult = teamRows.length
    ? await supabase.from("players").select("team_id, display_name, role").in("team_id", teamRows.map((team) => team.id))
    : { data: [] };
  const playersByTeamId = new Map<string, { display_name: string; role: LolRole }[]>();
  for (const player of (playerRowsResult.data as { team_id: string; display_name: string; role: LolRole }[]) ?? []) {
    const players = playersByTeamId.get(player.team_id) ?? [];
    players.push(player);
    playersByTeamId.set(player.team_id, players);
  }
  const teams: Record<string, MatchDraftTeam> = {};
  for (const team of teamRows) {
    const players = (playersByTeamId.get(team.id) ?? [])
      .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.display_name.localeCompare(b.display_name))
      .map((player) => player.display_name);
    teams[teamSlug(team.name)] = {
      name: team.name,
      abbreviation: team.abbreviation || team.name.slice(0, 3).toUpperCase(),
      imageUrl: team.image_url,
      players,
    };
  }
  // Which of this fixture's teams (if any) the signed-in visitor captains —
  // presentation only, the drafter RPCs re-check server-side.
  const { data: userData } = await supabase.auth.getUser();
  let viewerTeamName: string | null = null;
  if (userData.user && teamNames.length) {
    const { data: captainRows } = await supabase
      .from("league_team_captains")
      .select("league_teams(name)")
      .eq("profile_id", userData.user.id)
      .eq("season", fixture.season);
    const fixtureNames = new Set(teamNames.map((name) => name.trim().toLowerCase()));
    viewerTeamName =
      ((captainRows ?? []) as unknown as { league_teams: { name: string } | null }[])
        .map((row) => row.league_teams?.name ?? "")
        .find((name) => fixtureNames.has(name.trim().toLowerCase())) ?? null;
  }

  // Captains and admins default to the board layout (pool front and
  // center); spectators get the stage view. ?layout= still overrides.
  const layout: MatchDraftLayout =
    layoutParam(firstParam(query.layout)) ??
    (viewerTeamName || staffTier.isAdmin || staffTier.isOwner ? "board" : "stage");

  const games: MatchDraftGameTab[] = matchDraftGameLinks(fixture, seriesFormat.bestOf).map((link) => ({
    gameNumber: link.gameNumber,
    href: link.href,
    status: rows.find((draft) => draft.game_number === link.gameNumber)?.status ?? null,
  }));
  // Every game's state ships to the client so the tabs switch instantly.
  const states = games.map((game) =>
    stateFor({
      fixture,
      row: rows.find((draft) => draft.game_number === game.gameNumber) ?? null,
      rows,
      gameNumber: game.gameNumber,
      layout,
      teams,
      fearless: seriesFormat.fearless,
    }),
  );

  return (
    <MatchDraftBoard
      initialState={states[gameNumber - 1] ?? states[0]}
      initialStates={states}
      viewerTeamName={viewerTeamName}
      overlay={overlay}
      champions={champions}
      games={games}
      seriesFormat={seriesFormat}
      canReset={staffTier.isAdmin || staffTier.isOwner}
      followLive={overlay && firstParam(query.game) === undefined}
      overlayTransparent={firstParam(query.bg) === "transparent"}
      tourneyCodes={tourneyCodes}
      reportHref={reportHref}
    />
  );
}
