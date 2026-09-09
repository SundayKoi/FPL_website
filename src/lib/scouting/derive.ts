import { actionForStep, LCS_DRAFT_STEPS, normalizeChampionName } from "@/lib/match-draft/rules";
import { createDraftMatchupView } from "@/lib/match-draft/presentation";
import { championDisplayName } from "@/lib/match-draft/champions";
import type { DraftSide, MatchDraftAction } from "@/lib/match-draft/types";
import { ROLE_LABELS, ROLE_ORDER } from "@/lib/draft/types";
import type { ChampionCount, DraftSlot, FullDraftSide, PastDraft, ScoutDraftRow, ScoutScope, ScoutSource, ScopedScoutData } from "./types";
import type { IngestedScoutingCoverage, IngestedScoutingData } from "./inhouse";
import {
  createScoutingPerformanceAccumulator,
  mergeScoutingPerformances,
  normalizeScoutingPerformance,
  type PlayerChampionStat,
  type ScoutingGamePerformance,
} from "./performance";

export function scoutKey(value: string | null | undefined): string { return value?.trim().toLocaleLowerCase() ?? ""; }
export function resolveScoutedSide(game: ScoutDraftRow, opponentName: string): DraftSide | null {
  const target = scoutKey(opponentName);
  if (scoutKey(game.blue_team_name) === target) return "blue";
  if (scoutKey(game.red_team_name) === target) return "red";
  return null;
}

function sourceIngestedData(source: ScoutSource): IngestedScoutingData | null {
  const enrichCoverage = (games: IngestedScoutingData["games"], coverage: IngestedScoutingData["coverage"]): IngestedScoutingData["coverage"] => {
    const gamesByIdentity = new Map<string, IngestedScoutingData["games"]>();
    for (const game of games) {
      const key = [game.matchId, game.playerId, championKey(game.champion), game.fixtureId ?? "", game.gameNumber ?? ""].join("\u001f");
      gamesByIdentity.set(key, [...(gamesByIdentity.get(key) ?? []), game]);
    }
    return coverage.map((row) => {
      const matchingGames = gamesByIdentity.get([
        row.matchId, row.playerId ?? "", championKey(row.champion ?? ""), row.fixtureId ?? "", row.gameNumber ?? "",
      ].join("\u001f")) ?? [];
      return {
        ...row,
        performance: mergeScoutingPerformances([
          normalizeScoutingPerformance(row.performance),
          ...matchingGames.map((game) => normalizeScoutingPerformance(game.performance)),
        ]),
      };
    });
  };
  if (source.ingestedScouting) {
    if (source.ingestedScouting.coverage.length > 0) {
      return {
        ...source.ingestedScouting,
        coverage: enrichCoverage(source.ingestedScouting.games, source.ingestedScouting.coverage),
      };
    }
    if (source.ingestedScouting.games.length === 0) return source.ingestedScouting;
    return {
      ...source.ingestedScouting,
      coverage: source.ingestedScouting.games.map((game) => ({
        playerId: game.playerId,
        summonerName: game.playerName,
        tag: null,
        champion: game.champion,
        fixtureId: game.fixtureId,
        season: game.season,
        matchId: game.matchId,
        gameDate: game.gameDate,
        ...(game.gameNumber === undefined ? {} : { gameNumber: game.gameNumber }),
        ...(game.teamSide ? { teamSide: game.teamSide } : {}),
        ...(game.win === undefined ? {} : { win: game.win }),
        performance: normalizeScoutingPerformance(game.performance),
      })),
    };
  }
  if (!source.ingestedGames) return null;
  const legacyCoverage = source.ingestedCoverage ?? source.ingestedGames.map((game) => ({
    playerId: game.playerId,
    summonerName: game.playerName,
    tag: null,
    champion: game.champion,
    fixtureId: game.fixtureId,
    season: game.season,
    matchId: game.matchId,
    gameDate: game.gameDate,
    ...(game.gameNumber === undefined ? {} : { gameNumber: game.gameNumber }),
    ...(game.teamSide ? { teamSide: game.teamSide } : {}),
    ...(game.win === undefined ? {} : { win: game.win }),
    performance: normalizeScoutingPerformance(game.performance),
  }));
  return {
    games: source.ingestedGames,
    coverage: enrichCoverage(source.ingestedGames, legacyCoverage),
  };
}

