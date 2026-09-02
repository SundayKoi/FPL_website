// The Showdown engine: a pure reducer over a table's (public, secret)
// state. Dealing, blinds, the four betting rounds, all-ins and side pots,
// the clock, and settlement with the rake. No I/O: the server action
// reads the two states, calls in here with the bracket, the clock and a
// random source, and commits what comes back through showdown_commit,
// which refuses any result where chips were minted or lost.
//
// Public state is what everyone may see and is what the felt draws from.
// Secret state is every seat's stack, hole cards and the rest of the deck;
// it never leaves the server except as your own two cards.

import {
  ACTION_SECONDS,
  BOARD_CARDS,
  HOLE_CARDS,
  rakeFor,
  SEATS_TO_DEAL,
  TIMEOUTS_TO_SIT_OUT,
  type Bracket,
} from "./config";
import { evaluateBest, winners as pickWinners, type EvaluatedHand, type ShowdownCard } from "./hands";

export type SeatStatus = "active" | "sitting_out" | "leaving";
export type Street = "preflop" | "flop" | "turn" | "river" | "showdown";

export interface PublicSeat {
  seatNo: number;
  discordId: string;
  username: string;
  chips: number;
  status: SeatStatus;
  houseStack: boolean;
  timeouts: number;
  /** Dealt into the current hand. */
  inHand: boolean;
  folded: boolean;
  allIn: boolean;
  /** Put in this street. */
  bet: number;
  /** Put in this hand. */
  totalIn: number;
  /** Hole cards, once shown at showdown. */
  shown: ShowdownCard[] | null;
}

export type HandEvent =
  | { kind: "deal"; handNo: number; dealerSeat: number }
  | { kind: "blind"; seatNo: number; amount: number; which: "small" | "big" }
  | { kind: "action"; seatNo: number; action: ActionKind; amount: number; timedOut: boolean }
  | { kind: "street"; street: Street; board: ShowdownCard[] }
  | { kind: "won"; seatNo: number; amount: number; rank: string | null };

export interface PublicHand {
  handNo: number;
  dealerSeat: number;
  street: Street;
  board: ShowdownCard[];
  pot: number;
  toAct: number | null;
  /** The bet level this street. */
  currentBet: number;
  /** The smallest legal raise over currentBet. */
  minRaise: number;
  /** Seats still owed an action this street, in order. */
  pending: number[];
  deadlineAt: string | null;
  sawFlop: boolean;
  log: HandEvent[];
}

export interface PotResult {
  amount: number;
  eligible: number[];
  winners: number[];
  rank: string | null;
}

export interface HandResult {
  handNo: number;
  board: ShowdownCard[];
  pot: number;
  rake: number;
  pots: PotResult[];
  /** Chips won minus chips put in, per seat. */
  net: Record<string, number>;
  shown: Record<string, ShowdownCard[]>;
  /** The best hand at the table, for the history and the Discord post. */
  best: { seatNo: number; rank: string; label: string } | null;
}

export interface PublicState {
  seats: PublicSeat[];
  dealerSeat: number | null;
  hand: PublicHand | null;
  lastHand: HandResult | null;
}

export interface SecretState {
  /** Each seat's ten cards, by seat number. */
  stacks: Record<string, ShowdownCard[]>;
  /** Each seat's hole cards this hand. */
  hole: Record<string, ShowdownCard[]>;
  /** The board still to come, in order. */
  deck: ShowdownCard[];
}

export interface EngineContext {
  bracket: Bracket;
  now: Date;
  /** [0, 1). CSPRNG in production; scripted in tests. */
  rand: () => number;
}

export type ActionKind = "fold" | "check" | "call" | "bet" | "raise";
export type Action = { type: "fold" } | { type: "check" } | { type: "call" } | { type: "bet"; to: number } | { type: "raise"; to: number };

export interface Step {
  pub: PublicState;
  secret: SecretState;
  /** Rake burned by this step; only a settlement burns. */
  rake: number;
  /** The settled hand, when this step settled one. */
  settled: HandResult | null;
}

export class ShowdownError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShowdownError";
  }
}

const LOG_LIMIT = 40;

export function emptyPublic(): PublicState {
  return { seats: [], dealerSeat: null, hand: null, lastHand: null };
}

export function emptySecret(): SecretState {
  return { stacks: {}, hole: {}, deck: [] };
}

