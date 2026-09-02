// The Showdown hand evaluator. Pure: cards in, ranked hand out. Shared by
// the server (settling a hand), the client (showing you what you hold)
// and the rules page (the ranking table is generated from HAND_RANKS).
//
// A card's role is its suit, its team is what pairs, its tier makes the
// ladder and its overall is its rank. There is no plain flush: a team has
// one player per role, so five from one team is already a full roster,
// and it ranks as the straight flush.

export const ROLES = ["Top", "Jungle", "Mid", "Bot", "Support"] as const;
export type Role = (typeof ROLES)[number];

/** Card tiers, lowest first — the rungs of a Ladder. */
export const TIER_ORDER = ["bronze", "silver", "gold", "platinum", "emerald", "diamond", "master", "challenger"] as const;
export type TierKey = (typeof TIER_ORDER)[number];

/** The slice of a card the game reads. `id` tells two copies apart. */
export interface ShowdownCard {
  id: string;
  role: Role;
  team: string;
  tier: TierKey;
  overall: number;
  foil: boolean;
}

export type HandRankKey =
  | "high"
  | "pair"
  | "two_pair"
  | "trips"
  | "straight"
  | "full_house"
  | "quads"
  | "roster_flush"
  | "foil_royal";

export interface HandRank {
  key: HandRankKey;
  /** Weakest 0. */
  order: number;
  label: string;
  /** What it takes, in the player's words. */
  takes: string;
  /** The poker hand it stands in for. */
  standsIn: string;
}

export const HAND_RANKS: HandRank[] = [
  { key: "high", order: 0, label: "High Card", takes: "Nothing made. Highest overall wins.", standsIn: "High card" },
  { key: "pair", order: 1, label: "Pair", takes: "Two cards from one team.", standsIn: "Pair" },
  { key: "two_pair", order: 2, label: "Two Pair", takes: "Two from one team and two from another.", standsIn: "Two pair" },
  { key: "trips", order: 3, label: "Trips", takes: "Three from one team.", standsIn: "Three of a kind" },
  {
    key: "straight",
    order: 4,
    label: "Straight",
    takes: "A Full Roster (one of each role, any teams) or a Ladder (five consecutive tiers).",
    standsIn: "Straight",
  },
  { key: "full_house", order: 5, label: "Full House", takes: "Three from one team and two from another.", standsIn: "Full house" },
  { key: "quads", order: 6, label: "Quads", takes: "Four from one team.", standsIn: "Four of a kind" },
  {
    key: "roster_flush",
    order: 7,
    label: "Roster Flush",
    takes: "Five from one team: the whole roster in one hand.",
    standsIn: "Straight flush",
  },
  { key: "foil_royal", order: 8, label: "Foil Royal", takes: "A Roster Flush where every card is a foil.", standsIn: "Royal flush" },
];

const RANK_BY_KEY = Object.fromEntries(HAND_RANKS.map((rank) => [rank.key, rank])) as Record<HandRankKey, HandRank>;

export interface EvaluatedHand {
  rank: HandRank;
  /** The five cards that make the hand, the made cards first. */
  cards: ShowdownCard[];
  /** Compared element by element after `rank.order`: the made cards'
   *  overalls high to low, then the kickers high to low. */
  tiebreak: number[];
  /** "Full Roster" or "Ladder" on a straight; the team on a paired hand. */
  detail: string;
}

/** Straight shape of five cards, or null. A hand can be both; Roster is
 *  reported since it is the one people recognise. */
export function straightOf(cards: ShowdownCard[]): "Full Roster" | "Ladder" | null {
  if (cards.length !== 5) return null;
  const roles = new Set(cards.map((card) => card.role));
  if (roles.size === 5) return "Full Roster";
  const tiers = [...new Set(cards.map((card) => TIER_ORDER.indexOf(card.tier)))].sort((a, b) => a - b);
  if (tiers.length === 5 && tiers[4] - tiers[0] === 4) return "Ladder";
  return null;
}