function sourceIngestedGames(source: ScoutSource): NonNullable<ScoutSource["ingestedGames"]> {
  return sourceIngestedData(source)?.games ?? [];
}

function resolveRosterEvidenceSide(game: ScoutDraftRow, source: ScoutSource): DraftSide | null {
  const counts = new Map<DraftSide, Set<string>>();
  for (const row of sourceIngestedGames(source)) {
    if (row.fixtureId !== game.fixture_id || row.gameNumber !== game.game_number || !row.teamSide) continue;
    const players = counts.get(row.teamSide) ?? new Set<string>();
    players.add(row.playerId);
    counts.set(row.teamSide, players);
  }
  const ranked = (["blue", "red"] as DraftSide[])
    .map((side) => ({ side, count: counts.get(side)?.size ?? 0 }))
    .sort((a, b) => b.count - a.count);
  return ranked[0].count >= 3 && ranked[0].count > ranked[1].count ? ranked[0].side : null;
}

function resolveRosterEvidenceWinnerSide(game: ScoutDraftRow, source: ScoutSource): DraftSide | null {
  const votes = new Map<DraftSide, number>();
  for (const row of sourceIngestedGames(source)) {
    if (row.fixtureId !== game.fixture_id || row.gameNumber !== game.game_number || !row.teamSide || row.win === undefined) continue;
    const winnerSide = row.win ? row.teamSide : row.teamSide === "blue" ? "red" : "blue";
    votes.set(winnerSide, (votes.get(winnerSide) ?? 0) + 1);
  }
  const ranked = (["blue", "red"] as DraftSide[])
    .map((side) => ({ side, votes: votes.get(side) ?? 0 }))
    .sort((a, b) => b.votes - a.votes);
  return ranked[0].votes > 0 && ranked[0].votes > ranked[1].votes ? ranked[0].side : null;
}

function teamNameForSide(draft: ScoutDraftRow, fixture: ScoutSource["fixtures"][number], side: DraftSide): string | null {
  return side === "blue" ? draft.blue_team_name ?? fixture.team_a : draft.red_team_name ?? fixture.team_b;
}

function resolveWinnerTeam(draft: ScoutDraftRow, fixture: ScoutSource["fixtures"][number], source: ScoutSource): string | null {
  if (draft.winner_team) return draft.winner_team;
  const winnerSide = resolveRosterEvidenceWinnerSide(draft, source);
  return winnerSide ? teamNameForSide(draft, fixture, winnerSide) : null;
}

interface TeamGame { draft: ScoutDraftRow; fixture: ScoutSource["fixtures"][number]; side: DraftSide; winnerTeam: string | null; }
const hasRecordedAction = (draft: ScoutDraftRow) => draft.actions.some((action) => Boolean(action.skipped || action.champion));
function allTeamGames(source: ScoutSource): TeamGame[] {
  const fixtures = new Map(source.fixtures.map((fixture) => [fixture.id, fixture]));
  return source.drafts.map((draft) => {
    const fixture = fixtures.get(draft.fixture_id);
    const side = resolveScoutedSide(draft, source.opponentName) ?? resolveRosterEvidenceSide(draft, source);
    return fixture && side && hasRecordedAction(draft)
      ? { draft, fixture, side, winnerTeam: resolveWinnerTeam(draft, fixture, source) }
      : null;
  }).filter((game): game is TeamGame => Boolean(game)).sort((a, b) => {
    const date = (b.fixture.scheduled_at ?? "").localeCompare(a.fixture.scheduled_at ?? "");
    return date || b.draft.game_number - a.draft.game_number;
  });
}
export function scopeTeamGames(source: ScoutSource, scope: ScoutScope): TeamGame[] {
  let games = allTeamGames(source);
  if (scope === "season") games = games.filter((game) => game.fixture.season === source.currentSeason);
  if (scope === "recent") {
    const ids = new Set<string>();
    games = games.filter((game) => { if (ids.has(game.fixture.id)) return true; if (ids.size >= 5) return false; ids.add(game.fixture.id); return true; });
  }
  return games;
}

