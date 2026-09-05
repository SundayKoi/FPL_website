// Convoys, the rule: two squads on one route share the forks, and a fork
// pushes only when BOTH said so. Pure — the claim, the page and the tests
// read the same verdict.

import type { ForkChoice, RecordedChoice } from "./routes";

/** A join code is six characters from an alphabet with no 0/O or 1/I. */
export const CONVOY_CODE_LENGTH = 6;

/** Whether a choice moves the squad forward (anything but camping). */
export function isPush(choice: ForkChoice | null): boolean {
  return choice !== null && choice !== "camp";
}

/**
 * The sheet a convoy run resolves under: my own choice wherever both of
 * us pushed, camp wherever either of us camped or stayed silent. My own
 * choice is kept, not the partner's, because favour, light and rally are
 * what MY squad can do — a partner's favour does not spend my signed card.
 */
export function convoySheet(forks: number, mine: RecordedChoice[], theirs: RecordedChoice[]): (ForkChoice | null)[] {
  const my = new Map(mine.map((choice) => [choice.index, choice.choice]));
  const their = new Map(theirs.map((choice) => [choice.index, choice.choice]));
  return Array.from({ length: forks }, (_, index) => {
    const own = my.get(index) ?? null;
    const other = their.get(index) ?? null;
    if (isPush(own) && isPush(other)) return own;
    // A camp is a camp whoever said it; silence reads as camp downstream.
    return own === null && other === null ? null : "camp";
  });
}

/** What the fork will do given what each side has said so far. */
export type ConvoyVerdict = "pushing" | "camping" | "waiting";

export function convoyVerdict(mine: ForkChoice | null, theirs: ForkChoice | null): ConvoyVerdict {
  if (mine === "camp" || theirs === "camp") return "camping";
  if (isPush(mine) && isPush(theirs)) return "pushing";
  return "waiting";
}

/** Tidies a code as typed: trimmed, upper-cased, the confusable characters
 *  read as the ones the alphabet actually has. */
export function normaliseConvoyCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/0/g, "O").replace(/1/g, "I").replace(/[^A-Z2-9]/g, "").slice(0, CONVOY_CODE_LENGTH);
}
