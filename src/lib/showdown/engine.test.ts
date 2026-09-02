import { describe, expect, it } from "vitest";
import { BRACKETS, RAKE_CAP_BIG_BLINDS } from "./config";
import {
  applyAction,
  applyTimeout,
  buildPots,
  canDeal,
  emptyPublic,
  emptySecret,
  markLeaving,
  newSeat,
  seatRows,
  startHand,
  viewFor,
  type EngineContext,
  type PublicState,
  type SecretState,
  type Step,
} from "./engine";
import type { Role, ShowdownCard, TierKey } from "./hands";

let n = 0;
const card = (team: string, role: Role, overall: number, tier: TierKey = "gold"): ShowdownCard => ({
  id: `c${(n += 1)}`,
  team,
  role,
  overall,
  tier,
  foil: false,
});

/** A stack of ten filler cards for a seat: one team, mixed roles, so a
 *  hand's outcome in these tests comes from the board we choose. */
const filler = (team: string) =>
  Array.from({ length: 10 }, (_, i) => card(team, (["Top", "Jungle", "Mid", "Bot", "Support"] as Role[])[i % 5], 60 + i));

/** A board deck whose first five, after our fixed "shuffle", are known. */
const EDITION = [
  card("Kraken", "Top", 70),
  card("Kraken", "Jungle", 71),
  card("Faceless", "Mid", 72),
  card("Gamblers", "Bot", 73),
  card("Nobody", "Support", 74),
  card("Kraken", "Mid", 75),
  card("Kraken", "Bot", 76),
];

/** rand() = 0 makes every shuffle a no-op, so deals are deterministic:
 *  hole cards are the first two of a stack, the board is EDITION[0..5). */
const ctx = (overrides: Partial<EngineContext> = {}): EngineContext => ({
  bracket: BRACKETS.open,
  now: new Date("2026-09-02T18:00:00Z"),
  rand: () => 0,
  ...overrides,
});

function table(players: { chips: number; team?: string; stack?: ShowdownCard[] }[]): { pub: PublicState; secret: SecretState } {
  const pub = emptyPublic();
  const secret = emptySecret();
  players.forEach((player, i) => {
    pub.seats.push(newSeat({ seatNo: i, discordId: `u${i}`, username: `Player ${i}`, chips: player.chips, houseStack: false }));
    secret.stacks[i] = player.stack ?? filler(player.team ?? `T${i}`);
  });
  return { pub, secret };
}

const chips = (step: Step) => step.pub.seats.map((seat) => seat.chips);
const total = (step: Step) => chips(step).reduce((a, b) => a + b, 0) + (step.pub.hand?.pot ?? 0) + step.rake;