const cleanChampion = (value: string | null | undefined) => value?.trim().replace(/\s+/g, " ") || null;
type ChampionCounts = Map<string, { champion: string; count: number }>;
const addChampion = (counts: ChampionCounts, value: string) => {
  const champion = championDisplayName(cleanChampion(value) ?? value);
  const key = normalizeChampionName(champion);
  const current = counts.get(key);
  counts.set(key, { champion: current?.champion ?? champion, count: (current?.count ?? 0) + 1 });
};
const rank = (counts: ChampionCounts, denominator: number): ChampionCount[] => [...counts.values()]
  .map(({ champion, count }) => ({ champion, count, rate: denominator ? Math.round((count / denominator) * 1000) / 10 : 0 }))
  .sort((a, b) => b.count - a.count || a.champion.localeCompare(b.champion));
const rankNames = (counts: Map<string, { champion: string; count: number }>) => [...counts.values()]
  .sort((a, b) => b.count - a.count || a.champion.localeCompare(b.champion));
const slot = (action: MatchDraftAction | null): DraftSlot => ({ champion: cleanChampion(action?.champion), skipped: Boolean(action?.skipped || !action), playerName: action?.playerName ?? null });
function sideDraft(draft: ScoutDraftRow, side: DraftSide): FullDraftSide {
  const steps = LCS_DRAFT_STEPS.filter((step) => step.side === side);
  return { teamName: side === "blue" ? draft.blue_team_name : draft.red_team_name,
    picks: steps.filter((step) => step.kind === "pick").map((step) => slot(actionForStep(draft.actions, step))),
    banPhaseOne: steps.filter((step) => step.kind === "ban" && step.slot <= 3).map((step) => slot(actionForStep(draft.actions, step))),
    banPhaseTwo: steps.filter((step) => step.kind === "ban" && step.slot > 3).map((step) => slot(actionForStep(draft.actions, step))), };
}

type PoolEvidence = "riot" | "draft";
interface PoolPick {
  playerId: string;
  champion: string;
  matchId: string;
  evidence: PoolEvidence;
  fixtureId: string | null;
  gameNumber?: number;
  performance: ScoutingGamePerformance;
}

interface ResolvedIngestedPicks {
  picks: PoolPick[];
  coveredGameKeys: Set<string>;
  unresolvedGameKeys: Set<string>;
}

const draftGameKey = (fixtureId: string, gameNumber: number): string => `${fixtureId}:${gameNumber}`;
const pickGameKey = (pick: Pick<PoolPick, "fixtureId" | "gameNumber" | "matchId">): string =>
  pick.fixtureId && pick.gameNumber !== undefined
    ? draftGameKey(pick.fixtureId, pick.gameNumber)
    : `match:${pick.matchId}`;
const championKey = (value: string): string => normalizeChampionName(championDisplayName(cleanChampion(value) ?? value));
const participantKey = (row: IngestedScoutingCoverage): string => {
  const name = scoutKey(row.summonerName).replace(/\s+/g, " ");
  const tag = scoutKey(row.tag);
  return name ? `${name}#${tag}` : "";
};

function uniqueCoverageRows(rows: IngestedScoutingCoverage[]): IngestedScoutingCoverage[] {
  const merged = new Map<string, IngestedScoutingCoverage>();
  for (const row of rows) {
    const key = [
      row.matchId,
      row.fixtureId ?? "",
      row.gameNumber ?? "",
      participantKey(row),
      row.champion ?? "",
      row.teamSide ?? "",
      row.playerId ?? "",
    ].join("\u001f");
    const current = merged.get(key);
    merged.set(key, current
      ? { ...current, performance: mergeScoutingPerformances([
          normalizeScoutingPerformance(current.performance),
          normalizeScoutingPerformance(row.performance),
        ]) }
      : { ...row, performance: normalizeScoutingPerformance(row.performance) });
  }
  return [...merged.values()];
}

