import { stageMeta } from "@/lib/schedule/format";
import type { FixtureRow } from "@/lib/schedule/types";
import type { DraftStep, MatchDraftAction, MatchDraftLink } from "./types";

export const DRAFT_TURN_SECONDS = 30;

const step = (
  index: number,
  side: DraftStep["side"],
  kind: DraftStep["kind"],
  slot: number,
): DraftStep => ({ index, side, kind, slot, seconds: DRAFT_TURN_SECONDS });

export const LCS_DRAFT_STEPS: DraftStep[] = [
  step(0, "blue", "ban", 1),
  step(1, "red", "ban", 1),
  step(2, "blue", "ban", 2),
  step(3, "red", "ban", 2),
  step(4, "blue", "ban", 3),
  step(5, "red", "ban", 3),
  step(6, "blue", "pick", 1),
  step(7, "red", "pick", 1),
  step(8, "red", "pick", 2),
  step(9, "blue", "pick", 2),
  step(10, "blue", "pick", 3),
  step(11, "red", "pick", 3),
  step(12, "red", "ban", 4),
  step(13, "blue", "ban", 4),
  step(14, "red", "ban", 5),
  step(15, "blue", "ban", 5),
  step(16, "red", "pick", 4),
  step(17, "blue", "pick", 4),
  step(18, "blue", "pick", 5),
  step(19, "red", "pick", 5),
];

/** How many games the drafter offers for a fixture — regular-season series
 *  are Bo3 fearless regardless of the fixture row's best_of. */
export function matchDraftBestOf(fixture: FixtureRow): number {
  return stageMeta(fixture.stage).group === "Regular Season" ? 3 : fixture.best_of;
}

/** The fixture's single shareable drafter link — games are tabs inside the
 *  drafter (drafterlol-style) rather than separate per-game URLs. */
export function matchDraftHref(fixture: FixtureRow): string {
  return `/match-draft/${fixture.id}`;
}

/** Per-game tab links within one fixture's drafter. `bestOf` overrides the
 *  stage default when the series has a stored match_draft_settings row. */
export function matchDraftGameLinks(fixture: FixtureRow, bestOf: number = matchDraftBestOf(fixture)): MatchDraftLink[] {
  return Array.from({ length: bestOf }, (_, index) => {
    const gameNumber = index + 1;
    return {
      gameNumber,
      href: `/match-draft/${fixture.id}?game=${gameNumber}`,
      label: `Game ${gameNumber}`,
    };
  });
}

export function actionForStep(actions: MatchDraftAction[], stepToFind: DraftStep): MatchDraftAction | null {
  return actions.find((action) => {
    if (typeof action.stepIndex === "number") return action.stepIndex === stepToFind.index;
    return action.side === stepToFind.side && action.kind === stepToFind.kind && action.slot === stepToFind.slot;
  }) ?? null;
}

export function normalizeChampionName(champion: string): string {
  return champion.trim().replace(/\s+/g, " ").toLowerCase();
}

export function fearlessBlockedChampions(
  drafts: { gameNumber: number; actions: Pick<MatchDraftAction, "kind" | "champion">[] }[],
  gameNumber: number,
): Set<string> {
  const blocked = new Set<string>();
  for (const draft of drafts) {
    if (draft.gameNumber >= gameNumber) continue;
    for (const action of draft.actions) {
      if (action.kind === "pick" && action.champion?.trim()) blocked.add(action.champion);
    }
  }
  return blocked;
}

export function isChampionUnavailable(
  champion: string,
  actions: MatchDraftAction[],
  blockedChampions: string[],
): boolean {
  const target = normalizeChampionName(champion);
  return [...blockedChampions, ...actions.map((action) => action.champion)]
    .filter((used): used is string => Boolean(used))
    .some((used) => normalizeChampionName(used) === target);
}

/** The smallest step (0-19) with no recorded action — or null when the draft
 *  is full. Mirrors public.match_draft_next_step in SQL: advancement always
 *  jumps to the next EMPTY step, so a step reopened by an approved change
 *  request gets drafted before play resumes at the end. */
export function nextEmptyStepIndex(actions: Pick<MatchDraftAction, "stepIndex">[]): number | null {
  const taken = new Set(actions.map((action) => action.stepIndex));
  for (const step of LCS_DRAFT_STEPS) {
    if (!taken.has(step.index)) return step.index;
  }
  return null;
}