describe("dealing", () => {
  it("needs two players with chips and a stack", () => {
    const one = table([{ chips: 1000 }]);
    expect(canDeal(one.pub, one.secret)).toBe(false);
    const two = table([{ chips: 1000 }, { chips: 1000 }]);
    expect(canDeal(two.pub, two.secret)).toBe(true);
    two.pub.seats[1].chips = 0;
    expect(canDeal(two.pub, two.secret)).toBe(false);
  });

  it("heads up: the dealer posts the small blind and acts first", () => {
    const { pub, secret } = table([{ chips: 1000 }, { chips: 1000 }]);
    const step = startHand(pub, secret, ctx(), EDITION);
    const hand = step.pub.hand!;
    expect(hand.dealerSeat).toBe(0);
    expect(step.pub.seats[0].bet).toBe(25);
    expect(step.pub.seats[1].bet).toBe(50);
    expect(hand.pot).toBe(75);
    expect(hand.toAct).toBe(0);
    expect(hand.deadlineAt).toBe("2026-09-02T18:00:45.000Z");
    expect(step.secret.hole[0]).toHaveLength(2);
    expect(step.secret.deck).toHaveLength(5);
    expect(hand.board).toEqual([]);
  });

  it("three-handed: blinds left of the dealer, action starts after the big blind", () => {
    const { pub, secret } = table([{ chips: 1000 }, { chips: 1000 }, { chips: 1000 }]);
    const step = startHand(pub, secret, ctx(), EDITION);
    const hand = step.pub.hand!;
    expect(hand.dealerSeat).toBe(0);
    expect(step.pub.seats[1].bet).toBe(25);
    expect(step.pub.seats[2].bet).toBe(50);
    expect(hand.toAct).toBe(0);
    expect(hand.pending).toEqual([0, 1, 2]);
  });

  it("moves the button each hand and skips a seat sitting out", () => {
    const { pub, secret } = table([{ chips: 1000 }, { chips: 1000 }, { chips: 1000 }]);
    let step = startHand(pub, secret, ctx(), EDITION);
    // Everyone folds to the big blind.
    step = applyAction(step.pub, step.secret, ctx(), 0, { type: "fold" });
    step = applyAction(step.pub, step.secret, ctx(), 1, { type: "fold" });
    expect(step.settled).not.toBeNull();
    step.pub.seats[1].status = "sitting_out";
    const next = startHand(step.pub, step.secret, ctx(), EDITION);
    expect(next.pub.hand!.dealerSeat).toBe(2);
    expect(next.pub.seats[1].inHand).toBe(false);
  });

  it("refuses to deal on top of a hand", () => {
    const { pub, secret } = table([{ chips: 1000 }, { chips: 1000 }]);
    const step = startHand(pub, secret, ctx(), EDITION);
    expect(() => startHand(step.pub, step.secret, ctx(), EDITION)).toThrow(/already in progress/);
  });
});

describe("a betting round", () => {
  const dealt = () => {
    const { pub, secret } = table([{ chips: 1000 }, { chips: 1000 }, { chips: 1000 }]);
    return startHand(pub, secret, ctx(), EDITION);
  };

  it("only the seat on the clock may act", () => {
    const step = dealt();
    expect(() => applyAction(step.pub, step.secret, ctx(), 1, { type: "fold" })).toThrow(/not your turn/);
  });

  it("refuses a check when there is a bet to call, and a call when there is not", () => {
    const step = dealt();
    expect(() => applyAction(step.pub, step.secret, ctx(), 0, { type: "check" })).toThrow(/you owe 50/);
    let s = applyAction(step.pub, step.secret, ctx(), 0, { type: "call" });
    s = applyAction(s.pub, s.secret, ctx(), 1, { type: "call" });
    // The big blind has the option: nothing to call.
    expect(() => applyAction(s.pub, s.secret, ctx(), 2, { type: "call" })).toThrow(/nothing to call/);
  });

  it("holds a raise to the minimum and to the stack", () => {
    const step = dealt();
    expect(() => applyAction(step.pub, step.secret, ctx(), 0, { type: "raise", to: 80 })).toThrow(/minimum raise is to 100/);
    expect(() => applyAction(step.pub, step.secret, ctx(), 0, { type: "raise", to: 5000 })).toThrow(/that many chips/);
    expect(() => applyAction(step.pub, step.secret, ctx(), 0, { type: "bet", to: 100 })).toThrow(/there is a bet/);
    const s = applyAction(step.pub, step.secret, ctx(), 0, { type: "raise", to: 150 });
    expect(s.pub.hand!.currentBet).toBe(150);
    expect(s.pub.hand!.minRaise).toBe(100);
    expect(s.pub.hand!.pending).toEqual([1, 2]);
  });

  it("closes the round when everyone has matched, then deals the flop", () => {
    let s = dealt();
    s = applyAction(s.pub, s.secret, ctx(), 0, { type: "call" });
    s = applyAction(s.pub, s.secret, ctx(), 1, { type: "call" });
    s = applyAction(s.pub, s.secret, ctx(), 2, { type: "check" });
    const hand = s.pub.hand!;
    expect(hand.street).toBe("flop");
    expect(hand.board).toHaveLength(3);
    expect(hand.sawFlop).toBe(true);
    expect(hand.pot).toBe(150);
    expect(hand.currentBet).toBe(0);
    // Postflop, the small blind (left of the dealer) acts first.
    expect(hand.toAct).toBe(1);
    expect(s.pub.seats.every((seat) => seat.bet === 0)).toBe(true);
  });

  it("re-opens the action after a raise so everyone gets to answer it", () => {
    let s = dealt();
    s = applyAction(s.pub, s.secret, ctx(), 0, { type: "call" });
    s = applyAction(s.pub, s.secret, ctx(), 1, { type: "raise", to: 200 });
    expect(s.pub.hand!.pending).toEqual([2, 0]);
    s = applyAction(s.pub, s.secret, ctx(), 2, { type: "fold" });
    s = applyAction(s.pub, s.secret, ctx(), 0, { type: "call" });
    expect(s.pub.hand!.street).toBe("flop");
    expect(s.pub.hand!.pot).toBe(450);
  });
});