interface ResolvedCoverageMatch {
  picks: Array<PoolPick & { teamSide?: DraftSide; participantKey: string }>;
  unresolvedParticipantKeys: Set<string>;
  invalidPlayerIds: Set<string>;
}

function resolveCoverageMatch(
  rows: IngestedScoutingCoverage[],
  rosterById: ReadonlyMap<string, ScoutSource["roster"][number]>,
): ResolvedCoverageMatch {
  const byParticipant = new Map<string, IngestedScoutingCoverage[]>();
  for (const row of uniqueCoverageRows(rows)) {
    const key = participantKey(row);
    if (!key) continue;
    byParticipant.set(key, [...(byParticipant.get(key) ?? []), row]);
  }

  const unresolvedParticipantKeys = new Set<string>();
  const candidates: Array<PoolPick & { teamSide?: DraftSide; participantKey: string }> = [];
  for (const [key, participantRows] of byParticipant) {
    const championRows = participantRows.filter((row) => row.champion);
    const champions = new Set(championRows.map((row) => championKey(row.champion!)));
    const ownerIds = new Set(participantRows.map((row) => row.playerId).filter((id): id is string => Boolean(id)));
    const sideValues = new Set(participantRows.map((row) => row.teamSide ?? "unknown"));
    const owner = ownerIds.size === 1 ? [...ownerIds][0] : null;
    const side = sideValues.size === 1 && !sideValues.has("unknown") ? [...sideValues][0] as DraftSide : undefined;
    if (
      participantRows.some((row) => row.playerId === null || row.champion === null) ||
      champions.size !== 1 ||
      ownerIds.size !== 1 ||
      sideValues.size !== 1 ||
      !owner ||
      !rosterById.has(owner)
    ) {
      unresolvedParticipantKeys.add(key);
      continue;
    }
    candidates.push({
      playerId: owner,
      champion: championRows[0].champion!,
      matchId: participantRows[0].matchId,
      evidence: "riot",
      fixtureId: participantRows[0].fixtureId,
      ...(participantRows[0].gameNumber === undefined ? {} : { gameNumber: participantRows[0].gameNumber }),
      ...(side ? { teamSide: side } : {}),
      performance: mergeScoutingPerformances(participantRows.map((row) => normalizeScoutingPerformance(row.performance))),
      participantKey: key,
    });
  }

  const candidatesByPlayer = new Map<string, typeof candidates>();
  for (const candidate of candidates) {
    candidatesByPlayer.set(candidate.playerId, [...(candidatesByPlayer.get(candidate.playerId) ?? []), candidate]);
  }
  const invalidPlayerIds = new Set<string>();
  for (const [playerId, playerCandidates] of candidatesByPlayer) {
    if (new Set(playerCandidates.map((candidate) => candidate.participantKey)).size > 1) {
      invalidPlayerIds.add(playerId);
      for (const candidate of playerCandidates) unresolvedParticipantKeys.add(candidate.participantKey);
    }
  }

  return {
    picks: candidates.filter((candidate) => !invalidPlayerIds.has(candidate.playerId)),
    unresolvedParticipantKeys,
    invalidPlayerIds,
  };
}

