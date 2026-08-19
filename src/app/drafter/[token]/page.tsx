import Link from "next/link";
import MatchDraftBoard from "@/components/match-draft/MatchDraftBoard";
import { fearlessBlockedChampions } from "@/lib/match-draft/rules";
import { fetchLiveChampions } from "@/lib/match-draft/liveRoster";
import type {
  MatchDraftAction,
  MatchDraftBestOf,
  MatchDraftGameTab,
  MatchDraftLayout,
  MatchDraftSeriesFormat,
  MatchDraftState,
  MatchDraftTeam,
  OpenDraftLobbyInfo,
  OpenDraftRow,
} from "@/lib/match-draft/types";
import { createServerSupabase } from "@/lib/supabase/server";

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function gameParam(value: string | undefined, bestOf: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return 1;
  return Math.min(parsed, bestOf);
}

function layoutParam(value: string | undefined): MatchDraftLayout {
  return value === "board" ? "board" : "stage";
}

function lobbyTeam(name: string, info: OpenDraftLobbyInfo): MatchDraftTeam {
  const label = name.trim() || "TBD";
  // Sides can swap between games, so player lists attach by team name.
  const key = label.toLowerCase();
  const players =
    key === info.teamA.trim().toLowerCase()
      ? info.teamAPlayers ?? []
      : key === info.teamB.trim().toLowerCase()
        ? info.teamBPlayers ?? []
        : [];
  return {
    name: label,
    abbreviation: label.slice(0, 3).toUpperCase(),
    imageUrl: null,
    players,
  };
}

function stateFor({
  info,
  row,
  rows,
  gameNumber,
  layout,
}: {
  info: OpenDraftLobbyInfo;
  row: OpenDraftRow | null;
  rows: OpenDraftRow[];
  gameNumber: number;
  layout: MatchDraftLayout;
}): MatchDraftState {
  const actions = (row?.actions ?? []).filter(
    (action): action is MatchDraftAction => Boolean(action && (action.champion || action.skipped)),
  );
  const prior = rows.map((draft) => ({ gameNumber: draft.game_number, actions: draft.actions ?? [] }));
  return {
    fixtureId: info.lobbyId,
    gameNumber,
    status: row?.status ?? "drafting",
    layout,
    currentStepIndex: row?.current_step_index ?? 0,
    turnStartedAt: row?.turn_started_at ?? null,
    blueTeam: lobbyTeam(row?.blue_team_name || info.teamA, info),
    redTeam: lobbyTeam(row?.red_team_name || info.teamB, info),
    scheduledTeams: [lobbyTeam(info.teamA, info), lobbyTeam(info.teamB, info)],
    canChooseSides: gameNumber > 1 && actions.length === 0,
    blueReady: row?.blue_ready ?? false,
    redReady: row?.red_ready ?? false,
    changeRequest: row?.change_request ?? null,
    sideChoiceRequired: gameNumber > 1 && actions.length === 0 && !(row?.blue_team_name && row?.red_team_name),
    actions,
    blockedChampions: info.fearless ? [...fearlessBlockedChampions(prior, gameNumber)] : [],
  };
}

export default async function OpenDraftLobbyPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { token } = await params;
  const query = await searchParams;
  const supabase = await createServerSupabase();

  const { data: infoData } = await supabase.rpc("open_draft_lobby_info", { p_token: token });
  const info = infoData as OpenDraftLobbyInfo | null;
  if (!info) {
    return (
      <main className="flex flex-1 items-center justify-center bg-hash p-8">
        <section className="card-brand max-w-md p-6 text-center">
          <h1 className="type-display text-2xl text-white">Lobby not found</h1>
          <p className="mt-2 text-sm text-steel">
            This draft link is invalid, or the lobby has expired (lobbies last 14 days).
          </p>
          <Link href="/drafter" className="btn-pill mt-4 inline-block px-4 py-2 text-sm">
            Create a new lobby
          </Link>
        </section>
      </main>
    );
  }

  const bestOf: MatchDraftBestOf = info.bestOf === 1 || info.bestOf === 5 ? info.bestOf : 3;
  const seriesFormat: MatchDraftSeriesFormat = { bestOf, fearless: info.fearless };
  const layout = layoutParam(firstParam(query.layout));
  const overlay = firstParam(query.overlay) === "1";
  const gameNumber = gameParam(firstParam(query.game), bestOf);

  const { data: rowsData } = await supabase
    .from("open_drafts")
    .select("*")
    .eq("lobby_id", info.lobbyId)
    .order("game_number");
  const rows = (rowsData as OpenDraftRow[]) ?? [];
  const champions = await fetchLiveChampions();

  const games: MatchDraftGameTab[] = Array.from({ length: bestOf }, (_, index) => {
    const game = index + 1;
    return {
      gameNumber: game,
      href: `/drafter/${token}?game=${game}`,
      status: rows.find((draft) => draft.game_number === game)?.status ?? null,
    };
  });
  // Every game's state ships to the client so the tabs switch instantly.
  const states = games.map((game) =>
    stateFor({
      info,
      row: rows.find((draft) => draft.game_number === game.gameNumber) ?? null,
      rows,
      gameNumber: game.gameNumber,
      layout,
    }),
  );

  return (
    <MatchDraftBoard
      initialState={states[gameNumber - 1] ?? states[0]}
      initialStates={states}
      viewerTeamName={info.teamName}
      overlay={overlay}
      champions={champions}
      games={games}
      seriesFormat={seriesFormat}
      lobby={{ lobbyId: info.lobbyId, token }}
      followLive={overlay && firstParam(query.game) === undefined}
    />
  );
}
