import { describe, expect, it } from "vitest";
import { BRACKETS, rakeFor, stackFits, STACK_SIZE } from "./config";
import { compareHands, evaluateBest, evaluateFive, HAND_RANKS, straightOf, winners, type ShowdownCard, type Role, type TierKey } from "./hands";

let n = 0;
const card = (team: string, role: Role, overall: number, extra: Partial<ShowdownCard> = {}): ShowdownCard => ({
  id: `c${(n += 1)}`,
  team,
  role,
  overall,
  tier: tierOf(overall),
  foil: false,
  ...extra,
});
function tierOf(overall: number): TierKey {
  if (overall >= 94) return "challenger";
  if (overall >= 89) return "master";
  if (overall >= 83) return "diamond";
  if (overall >= 77) return "emerald";
  if (overall >= 70) return "platinum";
  if (overall >= 60) return "gold";
  if (overall >= 50) return "silver";
  return "bronze";
}

describe("the hand ranking", () => {
  it("is ordered weakest to strongest with no gaps", () => {
    expect(HAND_RANKS.map((rank) => rank.order)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(HAND_RANKS.map((rank) => rank.key)).toEqual([
      "high", "pair", "two_pair", "trips", "straight", "full_house", "quads", "roster_flush", "foil_royal",
    ]);
  });

  it("reads high card, pair, two pair, trips, full house and quads from team counts", () => {
    expect(evaluateFive([card("A", "Top", 70), card("B", "Jungle", 65), card("C", "Mid", 60), card("D", "Bot", 55), card("A", "Top", 50)]).rank.key).toBe("pair");
    expect(evaluateFive([card("A", "Top", 70), card("A", "Jungle", 65), card("B", "Mid", 60), card("B", "Bot", 55), card("C", "Top", 50)]).rank.key).toBe("two_pair");
    expect(evaluateFive([card("A", "Top", 70), card("A", "Jungle", 65), card("A", "Mid", 60), card("B", "Bot", 55), card("C", "Top", 50)]).rank.key).toBe("trips");
    expect(evaluateFive([card("A", "Top", 70), card("A", "Jungle", 65), card("A", "Mid", 60), card("B", "Bot", 55), card("B", "Top", 50)]).rank.key).toBe("full_house");
    expect(evaluateFive([card("A", "Top", 70), card("A", "Jungle", 65), card("A", "Mid", 60), card("A", "Bot", 55), card("B", "Top", 50)]).rank.key).toBe("quads");
    // Five roles would be a straight; break it with two Tops.
    expect(evaluateFive([card("A", "Top", 70), card("B", "Top", 65), card("C", "Mid", 60), card("D", "Bot", 55), card("E", "Support", 50)]).rank.key).toBe("high");
  });

  it("makes a straight from a full roster or a ladder, and reports which", () => {
    const roster = [card("A", "Top", 70), card("B", "Jungle", 65), card("C", "Mid", 60), card("D", "Bot", 55), card("E", "Support", 50)];
    expect(straightOf(roster)).toBe("Full Roster");
    expect(evaluateFive(roster)).toMatchObject({ rank: { key: "straight" }, detail: "Full Roster" });

    // silver, gold, platinum, emerald, diamond — two Tops so it is not a roster.
    const ladder = [card("A", "Top", 52), card("B", "Top", 62), card("C", "Mid", 72), card("D", "Bot", 78), card("E", "Support", 84)];
    expect(straightOf(ladder)).toBe("Ladder");
    expect(evaluateFive(ladder)).toMatchObject({ rank: { key: "straight" }, detail: "Ladder" });

    // A gap in the tiers is no ladder.
    const gapped = [card("A", "Top", 52), card("B", "Top", 62), card("C", "Mid", 72), card("D", "Bot", 78), card("E", "Support", 90)];
    expect(straightOf(gapped)).toBeNull();
  });

  it("ranks five from one team as a roster flush, and all foils as a foil royal", () => {
    const roster = (foil: boolean) => [
      card("A", "Top", 70, { foil }), card("A", "Jungle", 65, { foil }), card("A", "Mid", 60, { foil }), card("A", "Bot", 55, { foil }), card("A", "Support", 50, { foil }),
    ];
    expect(evaluateFive(roster(false)).rank.key).toBe("roster_flush");
    expect(evaluateFive(roster(true)).rank.key).toBe("foil_royal");
    // Four foils is still only a roster flush.
    const four = roster(true);
    four[2].foil = false;
    expect(evaluateFive(four).rank.key).toBe("roster_flush");
  });

  it("puts a full house above a straight and quads above both", () => {
    const straight = evaluateFive([card("A", "Top", 99), card("B", "Jungle", 98), card("C", "Mid", 97), card("D", "Bot", 96), card("E", "Support", 95)]);
    const house = evaluateFive([card("A", "Top", 40), card("A", "Jungle", 41), card("A", "Mid", 42), card("B", "Bot", 43), card("B", "Top", 44)]);
    const quads = evaluateFive([card("A", "Top", 40), card("A", "Jungle", 41), card("A", "Mid", 42), card("A", "Bot", 43), card("B", "Top", 44)]);
    expect(compareHands(house, straight)).toBeGreaterThan(0);
    expect(compareHands(quads, house)).toBeGreaterThan(0);
  });

  it("breaks ties on the made cards first, then kickers, and splits exact ties", () => {
    const pairOf90 = evaluateFive([card("A", "Top", 90), card("A", "Jungle", 88), card("B", "Mid", 60), card("C", "Bot", 55), card("D", "Support", 50)]);
    const pairOf95 = evaluateFive([card("Z", "Top", 95), card("Z", "Jungle", 40), card("B", "Mid", 60), card("C", "Bot", 55), card("D", "Support", 50)]);
    expect(compareHands(pairOf95, pairOf90)).toBeGreaterThan(0);

    const kicker70 = evaluateFive([card("A", "Top", 90), card("A", "Jungle", 88), card("B", "Mid", 70), card("C", "Bot", 55), card("D", "Support", 50)]);
    expect(compareHands(kicker70, pairOf90)).toBeGreaterThan(0);

    const same = evaluateFive([card("Q", "Top", 90), card("Q", "Jungle", 88), card("R", "Mid", 60), card("S", "Bot", 55), card("T", "Support", 50)]);
    expect(compareHands(same, pairOf90)).toBe(0);
  });

  it("finds the best five of seven", () => {
    // Two Gamblers in the hole, two more on the board plus a fourth: quads.
    const hole = [card("Gamblers", "Mid", 88), card("Gamblers", "Support", 71)];
    const board = [card("Gamblers", "Top", 79), card("Faceless", "Jungle", 91), card("Kraken", "Bot", 64), card("Faceless", "Top", 83), card("Gamblers", "Jungle", 58)];
    const best = evaluateBest([...hole, ...board]);
    expect(best.rank.key).toBe("quads");
    expect(best.detail).toBe("Gamblers");
    // The kicker is the best of what is left: the 91.
    expect(best.tiebreak).toEqual([88, 79, 71, 58, 91]);
  });

  it("prefers a roster flush hidden in seven cards over the obvious pair", () => {
    const seven = [
      card("A", "Top", 70), card("A", "Jungle", 65), card("A", "Mid", 60), card("A", "Bot", 55), card("A", "Support", 50),
      card("B", "Top", 99), card("B", "Jungle", 98),
    ];
    expect(evaluateBest(seven).rank.key).toBe("roster_flush");
  });

  it("names every winner on a split", () => {
    const one = { seat: 1, hand: evaluateFive([card("Q", "Top", 90), card("Q", "Jungle", 88), card("R", "Mid", 60), card("S", "Bot", 55), card("T", "Support", 50)]) };
    const two = { seat: 2, hand: evaluateFive([card("A", "Top", 90), card("A", "Jungle", 88), card("B", "Mid", 60), card("C", "Bot", 55), card("D", "Support", 50)]) };
    const three = { seat: 3, hand: evaluateFive([card("A", "Top", 30), card("B", "Jungle", 31), card("C", "Mid", 32), card("D", "Bot", 33), card("A", "Support", 34)]) };
    expect(winners([one, two, three]).map((entry) => entry.seat)).toEqual([1, 2]);
  });
});

describe("the table config", () => {
  it("rakes 3% of a pot that saw a flop, capped at five big blinds, and nothing before the flop", () => {
    expect(rakeFor(3000, BRACKETS.open, true)).toBe(90);
    expect(rakeFor(3000, BRACKETS.open, false)).toBe(0);
    expect(rakeFor(20000, BRACKETS.open, true)).toBe(250);
    expect(rakeFor(1000, BRACKETS.low, true)).toBe(30);
    expect(rakeFor(5000, BRACKETS.low, true)).toBe(50);
    expect(rakeFor(5000, BRACKETS.free, true)).toBe(0);
  });

  it("holds a stack to ten cards under the bracket's cap", () => {
    const ten = (avg: number) => Array.from({ length: STACK_SIZE }, () => avg);
    expect(stackFits(ten(72), BRACKETS.open)).toEqual({ ok: true });
    expect(stackFits(ten(73), BRACKETS.open).ok).toBe(false);
    expect(stackFits(ten(65), BRACKETS.low)).toEqual({ ok: true });
    expect(stackFits(ten(66), BRACKETS.low).ok).toBe(false);
    expect(stackFits(ten(50).slice(0, 9), BRACKETS.low).ok).toBe(false);
  });
});