function scopedIngestedRows(
  source: ScoutSource,
  scope: ScoutScope,
  rows: NonNullable<ScoutSource["ingestedGames"]>,
): NonNullable<ScoutSource["ingestedGames"]> {
  const sourceFixtureIds = new Set(source.fixtures.map((fixture) => fixture.id));
  let scoped = rows.filter((row) =>
    (scope === "all" || row.season === source.currentSeason) && (!row.fixtureId || sourceFixtureIds.has(row.fixtureId)),
  );
  if (scope !== "recent") return scoped;

  const latestByFixture = new Map<string, (typeof scoped)[number]>();
  for (const row of scoped) {
    if (!row.fixtureId) continue;
    const latest = latestByFixture.get(row.fixtureId);
    if (!latest || (row.gameDate ?? "") > (latest.gameDate ?? "")) latestByFixture.set(row.fixtureId, row);
  }
  if (latestByFixture.size > 0) {
    const recentFixtureIds = new Set(
      [...latestByFixture.values()]
        .sort((a, b) => (b.gameDate ?? "").localeCompare(a.gameDate ?? ""))
        .slice(0, 5)
        .map((row) => row.fixtureId!),
    );
    const recentUnmappedMatchIds = new Set(
      [...new Map(scoped.filter((row) => row.fixtureId === null).map((row) => [row.matchId, row])).values()]
        .sort((a, b) => (b.gameDate ?? "").localeCompare(a.gameDate ?? ""))
        .slice(0, 5)
        .map((row) => row.matchId),
    );
    scoped = scoped.filter((row) => row.fixtureId ? recentFixtureIds.has(row.fixtureId) : recentUnmappedMatchIds.has(row.matchId));
  } else {
    const recentMatchIds = new Set(
      [...new Map(scoped.map((row) => [row.matchId, row])).values()]
        .sort((a, b) => (b.gameDate ?? "").localeCompare(a.gameDate ?? ""))
        .slice(0, 5)
        .map((row) => row.matchId),
    );
    scoped = scoped.filter((row) => recentMatchIds.has(row.matchId));
  }
  return scoped;
}

function resolveIngestedPicks(
  source: ScoutSource,
  games: TeamGame[],
  scope: ScoutScope,
  data: IngestedScoutingData,
): ResolvedIngestedPicks {
  const rosterById = new Map(source.roster.map((player) => [player.id, player]));
  const eligibleByKey = new Map(games.map((game) => [draftGameKey(game.fixture.id, game.draft.game_number), game]));
  const coverageByMatch = new Map<string, IngestedScoutingCoverage[]>();
  const coverageByGameKey = new Map<string, IngestedScoutingCoverage[]>();
  for (const row of uniqueCoverageRows(data.coverage)) {
    coverageByMatch.set(row.matchId, [...(coverageByMatch.get(row.matchId) ?? []), row]);
    if (row.fixtureId && row.gameNumber !== undefined) {
      const key = draftGameKey(row.fixtureId, row.gameNumber);
      coverageByGameKey.set(key, [...(coverageByGameKey.get(key) ?? []), row]);
    }
  }

  const coveredGameKeys = new Set<string>();
  const unresolvedGameKeys = new Set<string>();
  for (const game of games) {
    const key = draftGameKey(game.fixture.id, game.draft.game_number);
    const coverage = coverageByGameKey.get(key) ?? [];
    if (coverage.length === 0) continue;
    coveredGameKeys.add(key);
    const targetRows = coverage.filter((row) => row.teamSide === game.side);
    const sideUnknown = coverage.some((row) => !row.teamSide);
    const targetParticipantKeys = new Set(targetRows.map(participantKey).filter(Boolean));
    const resolved = new Map<string, ResolvedCoverageMatch>();
    for (const row of coverage) {
      if (!resolved.has(row.matchId)) resolved.set(row.matchId, resolveCoverageMatch(coverageByMatch.get(row.matchId) ?? [], rosterById));
    }
    const unresolved = sideUnknown || targetRows.length === 0 || targetRows.some((row) =>
      !participantKey(row) ||
      row.playerId === null ||
      !rosterById.has(row.playerId) ||
      (targetParticipantKeys.has(participantKey(row)) && [...resolved.values()].some((match) => match.unresolvedParticipantKeys.has(participantKey(row)))),
    );
    if (unresolved) unresolvedGameKeys.add(key);
  }

  const scopedRows = scopedIngestedRows(source, scope, data.games);
  const scopedMatchIds = new Set(scopedRows.map((row) => row.matchId));
  const accepted = new Map<string, PoolPick>();
  const acceptedPerformance = new Map<string, ScoutingGamePerformance[]>();
  const conflicts = new Set<string>();
  for (const [matchId, coverage] of coverageByMatch) {
    if (!scopedMatchIds.has(matchId)) continue;
    const resolved = resolveCoverageMatch(coverage, rosterById);
    for (const candidate of resolved.picks) {
      const bridgedGame = candidate.fixtureId && candidate.gameNumber !== undefined
        ? eligibleByKey.get(draftGameKey(candidate.fixtureId, candidate.gameNumber))
        : undefined;
      if (bridgedGame && candidate.teamSide && candidate.teamSide !== bridgedGame.side) continue;
      const identity = bridgedGame
        ? `bridge:${draftGameKey(bridgedGame.fixture.id, bridgedGame.draft.game_number)}:${candidate.playerId}`
        : `match:${candidate.matchId}:${candidate.playerId}`;
      const current = accepted.get(identity);
      if (conflicts.has(identity)) continue;
      if (current && championKey(current.champion) !== championKey(candidate.champion)) {
        accepted.delete(identity);
        acceptedPerformance.delete(identity);
        conflicts.add(identity);
        continue;
      }
      const performanceSamples = [...(acceptedPerformance.get(identity) ?? []), candidate.performance];
      acceptedPerformance.set(identity, performanceSamples);
      accepted.set(identity, {
        playerId: candidate.playerId,
        champion: candidate.champion,
        matchId: candidate.matchId,
        evidence: "riot",
        fixtureId: candidate.fixtureId,
        ...(candidate.gameNumber === undefined ? {} : { gameNumber: candidate.gameNumber }),
        performance: mergeScoutingPerformances(performanceSamples),
      });
    }
  }

  return { picks: [...accepted.values()], coveredGameKeys, unresolvedGameKeys };
}

