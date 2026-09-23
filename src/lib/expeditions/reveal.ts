// The road ahead is earned: which checkpoints a squad knows before it
// reaches them, and the one thing an unknown checkpoint still gives away.
//
// A run's road is derived from its seed (routes.ts), so the server always
// knows every place on it. What the SQUAD knows is narrower, and it is the
// only thing the board may show (views.ts builds the board's view from
// this). Checkpoint i is known when any of these holds — spec §4.2, in the
// order a player meets them:
//
//   walked    it is open, decided or missed; or the run is claimed.
//   campaign  the road was handed down by a campaign (run.road): the squad
//             set out with the map.
//   fragment  the collector paid a map fragment to reveal the road
//             (expedition_reveals, reveal_expedition_road).
//   convoy    the convoy partner paid for theirs: two squads on one road
//             share one map.
//   scout     fork i−1 was answered with a scout: the Jungle went ahead.
//   edge      under ARCHETYPE_RULES only: Jungle Diff knows the next two
//             checkpoints, The Warden the next one.
//   trail     a Trailworn card knows the next checkpoint, a Veteran the
//             next two, a Wayfarer the whole road.
//
// When several hold, the first in that list names it. An unknown checkpoint
// still shows whether the squad dreads it (its `warned` flag: "the squad
// has a bad feeling about the third stop"); The Warden also shows whether
// it is dark and whether it charges a toll. Nothing else about an unknown
// place leaves the server.
//
// Every rule except the edges is presentation over what the run already
// is, so it applies to every run in the field from the day it ships; the
// edges change what a squad of rules 6 knows, and nothing below it.
//
// Pure and client-safe: no import of routes.ts' values or journal.ts, so
// the numbers here can be quoted by any surface.

import { traitsOf, type AbilityReveal } from "./archetypes";
import type { CardCopy } from "./config";
import type { ForkStatus, RecordedChoice } from "./forks";
import type { ForkDef } from "./routes";
import { trailTitleOf, type TrailTitleKey } from "./trail";

/** Map fragments a reveal costs. reveal_expedition_road charges the same
 *  (its `v_cost`); reveal.test.ts reads the migration and holds the two
 *  together. */
export const REVEAL_FRAGMENTS = 1;

/** Why a checkpoint is known — the order of the list is the order of
 *  precedence when more than one holds. */
export type RevealedBy = "walked" | "campaign" | "fragment" | "convoy" | "scout" | "edge" | "trail";

export const REVEAL_ORDER: readonly RevealedBy[] = ["walked", "campaign", "fragment", "convoy", "scout", "edge", "trail"];

/** A run as the reveal rules read it. */
export interface RevealRun {
  forks: number;
  rules: number;
  claimedAt: string | null;
  choices: Pick<RecordedChoice, "index" | "choice">[];
  /** A campaign's handed-down road, one place key per checkpoint. */
  road?: string[] | null;
}

/** The paid reveals that touch one run. */
export interface PaidReveals {
  /** The collector paid a fragment for this run's road. */
  paid: boolean;
  /** The convoy partner paid for theirs, which is the same road. */
  partner: boolean;
}

/** The paid reveals as queries.ts reads them (fetchReveals): the ids of
 *  this collector's runs that have one, and of the convoy partners' runs
 *  that have one. */
export interface RevealReads {
  mine: ReadonlySet<number>;
  partner: ReadonlySet<number>;
}

/** How many pending checkpoints ahead each trail title sees. */
const TRAIL_SIGHT: Record<TrailTitleKey, number> = {
  trailworn: 1,
  veteran: 2,
  wayfarer: Number.POSITIVE_INFINITY,
};

/** How many pending checkpoints ahead each edge reveal sees. The Warden's
 *  reading also shows every checkpoint's danger; that is dangerOf's. */
const EDGE_SIGHT: Record<AbilityReveal, number> = {
  none: 0,
  next: 1,
  two: 2,
  danger: 1,
};

/** The furthest any card in the squad can see down the trail. */
function trailSight(copies: Pick<CardCopy, "card">[]): number {
  let best = 0;
  for (const copy of copies) {
    const title = trailTitleOf(copy);
    if (title) best = Math.max(best, TRAIL_SIGHT[title.key]);
  }
  return best;
}