describe("settling", () => {
  it("pays an uncontested pot with no rake before the flop, and shows nobody", () => {
    const { pub, secret } = table([{ chips: 1000 }, { chips: 1000 }]);
    let s = startHand(pub, secret, ctx(), EDITION);
    s = applyAction(s.pub, s.secret, ctx(), 0, { type: "fold" });
    expect(s.settled).not.toBeNull();
    expect(s.rake).toBe(0);
    expect(chips(s)).toEqual([975, 1025]);
    expect(s.settled!.shown).toEqual({});
    expect(s.settled!.net).toEqual({ 0: -25, 1: 25 });
    expect(s.pub.hand).toBeNull();
    expect(s.pub.lastHand!.handNo).toBe(1);
  });

  it("rakes a pot that saw a flop, capped at five big blinds, and the chips still add up", () => {
    // Seat 0 holds Kraken cards and the board opens with two Kraken, so
    // seat 0 makes Quads against seat 1's Trips of Faceless.
    const { pub, secret } = table([{ chips: 3000, team: "Kraken" }, { chips: 3000, team: "Faceless" }]);
    let s = startHand(pub, secret, ctx(), EDITION);
    s = applyAction(s.pub, s.secret, ctx(), 0, { type: "raise", to: 1500 });
    s = applyAction(s.pub, s.secret, ctx(), 1, { type: "call" });
    // Flop: check it down to the river.
    for (let i = 0; i < 3; i += 1) {
      s = applyAction(s.pub, s.secret, ctx(), 1, { type: "check" });
      s = applyAction(s.pub, s.secret, ctx(), 0, { type: "check" });
    }
    expect(s.settled).not.toBeNull();
    const potBefore = 3000;
    expect(s.settled!.pot).toBe(potBefore);
    expect(s.rake).toBe(Math.min(Math.floor(potBefore * 0.03), RAKE_CAP_BIG_BLINDS * 50));
    expect(s.rake).toBe(90);
    expect(chips(s)).toEqual([3000 - 1500 + 2910, 1500]);
    expect(total(s)).toBe(6000);
    expect(s.settled!.pots[0].winners).toEqual([0]);
    expect(s.settled!.pots[0].rank).toBe("Quads");
    expect(Object.keys(s.settled!.shown)).toEqual(["0", "1"]);
  });

  it("runs the board out when everyone is all in", () => {
    const { pub, secret } = table([{ chips: 500, team: "Kraken" }, { chips: 500, team: "Faceless" }]);
    let s = startHand(pub, secret, ctx(), EDITION);
    s = applyAction(s.pub, s.secret, ctx(), 0, { type: "raise", to: 500 });
    s = applyAction(s.pub, s.secret, ctx(), 1, { type: "call" });
    expect(s.settled).not.toBeNull();
    expect(s.settled!.board).toHaveLength(5);
    expect(total(s)).toBe(1000);
  });

  it("splits a tied pot and gives the odd chip to the seat left of the dealer", () => {
    // Same team, same-overall stacks: identical hands, so the board plays.
    const twin = () => filler("Kraken").map((c) => ({ ...c, overall: 60 }));
    const { pub, secret } = table([{ chips: 1000, stack: twin() }, { chips: 1000, stack: twin() }, { chips: 1000, stack: twin() }]);
    let s = startHand(pub, secret, ctx(), EDITION);
    s = applyAction(s.pub, s.secret, ctx(), 0, { type: "raise", to: 101 });
    s = applyAction(s.pub, s.secret, ctx(), 1, { type: "call" });
    s = applyAction(s.pub, s.secret, ctx(), 2, { type: "call" });
    for (let i = 0; i < 3; i += 1) {
      s = applyAction(s.pub, s.secret, ctx(), 1, { type: "check" });
      s = applyAction(s.pub, s.secret, ctx(), 2, { type: "check" });
      s = applyAction(s.pub, s.secret, ctx(), 0, { type: "check" });
    }
    expect(s.settled!.pots[0].winners).toEqual([0, 1, 2]);
    // 303 in, 9 raked, 294 out: 98 each, no remainder — then the pot is
    // split three ways with 294 = 3 × 98.
    expect(s.rake).toBe(9);
    expect(chips(s)).toEqual([997, 997, 997]);
    expect(total(s)).toBe(3000);
  });
});