export function newSeat(input: {
  seatNo: number;
  discordId: string;
  username: string;
  chips: number;
  houseStack: boolean;
}): PublicSeat {
  return { ...input, status: "active", timeouts: 0, inHand: false, folded: false, allIn: false, bet: 0, totalIn: 0, shown: null };
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function shuffle<T>(items: T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const seatsInOrder = (pub: PublicState) => [...pub.seats].sort((a, b) => a.seatNo - b.seatNo);

/** The next seat clockwise from `from` that passes `ok`, or null. */
function nextSeat(pub: PublicState, from: number, ok: (seat: PublicSeat) => boolean): PublicSeat | null {
  const seatNo = orderFrom(pub, from, ok)[0];
  return seatNo === undefined ? null : seatOf(pub, seatNo);
}

/** Seats passing `ok`, in clockwise order starting from the first one
 *  strictly after `from`. */
function orderFrom(pub: PublicState, from: number, ok: (seat: PublicSeat) => boolean): number[] {
  const ordered = seatsInOrder(pub);
  const after = ordered.filter((seat) => seat.seatNo > from);
  const before = ordered.filter((seat) => seat.seatNo <= from);
  return [...after, ...before].filter(ok).map((seat) => seat.seatNo);
}

const live = (seat: PublicSeat) => seat.inHand && !seat.folded;
const canAct = (seat: PublicSeat) => live(seat) && !seat.allIn;

function seatOf(pub: PublicState, seatNo: number): PublicSeat {
  const seat = pub.seats.find((entry) => entry.seatNo === seatNo);
  if (!seat) throw new ShowdownError(`no seat ${seatNo}`);
  return seat;
}

function log(hand: PublicHand, event: HandEvent) {
  hand.log.push(event);
  if (hand.log.length > LOG_LIMIT) hand.log.splice(0, hand.log.length - LOG_LIMIT);
}

function deadline(ctx: EngineContext): string {
  return new Date(ctx.now.getTime() + ACTION_SECONDS * 1000).toISOString();
}

/** Move chips from a seat to the pot. Short stacks go all in. */
function putIn(hand: PublicHand, seat: PublicSeat, wanted: number): number {
  const amount = Math.min(wanted, seat.chips);
  seat.chips -= amount;
  seat.bet += amount;
  seat.totalIn += amount;
  hand.pot += amount;
  if (seat.chips === 0) seat.allIn = true;
  return amount;
}

/** Whether a table can deal: at least SEATS_TO_DEAL active seats with
 *  chips and a stack to deal from. */
export function canDeal(pub: PublicState, secret: SecretState): boolean {
  return dealable(pub, secret).length >= SEATS_TO_DEAL;
}

function dealable(pub: PublicState, secret: SecretState): PublicSeat[] {
  return seatsInOrder(pub).filter(
    (seat) => seat.status === "active" && seat.chips > 0 && (secret.stacks[seat.seatNo]?.length ?? 0) >= HOLE_CARDS,
  );
}

/**
 * Deal a hand. The board's five come from `edition` (this week's cards),
 * shuffled and set aside in the secret state; each player's two come from
 * their own stack. Blinds post; the first player to act is on the clock.
 */
export function startHand(pubIn: PublicState, secretIn: SecretState, ctx: EngineContext, edition: ShowdownCard[]): Step {
  const pub = clone(pubIn);
  const secret = clone(secretIn);
  if (pub.hand) throw new ShowdownError("a hand is already in progress");
  const players = dealable(pub, secret);
  if (players.length < SEATS_TO_DEAL) throw new ShowdownError(`need ${SEATS_TO_DEAL} players to deal`);
  if (edition.length < BOARD_CARDS) throw new ShowdownError("the edition has too few cards for a board");

  const handNo = (pub.lastHand?.handNo ?? 0) + 1;
  const playing = new Set(players.map((seat) => seat.seatNo));
  for (const seat of pub.seats) {
    const dealtIn = playing.has(seat.seatNo);
    seat.inHand = dealtIn;
    seat.folded = false;
    seat.allIn = false;
    seat.bet = 0;
    seat.totalIn = 0;
    seat.shown = null;
  }

  // The button moves to the next player after last hand's dealer.
  const dealer = pub.dealerSeat === null ? players[0] : (nextSeat(pub, pub.dealerSeat, (seat) => playing.has(seat.seatNo)) ?? players[0]);
  pub.dealerSeat = dealer.seatNo;

  // Hole cards from each player's own stack; the board from the edition.
  secret.hole = {};
  for (const seat of players) {
    const stack = shuffle(secret.stacks[seat.seatNo], ctx.rand);
    secret.hole[seat.seatNo] = stack.slice(0, HOLE_CARDS);
  }
  secret.deck = shuffle(edition, ctx.rand).slice(0, BOARD_CARDS);

  const hand: PublicHand = {
    handNo,
    dealerSeat: dealer.seatNo,
    street: "preflop",
    board: [],
    pot: 0,
    toAct: null,
    currentBet: 0,
    minRaise: ctx.bracket.bigBlind,
    pending: [],
    deadlineAt: null,
    sawFlop: false,
    log: [],
  };
  pub.hand = hand;
  log(hand, { kind: "deal", handNo, dealerSeat: dealer.seatNo });

  // Blinds. Heads up, the dealer is the small blind and acts first.
  const headsUp = players.length === 2;
  const small = headsUp ? dealer : nextSeat(pub, dealer.seatNo, canAct)!;
  const big = nextSeat(pub, small.seatNo, canAct)!;
  log(hand, { kind: "blind", seatNo: small.seatNo, amount: putIn(hand, seatOf(pub, small.seatNo), ctx.bracket.smallBlind), which: "small" });
  log(hand, { kind: "blind", seatNo: big.seatNo, amount: putIn(hand, seatOf(pub, big.seatNo), ctx.bracket.bigBlind), which: "big" });
  hand.currentBet = ctx.bracket.bigBlind;

  // Preflop action starts left of the big blind and comes back round to it.
  hand.pending = orderFrom(pub, big.seatNo, canAct);
  return open(pub, secret, ctx);
}

/** Put the next pending seat on the clock, or move the hand on. */
function open(pub: PublicState, secret: SecretState, ctx: EngineContext): Step {
  const hand = pub.hand!;
  const alive = pub.seats.filter(live);
  if (alive.length === 1) return settle(pub, secret, ctx);

  if (hand.pending.length === 0) return nextStreet(pub, secret, ctx);

  // A seat that asked to leave folds the moment it is asked to act.
  const next = seatOf(pub, hand.pending[0]);
  if (next.status === "leaving") {
    hand.toAct = next.seatNo;
    return act(pub, secret, ctx, next.seatNo, { type: "fold" }, false);
  }

  hand.toAct = next.seatNo;
  hand.deadlineAt = deadline(ctx);
  return { pub, secret, rake: 0, settled: null };
}

function nextStreet(pub: PublicState, secret: SecretState, ctx: EngineContext): Step {
  const hand = pub.hand!;
  for (const seat of pub.seats) seat.bet = 0;
  hand.currentBet = 0;
  hand.minRaise = ctx.bracket.bigBlind;
  hand.toAct = null;
  hand.deadlineAt = null;

  const order: Street[] = ["preflop", "flop", "turn", "river", "showdown"];
  const next = order[order.indexOf(hand.street) + 1];
  if (next === "showdown") return settle(pub, secret, ctx);

  const count = next === "flop" ? 3 : 1;
  const cards = secret.deck.splice(0, count);
  hand.board.push(...cards);
  hand.street = next;
  if (next === "flop") hand.sawFlop = true;
  log(hand, { kind: "street", street: next, board: cards });

  // Postflop action starts left of the dealer. With one or no players
  // still able to act, there is no betting left: run the board out.
  const actors = orderFrom(pub, hand.dealerSeat, canAct);
  hand.pending = actors.length >= 2 ? actors : [];
  return open(pub, secret, ctx);
}

/** A player's move. Validated against whose turn it is and what is legal. */
export function applyAction(pubIn: PublicState, secretIn: SecretState, ctx: EngineContext, seatNo: number, action: Action): Step {
  return act(clone(pubIn), clone(secretIn), ctx, seatNo, action, false);
}

function act(pub: PublicState, secret: SecretState, ctx: EngineContext, seatNo: number, action: Action, timedOut: boolean): Step {
  const hand = pub.hand;
  if (!hand) throw new ShowdownError("no hand in progress");
  if (hand.toAct !== seatNo) throw new ShowdownError("not your turn");
  const seat = seatOf(pub, seatNo);
  if (!canAct(seat)) throw new ShowdownError("you cannot act");
  const owed = hand.currentBet - seat.bet;
  let amount = 0;

  switch (action.type) {
    case "fold":
      seat.folded = true;
      break;
    case "check":
      if (owed > 0) throw new ShowdownError(`you owe ${owed}; call or fold`);
      break;
    case "call":
      if (owed <= 0) throw new ShowdownError("nothing to call; check");
      amount = putIn(hand, seat, owed);
      break;
    case "bet":
    case "raise": {
      if (action.type === "bet" && hand.currentBet > 0) throw new ShowdownError("there is a bet; raise or call");
      if (action.type === "raise" && hand.currentBet === 0) throw new ShowdownError("nothing to raise; bet");
      if (!Number.isInteger(action.to) || action.to <= hand.currentBet) throw new ShowdownError("raise must be above the current bet");
      const wanted = action.to - seat.bet;
      if (wanted > seat.chips) throw new ShowdownError("you do not have that many chips");
      const isAllIn = wanted === seat.chips;
      const size = action.to - hand.currentBet;
      if (size < hand.minRaise && !isAllIn) throw new ShowdownError(`minimum raise is to ${hand.currentBet + hand.minRaise}`);
      amount = putIn(hand, seat, wanted);
      // A full raise reopens the action for everyone else; a short all-in
      // does not, so a player who already acted cannot re-raise off it.
      if (size >= hand.minRaise) {
        hand.minRaise = size;
        hand.currentBet = action.to;
        hand.pending = orderFrom(pub, seatNo, canAct).filter((pendingSeat) => pendingSeat !== seatNo);
      } else {
        hand.currentBet = action.to;
        hand.pending = hand.pending.filter((pendingSeat) => pendingSeat !== seatNo);
      }
      break;
    }
  }

  if (action.type !== "bet" && action.type !== "raise") {
    hand.pending = hand.pending.filter((pendingSeat) => pendingSeat !== seatNo);
  }
  seat.timeouts = timedOut ? seat.timeouts + 1 : 0;
  if (timedOut && seat.timeouts >= TIMEOUTS_TO_SIT_OUT && seat.status === "active") seat.status = "sitting_out";
  log(hand, { kind: "action", seatNo, action: action.type, amount, timedOut });
  return open(pub, secret, ctx);
}

/**
 * The clock ran out on whoever is to act: check where checking is free,
 * fold otherwise. A no-op before the deadline. Any client may call this
 * once the deadline has passed; the commit's version makes one win.
 */
export function applyTimeout(pubIn: PublicState, secretIn: SecretState, ctx: EngineContext): Step | null {
  const hand = pubIn.hand;
  if (!hand || hand.toAct === null || !hand.deadlineAt) return null;
  if (new Date(hand.deadlineAt).getTime() > ctx.now.getTime()) return null;
  const pub = clone(pubIn);
  const seat = seatOf(pub, hand.toAct);
  const owed = hand.currentBet - seat.bet;
  return act(pub, clone(secretIn), ctx, hand.toAct, owed > 0 ? { type: "fold" } : { type: "check" }, true);
}

/**
 * A player leaves mid-hand: they fold when their turn comes, and their
 * seat sits out so showdown_stand will let them go after the hand. Between
 * hands the seat can stand straight away and this is not needed.
 */
export function markLeaving(pubIn: PublicState, seatNo: number): PublicState {
  const pub = clone(pubIn);
  seatOf(pub, seatNo).status = "leaving";
  return pub;
}

/** Side pots from what everyone put in: one pot per contribution level,
 *  eligible to the live seats that reached it. */
export function buildPots(seats: PublicSeat[]): { amount: number; eligible: number[] }[] {
  const contributors = seats.filter((seat) => seat.inHand && seat.totalIn > 0);
  const levels = [...new Set(contributors.map((seat) => seat.totalIn))].sort((a, b) => a - b);
  const pots: { amount: number; eligible: number[] }[] = [];
  let previous = 0;
  for (const level of levels) {
    const amount = contributors.reduce((sum, seat) => sum + Math.max(0, Math.min(seat.totalIn, level) - previous), 0);
    const eligible = contributors.filter((seat) => live(seat) && seat.totalIn >= level).map((seat) => seat.seatNo);
    previous = level;
    if (amount === 0) continue;
    const last = pots[pots.length - 1];
    if (eligible.length === 0) {
      // Only folded chips above every live stake: they go to the last pot.
      if (last) last.amount += amount;
      continue;
    }
    if (last && last.eligible.length === eligible.length && last.eligible.every((seatNo) => eligible.includes(seatNo))) {
      last.amount += amount;
    } else {
      pots.push({ amount, eligible });
    }
  }
  return pots;
}

function settle(pub: PublicState, secret: SecretState, ctx: EngineContext): Step {
  const hand = pub.hand!;
  hand.street = "showdown";
  hand.toAct = null;
  hand.deadlineAt = null;

  const alive = pub.seats.filter(live);
  const totalPot = hand.pot;
  let rake = rakeFor(totalPot, ctx.bracket, hand.sawFlop);
  const pots = buildPots(pub.seats);

  // Rake comes off the main pot first, then the next, never below zero.
  let owed = rake;
  for (const pot of pots) {
    const take = Math.min(owed, pot.amount);
    pot.amount -= take;
    owed -= take;
  }
  rake -= owed;

  const contested = alive.length > 1;
  const evaluated = new Map<number, EvaluatedHand>();
  const shown: Record<string, ShowdownCard[]> = {};
  if (contested) {
    for (const seat of alive) {
      const hole = secret.hole[seat.seatNo] ?? [];
      evaluated.set(seat.seatNo, evaluateBest([...hole, ...hand.board]));
      seat.shown = hole;
      shown[seat.seatNo] = hole;
    }
  }

  const won: Record<string, number> = {};
  const results: PotResult[] = [];
  for (const pot of pots) {
    let potWinners: number[];
    let rank: string | null = null;
    if (contested) {
      const entries = pot.eligible.map((seatNo) => ({ seatNo, hand: evaluated.get(seatNo)! }));
      const top = pickWinners(entries);
      potWinners = top.map((entry) => entry.seatNo);
      rank = top[0].hand.rank.label;
    } else {
      potWinners = pot.eligible;
    }
    // Split evenly; odd chips go to the earliest winner left of the dealer.
    const share = Math.floor(pot.amount / potWinners.length);
    let remainder = pot.amount - share * potWinners.length;
    const clockwise = orderFrom(pub, hand.dealerSeat, (seat) => potWinners.includes(seat.seatNo));
    for (const seatNo of clockwise) {
      const extra = remainder > 0 ? 1 : 0;
      remainder -= extra;
      won[seatNo] = (won[seatNo] ?? 0) + share + extra;
    }
    results.push({ amount: pot.amount, eligible: pot.eligible, winners: potWinners, rank });
  }

  const net: Record<string, number> = {};
  for (const seat of pub.seats) {
    if (!seat.inHand) continue;
    const gained = won[seat.seatNo] ?? 0;
    seat.chips += gained;
    net[seat.seatNo] = gained - seat.totalIn;
    if (gained > 0) {
      log(hand, { kind: "won", seatNo: seat.seatNo, amount: gained, rank: evaluated.get(seat.seatNo)?.rank.label ?? null });
    }
  }
  hand.pot = 0;

  let best: HandResult["best"] = null;
  for (const [seatNo, evaluatedHand] of evaluated) {
    if (!best || evaluatedHand.rank.order > (evaluated.get(best.seatNo)!.rank.order)) {
      best = { seatNo, rank: evaluatedHand.rank.key, label: evaluatedHand.rank.label };
    }
  }

  const result: HandResult = { handNo: hand.handNo, board: hand.board, pot: totalPot, rake, pots: results, net, shown, best };

  // The hand is over: clear per-hand state, retire leavers and busted
  // stacks so the next deal skips them.
  for (const seat of pub.seats) {
    seat.inHand = false;
    seat.folded = false;
    seat.allIn = false;
    seat.bet = 0;
    seat.totalIn = 0;
    if (seat.status === "leaving") seat.status = "sitting_out";
    if (seat.chips === 0 && seat.status === "active") seat.status = "sitting_out";
  }
  pub.hand = null;
  pub.lastHand = result;
  secret.hole = {};
  secret.deck = [];
  return { pub, secret, rake, settled: result };
}

/** What the commit RPC wants for the seats: chips and status per seat. */
export function seatRows(pub: PublicState): { seat_no: number; chips: number; status: SeatStatus; timeouts: number }[] {
  return pub.seats.map((seat) => ({ seat_no: seat.seatNo, chips: seat.chips, status: seat.status, timeouts: seat.timeouts }));
}

/** The per-viewer view: everyone's public state plus only your own hole
 *  cards. Hands shown at showdown are already public. */
export function viewFor(pub: PublicState, secret: SecretState, discordId: string | null): PublicState & { myHole: ShowdownCard[]; myStack: ShowdownCard[] } {
  const mine = discordId ? pub.seats.find((seat) => seat.discordId === discordId) : null;
  return {
    ...clone(pub),
    myHole: mine ? clone(secret.hole[mine.seatNo] ?? []) : [],
    myStack: mine ? clone(secret.stacks[mine.seatNo] ?? []) : [],
  };
}