/**
 * Every checkpoint the squad knows right now, and why. `views` is the run's
 * forks with where each stands (forkViews); a checkpoint missing from the
 * returned map is unknown. The squad reads its edges off the launch squad
 * under the run's own rulebook, so a run stamped below ARCHETYPE_RULES
 * sees exactly what the trail and the answers give it.
 */
export function knownCheckpoints(
  run: RevealRun,
  copies: Pick<CardCopy, "id" | "card">[],
  views: { index: number; status: ForkStatus }[],
  reveals: PaidReveals,
): Map<number, RevealedBy> {
  const known = new Map<number, RevealedBy>();
  const count = Math.max(0, run.forks);
  const mark = (index: number, by: RevealedBy) => {
    if (Number.isInteger(index) && index >= 0 && index < count && !known.has(index)) known.set(index, by);
  };
  const everything = (by: RevealedBy) => {
    for (let index = 0; index < count; index += 1) mark(index, by);
  };

  for (const view of views) if (view.status !== "pending") mark(view.index, "walked");
  if (run.claimedAt) everything("walked");
  if (run.road && run.road.length > 0) everything("campaign");
  if (reveals.paid) everything("fragment");
  if (reveals.partner) everything("convoy");
  for (const answer of run.choices) if (answer.choice === "scout") mark(answer.index + 1, "scout");

  // "The next checkpoint" is always the next one the squad has not reached:
  // as each fork opens, the sight moves on with it.
  const ahead = views.filter((view) => view.status === "pending").map((view) => view.index).sort((a, b) => a - b);
  for (const index of ahead.slice(0, EDGE_SIGHT[traitsOf(copies, run.rules).reveal])) mark(index, "edge");
  const trail = trailSight(copies);
  for (const index of Number.isFinite(trail) ? ahead.slice(0, trail) : ahead) mark(index, "trail");
  return known;
}

/** Whether The Warden counts in this squad under this rulebook: every
 *  checkpoint then shows its danger, known or not. */
export function wardenActive(copies: Pick<CardCopy, "id" | "card">[], rules: number): boolean {
  return traitsOf(copies, rules).reveal === "danger";
}

/** What an unknown checkpoint gives away. `null` is "the squad cannot
 *  tell", which the board draws as nothing at all. */
export interface Danger {
  /** The dread mark: the squad warns against this place. Always shown. */
  warned: boolean;
  /** Dark enough that a foil lights the way — The Warden's to show. */
  dark: boolean | null;
  /** Camping here charges a toll — The Warden's to show. */
  toll: boolean | null;
}

/**
 * The danger an UNKNOWN checkpoint shows. Hand it the fork as the week's
 * weather leaves it (underWeather): under Fog every fork is dark, under a
 * Harvest no fork charges a toll, and a Warden reads the road the squad
 * will actually walk.
 */
export function dangerOf(fork: Pick<ForkDef, "warned" | "dark" | "toll">, warden: boolean): Danger {
  return {
    warned: fork.warned === true,
    dark: warden ? fork.dark === true : null,
    toll: warden ? (fork.toll ?? 0) > 0 : null,
  };
}

/**
 * What reveal_expedition_road's refusals mean to the collector. The RPC
 * speaks in short tokens; the button's error line speaks in sentences.
 */
export function revealErrorMessage(message: string): string {
  if (/unknown run/i.test(message)) return "That expedition isn't yours, or it no longer exists.";
  if (/already claimed/i.test(message)) return "That squad is already home — there's no road left to see.";
  if (/nothing to reveal/i.test(message)) return "This run has no checkpoints to reveal.";
  if (/road already known/i.test(message)) return "The squad set out with this map — the whole road is already known.";
  if (/road already walked/i.test(message)) return "The squad has reached every checkpoint already — nothing is left to see.";
  if (/already revealed/i.test(message)) return "This road is already revealed.";
  if (/not enough fragments/i.test(message)) {
    return `Seeing the road ahead takes ${REVEAL_FRAGMENTS} map fragment${REVEAL_FRAGMENTS === 1 ? "" : "s"}, and you have none to spare.`;
  }
  // The function is missing: the migration that adds it is not applied
  // yet. Nothing was spent.
  if (/could not find the function|does not exist|PGRST202/i.test(message)) return "The road ahead can't be revealed yet — nothing was spent.";
  return "The road could not be revealed. Refresh and try again.";
}
