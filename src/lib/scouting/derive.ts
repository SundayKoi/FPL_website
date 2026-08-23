import { actionForStep, LCS_DRAFT_STEPS } from "@/lib/match-draft/rules";
import type { DraftSide, MatchDraftAction } from "@/lib/match-draft/types";
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
const rank = (counts: Map<string, number>, denominator: number): ChampionCount[] => [...counts.entries()]
  .map(([champion, count]) => ({ champion, count, rate: denominator ? Math.round((count / denominator) * 1000) / 10 : 0 }))
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
  const games = scopeTeamGames(source, scope); const first = new Map<string, number>(); const against = new Map<string, number>(); const p1 = new Map<string, number>(); const p2 = new Map<string, number>(); const picked = new Set<string>();
  for (const game of games) {
    const own = LCS_DRAFT_STEPS.filter((step) => step.side === game.side && step.kind === "pick").map((step) => actionForStep(game.draft.actions, step));
    const firstPick = own.find((action) => action?.champion && !action.skipped); if (firstPick?.champion) { const champion = cleanChampion(firstPick.champion)!; first.set(champion, (first.get(champion) ?? 0) + 1); }
    for (const step of LCS_DRAFT_STEPS) { const action = actionForStep(game.draft.actions, step); const champion = cleanChampion(action?.champion); if (!champion || action?.skipped) continue; if (step.kind === "pick") picked.add(champion); else if (step.side !== game.side) { against.set(champion, (against.get(champion) ?? 0) + 1); } else { const target = step.slot <= 3 ? p1 : p2; target.set(champion, (target.get(champion) ?? 0) + 1); } }
  }
  const pastDrafts: PastDraft[] = games.map((game) => ({ fixture: game.fixture, gameNumber: game.draft.game_number, side: game.side, winnerTeam: game.draft.winner_team, blue: sideDraft(game.draft, "blue"), red: sideDraft(game.draft, "red") }));
  return { gamesSampled: games.length, blueGames: games.filter((game) => game.side === "blue").length, distinctChampions: picked.size, firstPicks: rank(first, games.length), bannedAgainst: rank(against, games.length), banPhaseOne: rank(p1, games.length), banPhaseTwo: rank(p2, games.length), openings: [], pairings: [], sideFacts: [], adaptation: { lossesFollowed: 0, changedFirstPick: 0, repeatedChampions: 0 }, flexes: [], playerPools: [], pastDrafts };
}
