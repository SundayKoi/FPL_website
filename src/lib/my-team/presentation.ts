import { ROLE_ORDER, type LolRole, type Player } from "@/lib/draft/types";
import type { MatchCode } from "@/lib/captain/queries";
import { normalizeName } from "@/lib/captain/teamNames";
import { FIXTURE_STAGES, type FixtureRow } from "@/lib/schedule/types";
import { hasResult } from "@/lib/schedule/format";

export type SeriesRecord = { wins: number; losses: number };

export type SeriesForm = {
  fixtureId: string;
  opponent: string;
  outcome: "W" | "L" | "T";
  myScore: number;
  opponentScore: number;
  scheduledAt: string | null;
};

export type LineupSlot = {
  role: LolRole;
  mine: Player | null;
  opponent: Player | null;
  viewerIsMine: boolean;
};

export type TournamentCodeSlot = {
  gameNumber: number;
  code: MatchCode | null;
};

const stageOrder = new Map(FIXTURE_STAGES.map((stage, index) => [stage, index]));

function fixtureTeamSide(fixture: FixtureRow, teamName: string): "a" | "b" | null {
  const target = normalizeName(teamName);
  if (normalizeName(fixture.team_a) === target) return "a";
  if (normalizeName(fixture.team_b) === target) return "b";
  return null;
}

function timeValue(value: string | null, missing: number): number {
  if (!value) return missing;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? missing : time;
}

function compareFixtureOrder(a: FixtureRow, b: FixtureRow, direction: "asc" | "desc"): number {
  const missing = direction === "asc" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  const aTime = timeValue(a.scheduled_at, missing);
  const bTime = timeValue(b.scheduled_at, missing);
  if (aTime !== bTime) return direction === "asc" ? aTime - bTime : bTime - aTime;

  const aStage = stageOrder.get(a.stage) ?? Number.POSITIVE_INFINITY;
  const bStage = stageOrder.get(b.stage) ?? Number.POSITIVE_INFINITY;
  if (aStage !== bStage) return aStage - bStage;
  if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
  return a.id.localeCompare(b.id);
}

function completedForTeam(fixtures: FixtureRow[], teamName: string): FixtureRow[] {
  return fixtures.filter((fixture) => hasResult(fixture) && fixtureTeamSide(fixture, teamName));
}

export function deriveSeriesRecord(fixtures: FixtureRow[], teamName: string): SeriesRecord {
  return completedForTeam(fixtures, teamName).reduce<SeriesRecord>(
    (record, fixture) => {
      const side = fixtureTeamSide(fixture, teamName);
      const myScore = side === "a" ? fixture.score_a : fixture.score_b;
      const opponentScore = side === "a" ? fixture.score_b : fixture.score_a;
      if (myScore === null || opponentScore === null) return record;
      if (myScore > opponentScore) record.wins += 1;
      if (myScore < opponentScore) record.losses += 1;
      return record;
    },
    { wins: 0, losses: 0 },
  );
}

export function deriveRecentSeries(
  fixtures: FixtureRow[],
  teamName: string,
  limit = 3,
): SeriesForm[] {
  return [...completedForTeam(fixtures, teamName)]
    .sort((a, b) => compareFixtureOrder(a, b, "desc"))
    .slice(0, Math.max(0, limit))
    .map((fixture) => {
      const side = fixtureTeamSide(fixture, teamName)!;
      const myScore = (side === "a" ? fixture.score_a : fixture.score_b)!;
      const opponentScore = (side === "a" ? fixture.score_b : fixture.score_a)!;
      return {
        fixtureId: fixture.id,
        opponent: ((side === "a" ? fixture.team_b : fixture.team_a)?.trim() || "TBD"),
        outcome: myScore === opponentScore ? "T" : myScore > opponentScore ? "W" : "L",
        myScore,
        opponentScore,
        scheduledAt: fixture.scheduled_at,
      };
    });
}

export function deriveUpcomingFixtures(fixtures: FixtureRow[], limit?: number): FixtureRow[] {
  const upcoming = fixtures.filter((fixture) => !hasResult(fixture)).sort((a, b) => compareFixtureOrder(a, b, "asc"));
  return limit === undefined ? upcoming : upcoming.slice(0, Math.max(0, limit));
}

function playerOrder(a: Player, b: Player): number {
  const idOrder = a.id.localeCompare(b.id);
  if (idOrder !== 0) return idOrder;
  const nameOrder = a.display_name.localeCompare(b.display_name);
  if (nameOrder !== 0) return nameOrder;
  return (a.canonical_player_id ?? "").localeCompare(b.canonical_player_id ?? "");
}

function playerForRole(players: Player[] | null, role: LolRole): Player | null {
  if (!players) return null;
  return [...players]
    .filter((player) => player.role === role)
    .sort(playerOrder)[0] ?? null;
}

export function buildLineupSlots(input: {
  mine: Player[];
  opponent: Player[] | null;
  playerPoolId: string | null;
}): LineupSlot[] {
  return ROLE_ORDER.map((role) => {
    const mine = playerForRole(input.mine, role);
    return {
      role,
      mine,
      opponent: playerForRole(input.opponent, role),
      viewerIsMine: Boolean(mine && input.playerPoolId && mine.canonical_player_id === input.playerPoolId),
    };
  });
}

function codeOrder(a: MatchCode, b: MatchCode): number {
  const createdOrder = a.created_at.localeCompare(b.created_at);
  if (createdOrder !== 0) return createdOrder;
  return a.id.localeCompare(b.id);
}

export function buildTournamentCodeSlots(codes: MatchCode[], bestOf: 1 | 3 | 5): TournamentCodeSlot[] {
  const byGame = new Map<number, MatchCode>();
  for (const code of [...codes].sort(codeOrder)) {
    if (code.game_number < 1 || code.game_number > bestOf || byGame.has(code.game_number)) continue;
    byGame.set(code.game_number, code);
  }
  return Array.from({ length: bestOf }, (_, index) => ({
    gameNumber: index + 1,
    code: byGame.get(index + 1) ?? null,
  }));
}
