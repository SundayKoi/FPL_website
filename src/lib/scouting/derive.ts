import { actionForStep, LCS_DRAFT_STEPS, normalizeChampionName } from "@/lib/match-draft/rules";
import { championDisplayName } from "@/lib/match-draft/champions";
import type { DraftSide, MatchDraftAction } from "@/lib/match-draft/types";
import { ROLE_LABELS, ROLE_ORDER } from "@/lib/draft/types";
import type { ChampionCount, DraftSlot, FullDraftSide, PastDraft, ScoutDraftRow, ScoutScope, ScoutSource, ScopedScoutData } from "./types";

export function scoutKey(value: string | null | undefined): string { return value?.trim().toLocaleLowerCase() ?? ""; }
export function resolveScoutedSide(game: ScoutDraftRow, opponentName: string): DraftSide | null {
  const target = scoutKey(opponentName);
  if (scoutKey(game.blue_team_name) === target) return "blue";
  if (scoutKey(game.red_team_name) === target) return "red";
  return null;
}

interface TeamGame { draft: ScoutDraftRow; fixture: ScoutSource["fixtures"][number]; side: DraftSide; }
const hasRecordedAction = (draft: ScoutDraftRow) => draft.actions.some((action) => Boolean(action.skipped || action.champion));
function allTeamGames(source: ScoutSource): TeamGame[] {
  const fixtures = new Map(source.fixtures.map((fixture) => [fixture.id, fixture]));
  return source.drafts.map((draft) => {
    const fixture = fixtures.get(draft.fixture_id); const side = resolveScoutedSide(draft, source.opponentName);
    return fixture && side && hasRecordedAction(draft) ? { draft, fixture, side } : null;
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
export function deriveScoutData(source: ScoutSource, scope: ScoutScope): ScopedScoutData {
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
      if (!current.draft.winner_team || !team || scoutKey(current.draft.winner_team) === scoutKey(team)) continue;
      lossesFollowed++;
      const picksFor = (game: TeamGame) => LCS_DRAFT_STEPS.filter((step) => step.side === game.side && step.kind === "pick").map((step) => { const action = actionForStep(game.draft.actions, step); return action?.skipped ? null : cleanChampion(action?.champion); }).filter((champion): champion is string => Boolean(champion));
      const before = picksFor(current); const after = picksFor(next);
      if (before[0] !== after[0]) changedFirstPick++;
      const prior = new Set(before.map((champion) => normalizeChampionName(championDisplayName(champion))));
      repeatedChampions += after.filter((champion) => prior.has(normalizeChampionName(championDisplayName(champion)))).length;
    }
  }
  const playerPools = source.roster.slice().sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.displayName.localeCompare(b.displayName)).slice(0, 5).map((player) => {
    let attributed = source.drafts.filter((draft) => draft.actions.some((action) => action.kind === "pick" && action.champion && scoutKey(action.playerName) === scoutKey(player.displayName)));
    if (scope === "season") attributed = attributed.filter((draft) => source.fixtures.find((fixture) => fixture.id === draft.fixture_id)?.season === source.currentSeason);
    if (scope === "recent") {
      const fixtureDates = new Map(source.fixtures.map((fixture) => [fixture.id, fixture.scheduled_at ?? ""]));
      const ids = [...new Set(attributed.map((draft) => draft.fixture_id))].sort((a, b) => (fixtureDates.get(b) ?? "").localeCompare(fixtureDates.get(a) ?? "")).slice(0, 5);
      attributed = attributed.filter((draft) => ids.includes(draft.fixture_id));
    }
    const counts: ChampionCounts = new Map();
    for (const draft of attributed) for (const action of draft.actions) if (action.kind === "pick" && action.champion && scoutKey(action.playerName) === scoutKey(player.displayName)) addChampion(counts, action.champion);
    const champions = rankNames(counts);
    return { playerName: player.displayName.trim(), role: player.role, champions: champions.slice(0, 5), distinctChampions: champions.length, totalPicks: champions.reduce((sum, row) => sum + row.count, 0), gamesSampled: new Set(attributed.map((draft) => draft.fixture_id)).size };
  });
  const flexCounts = new Map<string, Set<string>>();
  for (const game of games) {
    const confirmed = game.draft.positions?.[game.side]; if (!confirmed) continue;
    confirmed.forEach((champion, index) => { if (!champion || !ROLE_LABELS[ROLE_ORDER[index]]) return; const key = normalizeChampionName(championDisplayName(champion)); const roles = flexCounts.get(key) ?? new Set<string>(); roles.add(ROLE_LABELS[ROLE_ORDER[index]]); flexCounts.set(key, roles); });
  }
  const flexes = [...flexCounts.entries()].filter(([, roles]) => roles.size > 1).map(([key, roles]) => ({ champion: championDisplayName(key), roles: [...roles].sort((a, b) => ROLE_ORDER.indexOf(a.toLowerCase() as typeof ROLE_ORDER[number]) - ROLE_ORDER.indexOf(b.toLowerCase() as typeof ROLE_ORDER[number])) })).sort((a, b) => a.champion.localeCompare(b.champion));
  const pastDrafts: PastDraft[] = games.map((game) => ({ fixture: game.fixture, gameNumber: game.draft.game_number, side: game.side, winnerTeam: game.draft.winner_team, blue: sideDraft(game.draft, "blue"), red: sideDraft(game.draft, "red") }));
  return { gamesSampled: games.length, blueGames: games.filter((game) => game.side === "blue").length, distinctChampions: picked.size, firstPicks: rank(first, games.length), bannedAgainst: rank(against, games.length), banPhaseOne: rank(p1, games.length), banPhaseTwo: rank(p2, games.length), openings: rankNames(openingCounts), pairings: rankNames(pairingCounts), sideFacts, adaptation: { lossesFollowed, changedFirstPick, repeatedChampions }, flexes, playerPools, pastDrafts };
}