function resolveDraftOnlyPicks(source: ScoutSource, games: TeamGame[], coveredGameKeys: ReadonlySet<string>): PoolPick[] {
  const byName = new Map<string, ScoutSource["roster"][number] | null>();
  for (const player of source.roster) {
    const key = scoutKey(player.displayName);
    const current = byName.get(key);
    byName.set(key, current === undefined || current?.id === player.id ? player : null);
  }

  const picks: PoolPick[] = [];
  for (const game of games) {
    const gameKey = draftGameKey(game.fixture.id, game.draft.game_number);
    if (coveredGameKeys.has(gameKey)) continue;
    const byPlayer = new Map<string, PoolPick>();
    const conflictingPlayers = new Set<string>();
    for (const step of LCS_DRAFT_STEPS.filter((candidate) => candidate.side === game.side && candidate.kind === "pick")) {
      const action = actionForStep(game.draft.actions, step);
      if (!action?.champion || action.skipped || action.side !== game.side || !action.playerName) continue;
      const player = byName.get(scoutKey(action.playerName)) ?? null;
      if (!player) continue;
      const current = byPlayer.get(player.id);
      const pick = {
        playerId: player.id,
        champion: action.champion,
        matchId: gameKey,
        evidence: "draft" as const,
        fixtureId: game.fixture.id,
        gameNumber: game.draft.game_number,
        performance: normalizeScoutingPerformance(),
      };
      if (current && championKey(current.champion) !== championKey(pick.champion)) {
        byPlayer.delete(player.id);
        conflictingPlayers.add(player.id);
      } else if (!conflictingPlayers.has(player.id)) {
        byPlayer.set(player.id, pick);
      }
    }
    picks.push(...byPlayer.values());
  }
  return picks;
}

export interface DeriveScoutDataOptions {
  playerLimit?: number | null;
}