describe("side pots", () => {
  it("builds one pot per contribution level, eligible to the live seats that reached it", () => {
    const { pub } = table([{ chips: 0 }, { chips: 0 }, { chips: 0 }]);
    const [a, b, c] = pub.seats;
    Object.assign(a, { inHand: true, totalIn: 100, allIn: true });
    Object.assign(b, { inHand: true, totalIn: 300 });
    Object.assign(c, { inHand: true, totalIn: 300 });
    expect(buildPots(pub.seats)).toEqual([
      { amount: 300, eligible: [0, 1, 2] },
      { amount: 400, eligible: [1, 2] },
    ]);
  });

  it("gives folded chips above every live stake to the last pot", () => {
    const { pub } = table([{ chips: 0 }, { chips: 0 }, { chips: 0 }]);
    const [a, b, c] = pub.seats;
    Object.assign(a, { inHand: true, totalIn: 50, allIn: true });
    Object.assign(b, { inHand: true, totalIn: 200, folded: true });
    Object.assign(c, { inHand: true, totalIn: 300 });
    // Level 50: 150 to everyone still in. Level 200: b's and c's next 150
    // each, c alone eligible. Level 300: c's last 100, folded into that pot.
    expect(buildPots(pub.seats)).toEqual([
      { amount: 150, eligible: [0, 2] },
      { amount: 400, eligible: [2] },
    ]);
  });

  it("pays a short all-in only the pot it could reach", () => {
    // Seat 0 is short and holds the best cards (Kraken, matching the
    // board); seats 1 and 2 play on for the side pot with equal junk.
    const junk = () => filler("Nobody").map((c) => ({ ...c, overall: 40 }));
    const { pub, secret } = table([{ chips: 200, team: "Kraken" }, { chips: 2000, stack: junk() }, { chips: 2000, stack: junk() }]);
    let s = startHand(pub, secret, ctx(), EDITION);
    s = applyAction(s.pub, s.secret, ctx(), 0, { type: "raise", to: 200 });
    s = applyAction(s.pub, s.secret, ctx(), 1, { type: "raise", to: 600 });
    s = applyAction(s.pub, s.secret, ctx(), 2, { type: "call" });
    // Flop onwards: 1 and 2 check it down.
    for (let i = 0; i < 3; i += 1) {
      s = applyAction(s.pub, s.secret, ctx(), 1, { type: "check" });
      s = applyAction(s.pub, s.secret, ctx(), 2, { type: "check" });
    }
    expect(s.settled).not.toBeNull();
    const [main, side] = s.settled!.pots;
    expect(main.eligible).toEqual([0, 1, 2]);
    expect(main.winners).toEqual([0]);
    expect(side.eligible).toEqual([1, 2]);
    expect(side.winners).toEqual([1, 2]);
    expect(s.settled!.pot).toBe(1400);
    expect(s.rake).toBe(42);
    expect(total(s)).toBe(4200);
    // Seat 0 wins the main pot (600 less the rake) and nothing more.
    expect(s.pub.seats[0].chips).toBe(600 - 42);
  });
});

