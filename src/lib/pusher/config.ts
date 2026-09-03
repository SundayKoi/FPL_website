// The Pusher — a PROPOSAL, previewed on the admin mockup page and wired
// to nothing. These are the numbers the mockup plays with and the ones a
// real machine would start from; the mockup page prints them so the toy
// and the notes cannot disagree.

export const DROP_COST = 5;
export const COIN_VALUE = 5;
/** Drops per person per minute, once it is real. */
export const DROPS_PER_MINUTE = 12;
/** What a machine should return over the long run, of what goes in. */
export const TARGET_RETURN = 0.9;

export type PrizeKind = "dust" | "token" | "card";

export interface PrizeSpec {
  kind: PrizeKind;
  label: string;
  /** Worth, in dollars, for the mockup's tally and the design notes. */
  value: number;
  /** How many the mockup seeds on the shelf. */
  seeded: number;
}

export const PRIZES: Record<PrizeKind, PrizeSpec> = {
  dust: { kind: "dust", label: "Dust", value: 40, seeded: 4 },
  token: { kind: "token", label: "Pack token", value: 150, seeded: 2 },
  card: { kind: "card", label: "A card", value: 300, seeded: 1 },
};