export function deriveScoutData(
  source: ScoutSource,
  scope: ScoutScope,
  options: DeriveScoutDataOptions = {},
): ScopedScoutData {
  const games = scopeTeamGames(source, scope); const first: ChampionCounts = new Map(); const against: ChampionCounts = new Map(); const p1: ChampionCounts = new Map(); const p2: ChampionCounts = new Map(); const picked = new Set<string>();
  for (const game of games) {
    const own = LCS_DRAFT_STEPS.filter((step) => step.side === game.side && step.kind === "pick").map((step) => actionForStep(game.draft.actions, step));
    const firstPick = own.find((action) => action?.champion && !action.skipped); if (firstPick?.champion) addChampion(first, firstPick.champion);
    for (const step of LCS_DRAFT_STEPS) { const action = actionForStep(game.draft.actions, step); const champion = cleanChampion(action?.champion); if (!champion || action?.skipped) continue; if (step.kind === "pick") { if (step.side === game.side) picked.add(normalizeChampionName(championDisplayName(champion))); } else if (step.side !== game.side) { addChampion(against, champion); } else { addChampion(step.slot <= 3 ? p1 : p2, champion); } }
  }
  const openingCounts = new Map<string, { champion: string; count: number }>();
  const pairingCounts = new Map<string, { champion: string; count: number }>();
  const sideOpeningCounts = new Map<DraftSide, Map<string, { champion: string; count: number }>>();
  for (const game of games) {
    const picks = LCS_DRAFT_STEPS.filter((step) => step.side === game.side && step.kind === "pick")
      .map((step) => actionForStep(game.draft.actions, step))
      .filter((action): action is MatchDraftAction => Boolean(action?.champion && !action.skipped))
      .map((action) => championDisplayName(cleanChampion(action.champion)!));
    if (picks.length >= 3) {
      const opening = picks.slice(0, 3).join(" / ");
      const current = openingCounts.get(opening); openingCounts.set(opening, { champion: opening, count: (current?.count ?? 0) + 1 });
    }
    const sideCounts = sideOpeningCounts.get(game.side) ?? new Map<string, { champion: string; count: number }>();
    if (picks[0]) { const current = sideCounts.get(picks[0]); sideCounts.set(picks[0], { champion: picks[0], count: (current?.count ?? 0) + 1 }); }
    sideOpeningCounts.set(game.side, sideCounts);
    const uniquePicks = [...new Set(picks)];
    for (let i = 0; i < uniquePicks.length; i++) for (let j = i + 1; j < uniquePicks.length; j++) {
      const pair = [uniquePicks[i], uniquePicks[j]].sort((a, b) => a.localeCompare(b)).join(" + ");
      const current = pairingCounts.get(pair); pairingCounts.set(pair, { champion: pair, count: (current?.count ?? 0) + 1 });
    }
  }
  const sideFacts = (['blue', 'red'] as DraftSide[]).map((side) => {
    const sideGames = games.filter((game) => game.side === side);
    return { side, games: sideGames.length, commonOpening: rankNames(sideOpeningCounts.get(side) ?? new Map())[0] ?? null };
  });
  let lossesFollowed = 0; let changedFirstPick = 0; let repeatedChampions = 0;
  const byFixture = new Map<string, TeamGame[]>();
  for (const game of games) byFixture.set(game.fixture.id, [...(byFixture.get(game.fixture.id) ?? []), game]);
  for (const fixtureGames of byFixture.values()) {
    const ordered = [...fixtureGames].sort((a, b) => a.draft.game_number - b.draft.game_number);
    for (let i = 0; i < ordered.length - 1; i++) {
      const current = ordered[i]; const next = ordered[i + 1];
      const team = current.side === "blue" ? current.draft.blue_team_name : current.draft.red_team_name;
      if (!current.winnerTeam || !team || scoutKey(current.winnerTeam) === scoutKey(team)) continue;
      lossesFollowed++;
      const picksFor = (game: TeamGame) => LCS_DRAFT_STEPS.filter((step) => step.side === game.side && step.kind === "pick").map((step) => { const action = actionForStep(game.draft.actions, step); return action?.skipped ? null : cleanChampion(action?.champion); }).filter((champion): champion is string => Boolean(champion));
      const before = picksFor(current); const after = picksFor(next);
      const beforeKey = before[0] ? normalizeChampionName(championDisplayName(before[0])) : null;
      const afterKey = after[0] ? normalizeChampionName(championDisplayName(after[0])) : null;
      if (beforeKey !== afterKey) changedFirstPick++;
      const prior = new Set(before.map((champion) => normalizeChampionName(championDisplayName(champion))));
      repeatedChampions += after.filter((champion) => prior.has(normalizeChampionName(championDisplayName(champion)))).length;
    }
  }
  const sortedRoster = source.roster.slice().sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.displayName.localeCompare(b.displayName));
  const poolRoster = options.playerLimit === null
    ? sortedRoster
    : sortedRoster.slice(0, options.playerLimit ?? 5);
  const ingestion = sourceIngestedData(source);
  const resolvedIngested = ingestion
    ? resolveIngestedPicks(source, games, scope, ingestion)
    : { picks: [], coveredGameKeys: new Set<string>(), unresolvedGameKeys: new Set<string>() };
  const poolPicks = resolvedIngested.picks.concat(resolveDraftOnlyPicks(source, games, resolvedIngested.coveredGameKeys));
  const playerPools = poolRoster.map((player) => {
    const picks = poolPicks.filter((pick) => pick.playerId === player.id);
    const counts: ChampionCounts = new Map();
    for (const pick of picks) addChampion(counts, pick.champion);
    const champions: PlayerChampionStat[] = rankNames(counts).map((champion) => {
      const championPicks = picks.filter((pick) => championKey(pick.champion) === championKey(champion.champion));
      const performance = createScoutingPerformanceAccumulator();
      for (const pick of championPicks) performance.add({ gameKey: pickGameKey(pick), performance: pick.performance });
      return { ...champion, performance: performance.result() };
    });
    return {
      playerId: player.id,
      playerName: player.displayName.trim(),
      role: player.role,
      champions,
      distinctChampions: champions.length,
      totalPicks: champions.reduce((sum, row) => sum + row.count, 0),
      gamesSampled: new Set(picks.map(pickGameKey)).size,
      riotConfirmedPicks: picks.filter((pick) => pick.evidence === "riot").length,
      draftOnlyPicks: picks.filter((pick) => pick.evidence === "draft").length,
    };
  });
  const flexCounts = new Map<string, Set<string>>();
  for (const game of games) {
    const confirmed = game.draft.positions?.[game.side]; if (!confirmed) continue;
    confirmed.forEach((champion, index) => { if (!champion || !ROLE_LABELS[ROLE_ORDER[index]]) return; const key = normalizeChampionName(championDisplayName(champion)); const roles = flexCounts.get(key) ?? new Set<string>(); roles.add(ROLE_LABELS[ROLE_ORDER[index]]); flexCounts.set(key, roles); });
  }
  const flexes = [...flexCounts.entries()].filter(([, roles]) => roles.size > 1).map(([key, roles]) => ({ champion: championDisplayName(key), roles: [...roles].sort((a, b) => ROLE_ORDER.indexOf(a.toLowerCase() as typeof ROLE_ORDER[number]) - ROLE_ORDER.indexOf(b.toLowerCase() as typeof ROLE_ORDER[number])) })).sort((a, b) => a.champion.localeCompare(b.champion));
  const pastDrafts: PastDraft[] = games.map((game) => ({
    fixture: game.fixture,
    gameNumber: game.draft.game_number,
    side: game.side,
    winnerTeam: game.winnerTeam,
    blue: sideDraft(game.draft, "blue"),
    red: sideDraft(game.draft, "red"),
    matchup: createDraftMatchupView({
      gameNumber: game.draft.game_number,
      blueTeam: { name: teamNameForSide(game.draft, game.fixture, "blue") },
      redTeam: { name: teamNameForSide(game.draft, game.fixture, "red") },
      actions: game.draft.actions,
      positions: game.draft.positions,
      winnerTeam: game.winnerTeam,
      metadata: { railNote: `Scouted team: ${game.side === "blue" ? "Blue side" : "Red side"}` },
    }),
  }));
  return {
    gamesSampled: games.length,
    blueGames: games.filter((game) => game.side === "blue").length,
    distinctChampions: picked.size,
    firstPicks: rank(first, games.length),
    bannedAgainst: rank(against, games.length),
    banPhaseOne: rank(p1, games.length),
    banPhaseTwo: rank(p2, games.length),
    openings: rankNames(openingCounts),
    pairings: rankNames(pairingCounts).filter((row) => row.count >= 3),
    sideFacts,
    adaptation: { lossesFollowed, changedFirstPick, repeatedChampions },
    flexes,
    playerPools,
    pastDrafts,
    ingestionAvailable: source.ingestedScoutingStatus !== "unavailable" && Boolean(ingestion),
    unresolvedIngestedGames: resolvedIngested.unresolvedGameKeys.size,
  };
}