describe("the clock", () => {
  it("does nothing before the deadline, then checks where free and folds where not", () => {
    const { pub, secret } = table([{ chips: 1000 }, { chips: 1000 }, { chips: 1000 }]);
    const s = startHand(pub, secret, ctx(), EDITION);
    expect(applyTimeout(s.pub, s.secret, ctx())).toBeNull();
    const late = ctx({ now: new Date("2026-09-02T18:01:00Z") });
    const folded = applyTimeout(s.pub, s.secret, late)!;
    expect(folded.pub.seats[0].folded).toBe(true);
    expect(folded.pub.seats[0].timeouts).toBe(1);
    expect(folded.pub.hand!.log.at(-1)).toMatchObject({ kind: "action", seatNo: 0, action: "fold", timedOut: true });
  });

  it("sits a seat out after three timeouts in a row, and a real action resets the count", () => {
    const { pub, secret } = table([{ chips: 1000 }, { chips: 1000 }]);
    pub.seats[0].timeouts = 2;
    const s = startHand(pub, secret, ctx(), EDITION);
    const late = ctx({ now: new Date("2026-09-02T18:01:00Z") });
    const out = applyTimeout(s.pub, s.secret, late)!;
    expect(out.pub.seats[0].status).toBe("sitting_out");

    const again = table([{ chips: 1000 }, { chips: 1000 }]);
    again.pub.seats[0].timeouts = 2;
    const t = startHand(again.pub, again.secret, ctx(), EDITION);
    const acted = applyAction(t.pub, t.secret, ctx(), 0, { type: "call" });
    expect(acted.pub.seats[0].timeouts).toBe(0);
  });
});

describe("leaving and viewing", () => {
  it("a leaver sits out after the hand settles", () => {
    const { pub, secret } = table([{ chips: 1000 }, { chips: 1000 }]);
    let s = startHand(pub, secret, ctx(), EDITION);
    const marked = markLeaving(s.pub, 1);
    s = applyAction(marked, s.secret, ctx(), 0, { type: "fold" });
    expect(s.pub.seats[1].status).toBe("sitting_out");
    expect(seatRows(s.pub)).toEqual([
      { seat_no: 0, chips: 975, status: "active", timeouts: 0 },
      { seat_no: 1, chips: 1025, status: "sitting_out", timeouts: 0 },
    ]);
  });

  it("a busted seat sits out", () => {
    const { pub, secret } = table([{ chips: 500, team: "Nobody" }, { chips: 500, team: "Kraken" }]);
    let s = startHand(pub, secret, ctx(), EDITION);
    s = applyAction(s.pub, s.secret, ctx(), 0, { type: "raise", to: 500 });
    s = applyAction(s.pub, s.secret, ctx(), 1, { type: "call" });
    expect(s.pub.seats[0].chips).toBe(0);
    expect(s.pub.seats[0].status).toBe("sitting_out");
  });

  it("shows a viewer only their own hole cards, and a stranger none", () => {
    const { pub, secret } = table([{ chips: 1000 }, { chips: 1000 }]);
    const s = startHand(pub, secret, ctx(), EDITION);
    const mine = viewFor(s.pub, s.secret, "u0");
    expect(mine.myHole).toEqual(s.secret.hole[0]);
    expect(mine.myStack).toHaveLength(10);
    expect(mine.seats[1].shown).toBeNull();
    const stranger = viewFor(s.pub, s.secret, null);
    expect(stranger.myHole).toEqual([]);
    expect(JSON.stringify(stranger)).not.toContain(s.secret.hole[1][0].id);
  });
});