const byOverallDesc = (a: ShowdownCard, b: ShowdownCard) => b.overall - a.overall;

/** Rank exactly five cards. */
export function evaluateFive(cards: ShowdownCard[]): EvaluatedHand {
  if (cards.length !== 5) throw new Error(`evaluateFive wants 5 cards, got ${cards.length}`);
  const sorted = [...cards].sort(byOverallDesc);

  // Team groups, biggest first; ties by the group's top overall.
  const groups = new Map<string, ShowdownCard[]>();
  for (const card of sorted) groups.set(card.team, [...(groups.get(card.team) ?? []), card]);
  const grouped = [...groups.values()].sort((a, b) => b.length - a.length || b[0].overall - a[0].overall);
  const counts = grouped.map((group) => group.length);

  const straight = straightOf(sorted);

  const made = (rankKey: HandRankKey, ordered: ShowdownCard[], detail: string): EvaluatedHand => ({
    rank: RANK_BY_KEY[rankKey],
    cards: ordered,
    tiebreak: ordered.map((card) => card.overall),
    detail,
  });

  if (counts[0] === 5) {
    const allFoil = sorted.every((card) => card.foil);
    return made(allFoil ? "foil_royal" : "roster_flush", sorted, grouped[0][0].team);
  }
  if (counts[0] === 4) return made("quads", [...grouped[0], ...grouped[1]], grouped[0][0].team);
  if (counts[0] === 3 && counts[1] === 2) return made("full_house", [...grouped[0], ...grouped[1]], `${grouped[0][0].team} over ${grouped[1][0].team}`);
  if (straight) return made("straight", sorted, straight);
  if (counts[0] === 3) return made("trips", [...grouped[0], ...grouped[1], ...grouped[2]], grouped[0][0].team);
  if (counts[0] === 2 && counts[1] === 2) {
    return made("two_pair", [...grouped[0], ...grouped[1], ...grouped[2]], `${grouped[0][0].team} and ${grouped[1][0].team}`);
  }
  if (counts[0] === 2) return made("pair", [...grouped[0], ...grouped[1], ...grouped[2], ...grouped[3]], grouped[0][0].team);
  return made("high", sorted, "");
}

/** Positive when a beats b, negative when b beats a, zero for a split. */
export function compareHands(a: EvaluatedHand, b: EvaluatedHand): number {
  if (a.rank.order !== b.rank.order) return a.rank.order - b.rank.order;
  for (let i = 0; i < Math.max(a.tiebreak.length, b.tiebreak.length); i += 1) {
    const diff = (a.tiebreak[i] ?? 0) - (b.tiebreak[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function* choose<T>(items: T[], k: number, start = 0, picked: T[] = []): Generator<T[]> {
  if (picked.length === k) {
    yield picked;
    return;
  }
  for (let i = start; i <= items.length - (k - picked.length); i += 1) {
    yield* choose(items, k, i + 1, [...picked, items[i]]);
  }
}

/** The best five-card hand in five to seven cards. */
export function evaluateBest(cards: ShowdownCard[]): EvaluatedHand {
  if (cards.length < 5 || cards.length > 7) throw new Error(`evaluateBest wants 5 to 7 cards, got ${cards.length}`);
  let best: EvaluatedHand | null = null;
  for (const five of choose(cards, 5)) {
    const hand = evaluateFive(five);
    if (!best || compareHands(hand, best) > 0) best = hand;
  }
  return best!;
}

/** Winners among several hands — more than one on an exact tie. */
export function winners<T extends { hand: EvaluatedHand }>(entries: T[]): T[] {
  let top: T[] = [];
  for (const entry of entries) {
    if (top.length === 0) {
      top = [entry];
      continue;
    }
    const diff = compareHands(entry.hand, top[0].hand);
    if (diff > 0) top = [entry];
    else if (diff === 0) top.push(entry);
  }
  return top;
}
