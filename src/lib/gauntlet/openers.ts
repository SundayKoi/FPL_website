// Openers: the only permanent power in the Gauntlet.
//
// An opener is a small starting perk picked at the draft, one per run,
// kept for the season. They are unlocked in a fixed order by the number
// of CONTRACTS finished this season (src/lib/gauntlet/contracts.ts) — not
// by runs played, not by dollars spent — so the kit a veteran carries is
// the record of having played the mode every way it asks to be played.
//
// Sized like an heirloom: an edge the bracket does not rise to meet, and
// small enough that none of them is the answer. Every effect is a
// RelicEffects dial the engine already reads, folded in through
// mergeRelicEffects like a held relic.

import type { RelicEffects } from "./relics";

export interface OpenerDef {
  key: string;
  title: string;
  /** What it does, in the player's language. */
  effect: string;
  /** Contracts finished this season to unlock it. */
  unlockAt: number;
  effects: RelicEffects;
}

export const OPENER_CATALOG: OpenerDef[] = [
  { key: "warm_up", title: "WARM-UP", effect: "+2 on the first fight of every game.", unlockAt: 2, effects: { earlyFightBonus: 2 } },
  { key: "the_map", title: "THE MAP", effect: "+2 on every objective contest.", unlockAt: 5, effects: { objectivesFlat: 2 } },
  { key: "study_tape", title: "STUDY TAPE", effect: "+2 on every crossroads check.", unlockAt: 9, effects: { crossroadsBonus: 2 } },
  { key: "bankroll", title: "BANKROLL", effect: "Every won beat pays 5% more gold.", unlockAt: 14, effects: { goldMult: 1.05 } },
  { key: "iron_will", title: "IRON WILL", effect: "+3 on every check while you are behind.", unlockAt: 20, effects: { comebackFlat: 3 } },
  { key: "promotion", title: "PROMOTION", effect: "+20 score on every cleared round — the board, never the fight.", unlockAt: 27, effects: { scoreFlat: 20 } },
];

export const OPENER_BY_KEY = new Map(OPENER_CATALOG.map((opener) => [opener.key, opener]));

/** The openers a season's contract count has unlocked, in order. */
export function unlockedOpeners(contractsDone: number): OpenerDef[] {
  return OPENER_CATALOG.filter((opener) => opener.unlockAt <= contractsDone);
}

/** The next opener to unlock, and how many more contracts it needs. */
export function nextOpener(contractsDone: number): { opener: OpenerDef; remaining: number } | null {
  const next = OPENER_CATALOG.find((opener) => opener.unlockAt > contractsDone);
  return next ? { opener: next, remaining: next.unlockAt - contractsDone } : null;
}

/** The effects an opener brings — empty for none, or an unknown key. */
export function openerEffects(key: string | null | undefined): RelicEffects {
  return (key ? OPENER_BY_KEY.get(key)?.effects : undefined) ?? {};
}

/** Whether a player holding `contractsDone` may bring `key`. */
export function openerAllowed(key: string | null | undefined, contractsDone: number): boolean {
  if (!key) return true;
  const opener = OPENER_BY_KEY.get(key);
  return Boolean(opener && opener.unlockAt <= contractsDone);
}
