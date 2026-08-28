// The Gauntlet's match engine — a league game as a pure function.
//
// Everything here is deterministic given (lineup, opponent, relics,
// traits, condition, seed): no Date, no Math.random, no I/O. The server
// rolls CSPRNG seeds and stores them BEFORE anything resolves, so a run
// can be replayed, audited, and re-rendered forever.
//
// v3 shape — the match keeps a LEDGER, not just a verdict:
//   · every check runs through runContest and records its MARGIN, so a
//     loss can say "by 2" instead of just "lost";
//   · gold is a real resource, sampled over the clock (the graph IS the
//     story of the match) and feeding late-game strength, so winning
//     lanes compounds mechanically rather than symbolically;
//   · the Baron is a damage race with a smite check, so "how close was
//     I" has an actual answer in health and damage;
//   · every card carries kills, deaths, assists, gold and damage share,
//     so "my team lost" becomes "my bot lane lost".
//
// A match is still TWO HALVES around a crossroads (crossroads.ts) — the
// first half sets the board, the player makes the call, the second half
// resolves it. Cosmetics never touch a stat (pinned by test).

import type { MeasureKey } from "@/lib/cards/measures";
import type { RelicEffects } from "./relics";
import { type Contest, type ContestInput, type ContestKind, contestDetail, runContest } from "./contest";
import type { BossEffects } from "./bosses";
import type { ConditionEffects, TraitEffects } from "./traits";
import {
  type CrossroadsChoice,
  CROSSROADS_BY_KEY,
  type CrossroadsSituation,
  type CrossroadsSpoils,
  crossroadsSpread,
  daringAt,
  safeChoiceOf,
  situationFor,
  winChanceOf,
} from "./crossroads";

/** One card in a Gauntlet lineup — the slice of PlayerCardData the sim
 *  reads, flattened so the server can build it from an inventory row. */
export interface GauntletCard {
  inventoryId: number | null;
  name: string;
  role: GauntletRole;
  overall: number;
  /** The card's five bars, by measure key. Missing keys fall back to a
   *  band around overall — a card is never unplayable for lacking a bar. */
  stats: Partial<Record<MeasureKey, number>>;
  foil: boolean;
  signed: boolean;
  /** Printed in the CURRENT week's edition — wears the Fresh Legs bonus. */
  fresh: boolean;
  /** The real-life team this card played for — what chemistry reads. */
  team?: string | null;
  /** A stand-in for a role the collection can't cover. Costs score. */
  trialist?: boolean;
}

export type GauntletRole = "Top" | "Jungle" | "Mid" | "Bot" | "Support";
export const GAUNTLET_ROLES: GauntletRole[] = ["Top", "Jungle", "Mid", "Bot", "Support"];

/** The stat edge a card printed this week carries. */
export const FRESH_LEGS_BONUS = 3;

/** What a trialist plays like: a warm body, not a carry. */
export const TRIALIST_OVERALL = 55;

/** Rounds in a full run. */
export const GAUNTLET_ROUNDS = 8;

/** When the early game ends — the clock traits split their bonuses on. */
const MIDGAME_CLOCK = 15;

/** Comp identities, read from a team's stat shape. The triangle:
 *  poke > dive > protect > poke. */
export type CompStyle = "poke" | "dive" | "protect";
const COUNTERS: Record<CompStyle, CompStyle> = { poke: "dive", dive: "protect", protect: "poke" };

export interface MatchEvent {
  /** Minutes into the game, or null for pre-game lines. */
  clock: number | null;
  kind: "draft" | "lanes" | "objective" | "fight" | "crossroads" | "baron" | "hold" | "nexus";
  /** Good/bad for YOUR side, for the timeline's dot colors. */
  tone: "win" | "loss" | "neutral";
  text: string;
  /** The numbers behind the line, monospace on the timeline. */
  detail: string | null;
  /** The contest this line resolved, when it resolved one. */
  contestKey?: string;
  /** Gold this beat moved, signed for your side. */
  gold?: number;
}

export interface LaneResult {
  role: GauntletRole;
  won: boolean;
  yours: number;
  theirs: number;
  /** How much this lane missed by — the reason a 700g lane loss reads. */
  margin: number;
  gold: number;
}

/** One sample of the gold line — the match's story in one array. */
export interface GoldSample {
  clock: number;
  /** Your gold minus theirs. */
  diff: number;
}

/** A card's match, as a scoreboard row. */
export interface PlayerLine {
  inventoryId: number | null;
  name: string;
  role: GauntletRole;
  kills: number;
  deaths: number;
  assists: number;
  gold: number;
  /** Percent of your team's damage, rounded so the five sum to 100. */
  damageShare: number;
  contestsWon: number;
  contestsLost: number;
}

/** The pit, in detail — the answer to "how close was I to the Baron". */
export interface BaronDance {
  attempted: boolean;
  /** True when YOU started it; false when you were contesting theirs. */
  yours: boolean;
  clock: number;
  /** Baron health (0–100) when the smite check resolved. */
  hpAtResolve: number;
  /** Raw damage you were short by. 0 on a clean take. */
  shortBy: number;
  taken: boolean;
  stolen: boolean;
  note: string;
}

/** The run-scoped modifiers a match resolves under. */
export interface MatchContext {
  /** Your relics. */
  effects: RelicEffects;
  /** Their traits. */
  foe: TraitEffects;
  /** The round's condition — the rules, for both sides. */
  arena: ConditionEffects;
  /** The wall's rule on a boss round. Empty on every other round. */
  boss?: BossEffects;
}

/** Every check in the match runs through here so a boss's tie band can't
 *  be forgotten at one call site and silently not apply. */
function checked(ctx: MatchContext, input: ContestInput, rand: () => number): Contest {
  return runContest({ ...input, tieBand: ctx.boss?.tieBand ?? 0 }, rand);
}

/** Everything the ledger accumulates across the two halves. */
export interface LedgerState {
  contests: Contest[];
  gold: number;
  goldSeries: GoldSample[];
  players: PlayerLine[];
}

/** Where a match stands at the crossroads — everything the second half
 *  (and the choice screen) needs, serializable into the run row. */
export interface HalfState {
  momentum: number;
  events: MatchEvent[];
  lanes: LaneResult[];
  lanesWon: number;
  yourStyle: CompStyle;
  theirStyle: CompStyle;
  situationKey: string;
  ledger: LedgerState;
}

export interface MatchResult {
  won: boolean;
  events: MatchEvent[];
  lanes: LaneResult[];
  /** 0–100 after the final whistle — the margin the score reads. */
  momentum: number;
  mvp: string;
  /** Round score earned (0 on a loss). */
  score: number;
  /** Crossroads score landed by a daring call. */
  daring: number;
  yourStyle: CompStyle;
  theirStyle: CompStyle;
  /** Every check the match made, with its margin. */
  contests: Contest[];
  /** The gold line, for the graph. */
  goldSeries: GoldSample[];
  /** Final gold difference, signed for your side. */
  gold: number;
  players: PlayerLine[];
  baron: BaronDance;
}

/** Deterministic PRNG — mulberry32. Small, seedable, good enough for a
 *  game sim; the SEED is where the real entropy lives (CSPRNG, server). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (value: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, value));

/** A card's effective value for one measure: the real bar when it exists,
 *  a band around overall when it doesn't, Fresh Legs on top. */
export function statOf(card: GauntletCard, key: MeasureKey, effects?: RelicEffects): number {
  const base = card.stats[key] ?? clamp(card.overall - 5, 30, 92);
  const fresh = card.fresh ? FRESH_LEGS_BONUS + (effects?.freshLegsExtra ?? 0) : 0;
  return clamp(base + fresh, 0, 99 + FRESH_LEGS_BONUS + (effects?.freshLegsExtra ?? 0));
}

/** Team average across a set of bars — the number every contest and every
 *  crossroads check reads, exported so the UI can print the same math. */
export function teamAvg(team: GauntletCard[], keys: MeasureKey[], effects?: RelicEffects): number {
  const per = team.map(
    (card) => keys.reduce((sum, key) => sum + statOf(card, key, effects), 0) / keys.length,
  );
  return per.reduce((a, b) => a + b, 0) / Math.max(1, per.length);
}

/**
 * A team's comp identity, from its stat shape: heavy damage+laning reads
 * poke, combat+presence reads dive, survival+vision reads protect.
 */
export function compStyleOf(team: GauntletCard[]): CompStyle {
  const poke = teamAvg(team, ["damage", "laning"]);
  const dive = teamAvg(team, ["combat", "presence"]);
  const protect = teamAvg(team, ["survival", "vision"]);
  if (poke >= dive && poke >= protect) return "poke";
  if (dive >= protect) return "dive";
  return "protect";
}

/** The three identity scores behind compStyleOf, for the draft screen. */
export function compProfileOf(team: GauntletCard[]): Record<CompStyle, number> {
  return {
    poke: Math.round(teamAvg(team, ["damage", "laning"])),
    dive: Math.round(teamAvg(team, ["combat", "presence"])),
    protect: Math.round(teamAvg(team, ["survival", "vision"])),
  };
}

/** Which beats an identity is ACTUALLY about — where a committed comp
 *  gets paid for committing. */
const FOCUS_BEATS: Record<CompStyle, ContestKind[]> = {
  poke: ["lane"],
  dive: ["fight", "crossroads"],
  protect: ["hold", "baron", "objective"],
};

/** The styles own different NUMBERS of beats (poke's five lanes against
 *  dive's three fights), so the per-beat bonus is weighted to keep the
 *  three identities worth about the same over a whole match. */
const FOCUS_WEIGHT: Record<CompStyle, number> = { poke: 0.55, dive: 1, protect: 0.7 };

/** Where chemistry shows up. Playing together buys COORDINATION — fights,
 *  objectives, the pit, the call — not lane mechanics or base defence. A
 *  blanket bonus on every check was worth three times a full shelf
 *  upgrade, which is not what a nice-to-have should cost. */
const CHEMISTRY_BEATS: ContestKind[] = ["fight", "objective", "baron", "crossroads"];

/** What a lineup IS, beyond the sum of its overalls. */
export interface LineupShape {
  style: CompStyle;
  profile: Record<CompStyle, number>;
  /** How sharply the comp reads: top identity minus the runner-up. Five
   *  great cards with nothing in common commit to nothing. */
  commitment: number;
  /** How many of the five share a real-life team with another. */
  chemistry: number;
  /** What commitment buys on this style's two signature beats. */
  focusBonus: number;
  /** What chemistry buys on every contest. */
  chemistryBonus: number;
}

/**
 * The reason to draft a LINEUP instead of five high numbers.
 *
 * Two bonuses, both earned by the shape of the five rather than their
 * ratings: COMMITMENT (how far your top identity outruns the runner-up)
 * pays on the two beats that identity is about, and CHEMISTRY (cards who
 * actually played together) pays a little everywhere. The bracket scales
 * off raw overall, so these are the levers that make a well-built 74
 * beat a scattered 80.
 */
export function lineupShapeOf(team: GauntletCard[]): LineupShape {
  const profile = compProfileOf(team);
  const ranked = (Object.keys(profile) as CompStyle[]).sort((a, b) => profile[b] - profile[a]);
  const style = ranked[0];
  const commitment = Math.round(profile[ranked[0]] - profile[ranked[1]]);

  const counts = new Map<string, number>();
  for (const card of team) {
    const key = (card.team ?? "").trim().toLowerCase();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let chemistry = 0;
  for (const count of counts.values()) if (count >= 2) chemistry += count;

  return {
    style,
    profile,
    commitment,
    chemistry,
    focusBonus: clamp((commitment - 3) * 0.7, 0, 9) * FOCUS_WEIGHT[style],
    chemistryBonus: clamp((chemistry - 1) * 0.3, 0, 1.2),
  };
}

/** What the shape is worth on one beat — signature beats get commitment,
 *  everything gets chemistry. */
function shapeBonus(
  shape: LineupShape,
  kind: ContestKind,
  effects?: RelicEffects,
  boss?: BossEffects,
): number {
  // THE ARCHIVIST scouted your five: the shape you drafted for pays
  // nothing this round, and the run is decided on raw bars.
  if (boss?.nullifyShape) return 0;
  const chem = CHEMISTRY_BEATS.includes(kind) ? shape.chemistryBonus * (effects?.chemistryMult ?? 1) : 0;
  const focus = FOCUS_BEATS[shape.style].includes(kind) ? shape.focusBonus * (effects?.commitmentMult ?? 1) : 0;
  return chem + focus;
}

/** Which bar decides each role's lane. Junglers don't lane — their early
 *  game is pathing and presence. */
export const LANE_KEY: Record<GauntletRole, MeasureKey> = {
  Top: "laning",
  Jungle: "presence",
  Mid: "laning",
  Bot: "laning",
  Support: "vision",
};

const byRole = (team: GauntletCard[], role: GauntletRole): GauntletCard | undefined =>
  team.find((card) => card.role === role);

/** What a fight moves. THE CLOSER doubles the cost of the ones you lose
 *  — one bad teamfight is the game, which is what a finale should feel
 *  like. */
function fightSwing(won: boolean, ctx: MatchContext): number {
  const base = (won ? 8 : -8) * (ctx.arena.fightSwingMult ?? 1);
  return won ? base : base * (ctx.boss?.lossSwingMult ?? 1);
}

/** The momentum below which a run counts as BEHIND — where comeback
 *  relics wake up. */
export const BEHIND_MOMENTUM = 45;

/** What a comeback relic is worth right now. Zero unless you're losing,
 *  which is the entire point of one. */
function behindFlat(effects: RelicEffects, momentum: number): number {
  return momentum < BEHIND_MOMENTUM ? (effects.comebackFlat ?? 0) : 0;
}

/** The enemy's clock-dependent flat — traits that key off the game phase. */
function foeClockFlat(ctx: MatchContext, clock: number): number {
  return clock < MIDGAME_CLOCK ? (ctx.foe.earlyFlat ?? 0) : (ctx.foe.lateFlat ?? 0);
}

/** How much a gold lead is worth as raw stat in a late-game check. A
 *  2,000g lead is about 7 points — real, but never the whole game. */
export function goldEdge(gold: number, arena: ConditionEffects): number {
  return clamp(gold / 280, -14, 14) * (arena.goldEdgeMult ?? 1);
}

const noise = (base: number, ctx: MatchContext): number => base * (ctx.arena.noiseMult ?? 1);

// ── Ledger helpers ──────────────────────────────────────────────────────

function freshPlayers(yours: GauntletCard[], effects: RelicEffects): PlayerLine[] {
  const weights = yours.map((card) => statOf(card, "damage", effects) + statOf(card, "combat", effects));
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const raw = weights.map((weight) => (weight / total) * 100);
  const shares = raw.map((value) => Math.floor(value));
  // Hand the rounding remainder to the biggest carries, so the five sum
  // to exactly 100 and the scoreboard never reads 99%.
  let left = 100 - shares.reduce((a, b) => a + b, 0);
  const order = raw
    .map((value, index) => ({ index, frac: value - Math.floor(value) }))
    .sort((a, b) => b.frac - a.frac);
  for (const entry of order) {
    if (left <= 0) break;
    shares[entry.index] += 1;
    left -= 1;
  }
  return yours.map((card, index) => ({
    inventoryId: card.inventoryId,
    name: card.name,
    role: card.role,
    kills: 0,
    deaths: 0,
    assists: 0,
    gold: 0,
    damageShare: shares[index],
    contestsWon: 0,
    contestsLost: 0,
  }));
}

/** Books a contest: records it, moves the gold line, credits the card. */
function book(
  ledger: LedgerState,
  contest: Contest,
  goldSwing: number,
  ctx: MatchContext,
): Contest {
  // A trait like VULTURES pays THEM more for every beat they take; THE
  // BOUNTY BOARD does the same for you.
  const scaled =
    goldSwing < 0 ? goldSwing * (ctx.foe.goldMult ?? 1) : goldSwing * (ctx.effects.goldMult ?? 1);
  contest.goldSwing = Math.round(scaled);
  ledger.contests.push(contest);
  ledger.gold += contest.goldSwing;
  ledger.goldSeries.push({ clock: contest.clock, diff: Math.round(ledger.gold) });
  const line = contest.role
    ? ledger.players.find((player) => player.role === contest.role)
    : ledger.players.find((player) => player.name === contest.decidedBy);
  if (line) {
    if (contest.won) line.contestsWon += 1;
    else line.contestsLost += 1;
    line.gold += Math.round(contest.goldSwing * 0.35);
  }
  return contest;
}

/** Spreads a fight's kills, deaths and assists over your five. */
function bookFight(ledger: LedgerState, yours: GauntletCard[], won: boolean, effects: RelicEffects): void {
  const order = [...yours].sort(
    (a, b) => statOf(b, "damage", effects) - statOf(a, "damage", effects),
  );
  const killers = won ? order.slice(0, 3) : order.slice(0, 1);
  const dying = won
    ? [...yours].sort((a, b) => statOf(a, "survival", effects) - statOf(b, "survival", effects)).slice(0, 1)
    : [...yours].sort((a, b) => statOf(a, "survival", effects) - statOf(b, "survival", effects)).slice(0, 3);
  for (const card of killers) {
    const line = ledger.players.find((player) => player.role === card.role);
    if (line) {
      line.kills += 1;
      line.gold += 300;
    }
  }
  for (const card of dying) {
    const line = ledger.players.find((player) => player.role === card.role);
    if (line) line.deaths += 1;
  }
  for (const line of ledger.players) {
    if (!killers.some((card) => card.role === line.role) && won) line.assists += 1;
  }
}

/**
 * The first half: draft read, lanes, herald, dragon, the skirmish —
 * everything before the game asks a question. `rand` MUST come from
 * mulberry32(seed); the caller owns the seed's provenance.
 */
export function simulateFirstHalf(
  yours: GauntletCard[],
  theirs: GauntletCard[],
  ctx: MatchContext,
  rand: () => number,
): HalfState {
  const { effects } = ctx;
  const events: MatchEvent[] = [];
  // THE UNBROKEN: your momentum can never climb past its ceiling, so
  // there is no snowball to ride home.
  const ceiling = ctx.boss?.momentumCeiling ?? 95;
  const shape = lineupShapeOf(yours);
  const yourStyle = shape.style;
  const theirStyle = compStyleOf(theirs);
  const ledger: LedgerState = {
    contests: [],
    gold: 0,
    goldSeries: [{ clock: 0, diff: 0 }],
    players: freshPlayers(yours, effects),
  };

  // ── Draft read: the counter triangle sets the opening momentum, and
  //   the lineup's own shape is stated before a wave spawns.
  let momentum = 50;
  const draftSwing = 6 * (effects.draftMult ?? 1);
  if (shape.focusBonus > 0 || shape.chemistryBonus > 0) {
    events.push({
      clock: 0, kind: "draft", tone: "win",
      text: `Lineup shape: a committed ${shape.style} five${shape.chemistry >= 2 ? ` with ${shape.chemistry} teammates` : ""}`,
      detail: [
        shape.focusBonus > 0 ? `commitment ${shape.commitment} → +${shape.focusBonus.toFixed(1)} on ${FOCUS_BEATS[shape.style].join(" & ")}` : null,
        shape.chemistryBonus > 0 ? `chemistry → +${shape.chemistryBonus.toFixed(1)} everywhere` : null,
      ].filter(Boolean).join(" · "),
    });
  }
  if (COUNTERS[yourStyle] === theirStyle) {
    momentum += draftSwing;
    events.push({
      clock: 0, kind: "draft", tone: "win",
      text: `Draft read: your ${yourStyle} comp counters their ${theirStyle} · edge YOU`,
      detail: `${yourStyle} beats ${theirStyle} · +${Math.round(draftSwing)} momentum`,
    });
  } else if (COUNTERS[theirStyle] === yourStyle) {
    momentum -= draftSwing;
    events.push({
      clock: 0, kind: "draft", tone: "loss",
      text: `Draft read: their ${theirStyle} comp counters your ${yourStyle} · edge THEM`,
      detail: `${theirStyle} beats ${yourStyle} · −${Math.round(draftSwing)} momentum`,
    });
  } else {
    events.push({
      clock: 0, kind: "draft", tone: "neutral",
      text: `Draft read: ${yourStyle} into ${theirStyle} — even on paper`,
      detail: "no triangle edge",
    });
  }

  // ── Lane phase: role vs role on the bar that decides that lane. Each
  //   lane pays gold by its margin, so "lost bot by 700g" is literal.
  const lanesFlat = effects.lanesFlat ?? 0;
  const lanes: LaneResult[] = GAUNTLET_ROLES.map((role) => {
    const mine = byRole(yours, role);
    const foe = byRole(theirs, role);
    const key = LANE_KEY[role];
    const yoursVal =
      (mine ? statOf(mine, key, effects) : TRIALIST_OVERALL - 10) + lanesFlat +
      shapeBonus(shape, "lane", effects, ctx.boss) + behindFlat(effects, momentum);
    const theirsVal =
      (foe ? statOf(foe, key) : TRIALIST_OVERALL - 10) + (ctx.foe.lanesFlat ?? 0) + foeClockFlat(ctx, 8);
    const contest = checked(ctx,
      {
        key: `lane-${role}`, kind: "lane", label: `${role} lane`, clock: 8,
        yourKeys: [key], theirKeys: [key],
        yourVal: yoursVal, theirVal: theirsVal, spread: noise(24, ctx),
        decidedBy: mine?.name ?? null, role,
      },
      rand,
    );
    const gold = Math.round(clamp(contest.margin * 26, -680, 680));
    book(ledger, contest, gold, ctx);
    if (!contest.won && contest.margin < -12) {
      const line = ledger.players.find((player) => player.role === role);
      if (line) line.deaths += 1;
    }
    return {
      role,
      won: contest.won,
      yours: Math.round(yoursVal),
      theirs: Math.round(theirsVal),
      margin: contest.margin,
      gold: contest.goldSwing,
    };
  });
  const lanesWon = lanes.filter((lane) => lane.won).length;
  const laneSwing = (lanesWon - 2.5) * (4 * (effects.laneMomentumMult ?? 1));
  momentum = clamp(momentum + laneSwing, 5, ceiling);
  events.push({
    clock: 8, kind: "lanes", tone: lanesWon >= 3 ? "win" : "loss",
    text: `Lane phase — ${lanesWon} of 5 lanes won`,
    detail: lanes
      .map((lane) => `${lane.role.slice(0, 3)} ${lane.gold >= 0 ? "+" : ""}${lane.gold}g`)
      .join(" · "),
    gold: lanes.reduce((sum, lane) => sum + lane.gold, 0),
  });

  // ── Herald: the first map objective, and the first turret.
  const heraldContest = checked(ctx,
    {
      key: "herald-11", kind: "objective", label: "🐚 Rift Herald", clock: 11,
      yourKeys: ["objectives", "turrets"], theirKeys: ["objectives", "presence"],
      yourVal:
        teamAvg(yours, ["objectives", "turrets"], effects) + (effects.objectivesFlat ?? 0) +
        shapeBonus(shape, "objective", effects, ctx.boss) + behindFlat(effects, momentum),
      theirVal:
        teamAvg(theirs, ["objectives", "presence"]) + (ctx.foe.objectivesFlat ?? 0) + foeClockFlat(ctx, 11),
      spread: noise(28, ctx),
      decidedBy: byRole(yours, "Jungle")?.name ?? null, role: "Jungle",
    },
    rand,
  );
  book(ledger, heraldContest, (heraldContest.won ? 520 : -520) * (ctx.arena.objectiveGoldMult ?? 1), ctx);
  momentum = clamp(momentum + (heraldContest.won ? 4 : -4), 5, ceiling);
  events.push({
    clock: 11, kind: "objective", tone: heraldContest.won ? "win" : "loss",
    text: heraldContest.won ? "🐚 Rift Herald — taken, first turret falls" : "🐚 Rift Herald — theirs, your top turret goes",
    detail: contestDetail(heraldContest), contestKey: heraldContest.key, gold: heraldContest.goldSwing,
  });

  // ── First dragon.
  const dragonContest = checked(ctx,
    {
      key: "dragon-14", kind: "objective", label: "🐉 Dragon", clock: 14,
      yourKeys: ["objectives", "presence"], theirKeys: ["objectives", "presence"],
      yourVal:
        teamAvg(yours, ["objectives", "presence"], effects) + (effects.objectivesFlat ?? 0) +
        shapeBonus(shape, "objective", effects, ctx.boss) + behindFlat(effects, momentum),
      theirVal:
        teamAvg(theirs, ["objectives", "presence"]) + (ctx.foe.objectivesFlat ?? 0) + foeClockFlat(ctx, 14),
      spread: noise(30, ctx),
      decidedBy: byRole(yours, "Jungle")?.name ?? null, role: "Jungle",
    },
    rand,
  );
  book(ledger, dragonContest, (dragonContest.won ? 320 : -320) * (ctx.arena.objectiveGoldMult ?? 1), ctx);
  momentum = clamp(momentum + (dragonContest.won ? 5 : -5), 5, ceiling);
  events.push({
    clock: 14, kind: "objective", tone: dragonContest.won ? "win" : "loss",
    text: dragonContest.won ? "🐉 Dragon — taken clean" : "🐉 Dragon — conceded",
    detail: contestDetail(dragonContest), contestKey: dragonContest.key, gold: dragonContest.goldSwing,
  });

  // ── The skirmish. Symmetric: no home cushion.
  const fightFlat = (effects.fightFlat ?? 0) + (effects.earlyFightBonus ?? 0);
  const carry = [...yours].sort((a, b) => statOf(b, "damage", effects) - statOf(a, "damage", effects))[0];
  const skirmish = checked(ctx,
    {
      key: "skirmish-18", kind: "fight", label: "⚔ Skirmish in river", clock: 18,
      yourKeys: ["combat", "damage"], theirKeys: ["combat", "damage"],
      yourVal:
        teamAvg(yours, ["combat", "damage"], effects) + fightFlat + shapeBonus(shape, "fight", effects, ctx.boss) +
        behindFlat(effects, momentum),
      theirVal: teamAvg(theirs, ["combat", "damage"]) + (ctx.foe.fightFlat ?? 0) + foeClockFlat(ctx, 18),
      spread: noise(28, ctx),
      decidedBy: carry?.name ?? null, role: carry?.role ?? null,
    },
    rand,
  );
  book(ledger, skirmish, skirmish.won ? 900 : -900, ctx);
  bookFight(ledger, yours, skirmish.won, effects);
  momentum = clamp(momentum + fightSwing(skirmish.won, ctx), 5, ceiling);
  events.push({
    clock: 18, kind: "fight", tone: skirmish.won ? "win" : "loss",
    text: skirmish.won
      ? `⚔ Skirmish in river — won, ${carry?.name ?? "your carry"} leads`
      : "⚔ Skirmish in river — lost",
    detail: contestDetail(skirmish), contestKey: skirmish.key, gold: skirmish.goldSwing,
  });

  return {
    momentum: Math.round(momentum),
    events,
    lanes,
    lanesWon,
    yourStyle,
    theirStyle,
    situationKey: situationFor(momentum).key,
    ledger,
  };
}

/** The two sides of one crossroads check, for the choice screen — the
 *  EXACT numbers the resolver will roll. A safe choice previews as null. */
export function previewCrossroadsChoice(
  choice: CrossroadsChoice,
  yours: GauntletCard[],
  theirs: GauntletCard[],
  ctx: MatchContext,
  /** The scoreboard at 20:00 — comeback relics only pay when behind, and
   *  the odds on screen have to include them or they aren't the odds. */
  momentum = 50,
): { yourVal: number; theirVal: number } | null {
  if (choice.yourKeys.length === 0) return null;
  return {
    yourVal: Math.round(
      teamAvg(yours, choice.yourKeys, ctx.effects) + choice.bonus + (ctx.effects.crossroadsBonus ?? 0) +
        shapeBonus(lineupShapeOf(yours), "crossroads", ctx.effects, ctx.boss) + behindFlat(ctx.effects, momentum),
    ),
    theirVal: Math.round(teamAvg(theirs, choice.theirKeys) + foeClockFlat(ctx, 20)),
  };
}

/**
 * The Baron pit as a damage race. You burn it at a rate set by your
 * damage; they arrive on a clock set by your vision against their
 * pathing; whatever health is left when they get there is what the smite
 * check is fought over — which is why a loss can report "12% left, 340
 * damage short" instead of a shrug.
 */
function baronDance(
  yours: GauntletCard[],
  theirs: GauntletCard[],
  ctx: MatchContext,
  yoursToStart: boolean,
  rand: () => number,
  callObjectives = 0,
): { dance: BaronDance; contest: Contest } {
  const { effects } = ctx;
  const clock = 25;
  const dps = teamAvg(yours, ["damage", "combat"], effects) + (effects.fightFlat ?? 0);
  // Damage burns it down; a genuinely scary comp can finish before
  // anyone arrives, an average one leaves a sliver for the smite war.
  const burn =
    clamp((dps - 40) * 0.115, 1.0, 6.5) * (ctx.arena.baronSpeedMult ?? 1) * (effects.baronBurnMult ?? 1);
  // Their arrival: your vision buys seconds, their pathing spends them,
  // and the last few are luck — a pit that always ran the same length
  // would make the whole beat a lookup table.
  const window = clamp(
    20 + (teamAvg(yours, ["vision"], effects) - teamAvg(theirs, ["presence"])) * 0.45 +
      (effects.baronWindowFlat ?? 0) + (rand() - 0.5) * 10,
    9,
    34,
  );
  const hpLeft = yoursToStart ? clamp(100 - burn * window, 0, 100) : 100;

  // Whoever started it holds the pit — the advantage follows the start,
  // not the home side. (v2 handed it to the player unconditionally, which
  // is exactly the kind of quiet edge a strong lineup farms.)
  const startEdge = 4;
  const yourVal =
    teamAvg(yours, ["objectives", "vision"], effects) + (effects.objectivesFlat ?? 0) + callObjectives +
    (yoursToStart ? startEdge : 0);
  const theirVal =
    teamAvg(theirs, ["objectives", "combat"]) + (ctx.foe.objectivesFlat ?? 0) + foeClockFlat(ctx, clock) +
    (yoursToStart ? 0 : startEdge);

  const contest = checked(ctx,
    {
      key: "baron-25", kind: "baron", label: yoursToStart ? "🟣 Baron — your call" : "🟣 Baron — contested",
      clock,
      yourKeys: ["objectives", "vision"], theirKeys: ["objectives", "combat"],
      yourVal, theirVal, spread: noise(26, ctx),
      decidedBy: byRole(yours, "Jungle")?.name ?? null, role: "Jungle",
    },
    rand,
  );

  // A clean take: it died before anyone could contest it.
  const clean = yoursToStart && hpLeft <= 0;
  const taken = clean || contest.won;
  const hpAtResolve = clean ? 0 : Math.round(hpLeft * 10) / 10;
  const shortBy = taken ? 0 : Math.round(hpAtResolve * 28);

  let note: string;
  if (clean) {
    note = `Burned it in ${Math.round(window)}s — nobody arrived in time.`;
  } else if (taken) {
    note = `Smite war at ${hpAtResolve}% — you won it by ${Math.abs(contest.margin)}.`;
  } else if (yoursToStart) {
    note = `Their smite lands at ${hpAtResolve}% — you were ${shortBy} damage short.`;
  } else {
    note = `Their Baron, uncontested by ${Math.abs(contest.margin)}.`;
  }

  return {
    dance: { attempted: true, yours: yoursToStart, clock, hpAtResolve, shortBy, taken, stolen: !taken && yoursToStart, note },
    contest,
  };
}

/**
 * The second half: the call, the soul dragon, the Baron pit, the hold,
 * the nexus. `choiceKey` must belong to the state's situation; an unknown
 * key resolves as the safe play (an abandoned run still ends).
 */
export function simulateSecondHalf(
  state: HalfState,
  choiceKey: string,
  yours: GauntletCard[],
  theirs: GauntletCard[],
  ctx: MatchContext,
  rand: () => number,
): Omit<MatchResult, "score"> {
  const { effects } = ctx;
  const ceiling = ctx.boss?.momentumCeiling ?? 95;
  const shape = lineupShapeOf(yours);
  const situation: CrossroadsSituation = CROSSROADS_BY_KEY.get(state.situationKey) ?? {
    key: state.situationKey, title: "THE CALL", band: [0, 100], narration: "", choices: [],
  };
  const choice = situation.choices.find((entry) => entry.key === choiceKey) ?? safeChoiceOf(situation);

  const events = [...state.events];
  const ledger: LedgerState = {
    contests: [...state.ledger.contests],
    gold: state.ledger.gold,
    goldSeries: [...state.ledger.goldSeries],
    players: state.ledger.players.map((player) => ({ ...player })),
  };
  let momentum = state.momentum;
  let daring = 0;
  const stakes = ctx.arena.crossroadsStakesMult ?? 1;

  // ── The call. Its consequence shapes everything after it, and what a
  //   landed call PAYS is priced by the odds it was taken at — so the
  //   call you're best at is the cheap one.
  const preview = previewCrossroadsChoice(choice, yours, theirs, ctx, momentum);
  let spoils: CrossroadsSpoils | undefined;
  if (!preview) {
    // A no-roll call always "lands": it just takes its small sure gain.
    spoils = choice.consequence.onWin;
    momentum = clamp(momentum + choice.win * stakes, 5, ceiling);
    events.push({
      clock: 20, kind: "crossroads", tone: "neutral",
      text: `📣 ${situation.title}: ${choice.label} — no dice rolled, the lead is farmed out`,
      detail: `sure +${Math.round(choice.win * stakes)} momentum · no daring`,
    });
  } else {
    const spread = crossroadsSpread(ctx.arena);
    const chance = winChanceOf(preview.yourVal, preview.theirVal, spread);
    const call = checked(ctx,
      {
        key: "crossroads-20", kind: "crossroads", label: `📣 ${choice.label}`, clock: 20,
        yourKeys: choice.yourKeys, theirKeys: choice.theirKeys,
        yourVal: preview.yourVal, theirVal: preview.theirVal, spread,
        decidedBy: null, role: null,
      },
      rand,
    );
    spoils = call.won ? choice.consequence.onWin : choice.consequence.onFail;
    book(ledger, call, (call.won ? 400 : -400) + (spoils?.gold ?? 0), ctx);
    momentum = clamp(momentum + (call.won ? choice.win : choice.lose) * stakes, 5, ceiling);
    if (call.won) daring = Math.round(daringAt(choice.scoreBonus, chance) * (effects.daringMult ?? 1));
    events.push({
      clock: 20, kind: "crossroads", tone: call.won ? "win" : "loss",
      text: `📣 ${situation.title}: ${choice.label} — ${call.won ? "IT LANDS" : "it fails"}`,
      detail: `${contestDetail(call)} · ${Math.round(chance * 100)}% call${call.won && daring > 0 ? ` · +${daring} daring` : ""}`,
      contestKey: call.key, gold: call.goldSwing,
    });
  }
  // What the call bought (or cost) for the rest of the match.
  const callFight = spoils?.fightFlat ?? 0;
  const callHold = spoils?.holdFlat ?? 0;
  const callObjectives = spoils?.objectivesFlat ?? 0;
  if (callFight || callHold || callObjectives) {
    events.push({
      clock: 21, kind: "crossroads", tone: callFight + callHold + callObjectives >= 0 ? "win" : "loss",
      text: `↳ ${choice.consequence.note}`,
      detail: [
        callFight ? `fights ${callFight >= 0 ? "+" : ""}${callFight}` : null,
        callObjectives ? `objectives ${callObjectives >= 0 ? "+" : ""}${callObjectives}` : null,
        callHold ? `hold ${callHold >= 0 ? "+" : ""}${callHold}` : null,
      ].filter(Boolean).join(" · "),
    });
  }

  // ── Soul point dragon.
  const soul = checked(ctx,
    {
      key: "soul-23", kind: "objective", label: "🐲 Soul point dragon", clock: 23,
      yourKeys: ["objectives", "presence"], theirKeys: ["objectives", "presence"],
      yourVal:
        teamAvg(yours, ["objectives", "presence"], effects) + (effects.objectivesFlat ?? 0) + callObjectives +
        shapeBonus(shape, "objective", effects, ctx.boss) + behindFlat(effects, momentum),
      theirVal:
        teamAvg(theirs, ["objectives", "presence"]) + (ctx.foe.objectivesFlat ?? 0) + foeClockFlat(ctx, 23),
      spread: noise(30, ctx),
      decidedBy: byRole(yours, "Jungle")?.name ?? null, role: "Jungle",
    },
    rand,
  );
  book(ledger, soul, (soul.won ? 450 : -450) * (ctx.arena.objectiveGoldMult ?? 1), ctx);
  momentum = clamp(momentum + (soul.won ? 5 : -5), 5, ceiling);
  events.push({
    clock: 23, kind: "objective", tone: soul.won ? "win" : "loss",
    text: soul.won ? "🐲 Soul point dragon — secured" : "🐲 Soul point dragon — lost",
    detail: contestDetail(soul), contestKey: soul.key, gold: soul.goldSwing,
  });

  // ── The Baron pit. The call's OUTCOME decides who holds it when it
  //   says so; otherwise the scoreboard does.
  const yoursToStart = ctx.boss?.holdsPit
    ? false
    : spoils?.pit === "yours"
      ? true
      : spoils?.pit === "theirs"
        ? false
        : momentum >= 48;
  const { dance, contest: baronContest } = baronDance(
    yours, theirs, ctx, yoursToStart, rand,
    callObjectives + shapeBonus(shape, "baron", effects, ctx.boss) + behindFlat(effects, momentum),
  );
  book(ledger, baronContest, (dance.taken ? 1500 : -1500) * (ctx.arena.objectiveGoldMult ?? 1), ctx);
  momentum = clamp(momentum + (dance.taken ? 9 : -9), 5, ceiling);
  events.push({
    clock: dance.clock, kind: "baron", tone: dance.taken ? "win" : "loss",
    text: dance.taken
      ? `🟣 BARON — ${dance.hpAtResolve <= 0 ? "burned down clean" : "won the smite war"}`
      : `🟣 BARON — ${dance.stolen ? `STOLEN at ${dance.hpAtResolve}%` : "theirs"}`,
    detail: `${dance.note} · ${contestDetail(baronContest)}`,
    contestKey: baronContest.key, gold: baronContest.goldSwing,
  });

  // ── The fight that Baron buys — now weighted by the gold on the board.
  const edge = goldEdge(ledger.gold, ctx.arena) * (effects.goldEdgeMult ?? 1);
  const carry = [...yours].sort((a, b) => statOf(b, "damage", effects) - statOf(a, "damage", effects))[0];
  const pitFight = checked(ctx,
    {
      key: "fight-27", kind: "fight", label: "⚔ Fight at Baron pit", clock: 27,
      yourKeys: ["combat", "damage"], theirKeys: ["combat", "damage"],
      yourVal:
        teamAvg(yours, ["combat", "damage"], effects) + (effects.fightFlat ?? 0) + callFight + edge +
        shapeBonus(shape, "fight", effects, ctx.boss) + behindFlat(effects, momentum) + (dance.taken ? 6 : -6),
      theirVal: teamAvg(theirs, ["combat", "damage"]) + (ctx.foe.fightFlat ?? 0) + foeClockFlat(ctx, 27),
      spread: noise(28, ctx),
      decidedBy: carry?.name ?? null, role: carry?.role ?? null,
    },
    rand,
  );
  book(ledger, pitFight, pitFight.won ? 1300 : -1300, ctx);
  bookFight(ledger, yours, pitFight.won, effects);
  momentum = clamp(momentum + fightSwing(pitFight.won, ctx), 5, ceiling);
  events.push({
    clock: 27, kind: "fight", tone: pitFight.won ? "win" : "loss",
    text: pitFight.won
      ? `⚔ Fight at Baron pit — won, ${carry?.name ?? "your carry"} cleans it up`
      : "⚔ Fight at Baron pit — lost",
    detail: `${contestDetail(pitFight)} · gold edge ${edge >= 0 ? "+" : ""}${Math.round(edge)}`,
    contestKey: pitFight.key, gold: pitFight.goldSwing,
  });

  // ── The siege always happens; what it's WORTH scales with how close
  //   the game still is. (v3 fired it only between 35 and 65 momentum,
  //   which left every holdFlat relic dead in half of all matches.)
  const holder = [...yours].sort((a, b) => statOf(b, "survival", effects) - statOf(a, "survival", effects))[0];
  const closeness = 1 - Math.abs(momentum - 50) / 50;
  const holdWeight = 0.35 + 0.65 * closeness;
  const hold = checked(ctx,
    {
      key: "hold-29", kind: "hold", label: "🏰 The base hold", clock: 29,
      yourKeys: ["survival", "turrets"], theirKeys: ["damage", "objectives"],
      yourVal:
        teamAvg(yours, ["survival", "turrets"], effects) + (effects.holdFlat ?? 0) + callHold +
        shapeBonus(shape, "hold", effects, ctx.boss) + behindFlat(effects, momentum) + edge * 0.5,
      theirVal:
        teamAvg(theirs, ["damage", "objectives"]) + (ctx.foe.holdFlat ?? 0) + foeClockFlat(ctx, 29),
      spread: noise(20, ctx),
      decidedBy: holder?.name ?? null, role: holder?.role ?? null,
    },
    rand,
  );
  book(ledger, hold, Math.round((hold.won ? 500 : -800) * holdWeight), ctx);
  momentum = clamp(momentum + (hold.won ? 6 : -8) * holdWeight, 5, ceiling);
  events.push({
    clock: 29, kind: "hold", tone: hold.won ? "win" : "loss",
    text: hold.won
      ? `🏰 They siege — ${holder?.name ?? "the base"} holds it`
      : "🏰 They siege — the base cracks",
    detail: `${contestDetail(hold)}${holdWeight < 0.75 ? " · the game was already decided" : ""}`,
    contestKey: hold.key, gold: hold.goldSwing,
  });

  // ── The call home: momentum, the closers' impact, and the gold on the
  //   board — snowballed if the lanes earned it.
  const impact = teamAvg(yours, ["impact"], effects) - teamAvg(theirs, ["impact"]);
  const snowball = state.lanesWon >= 3 ? (effects.snowballMult ?? 1) : 1;
  const finalEdge = goldEdge(ledger.gold, ctx.arena) * (effects.goldEdgeMult ?? 1);
  const finalScore = (momentum - 50) * snowball + impact * 0.6 + finalEdge * 1.1 + (rand() - 0.5) * noise(10, ctx);
  const won = finalScore >= 0;
  momentum = clamp(Math.round(50 + finalScore), 2, 98);
  ledger.goldSeries.push({ clock: 31, diff: Math.round(ledger.gold) });
  events.push({
    clock: 31, kind: "nexus", tone: won ? "win" : "loss",
    text: won ? "VICTORY — NEXUS FALLS" : "DEFEAT — the run ends here",
    detail: `momentum ${Math.round(momentum)} · gold ${ledger.gold >= 0 ? "+" : ""}${Math.round(ledger.gold)} · impact ${impact >= 0 ? "+" : ""}${Math.round(impact)}`,
    gold: 0,
  });

  // MVP: the card that carried the most weight, not just the most damage.
  const mvpLine = [...ledger.players].sort(
    (a, b) =>
      b.kills * 3 + b.assists + b.contestsWon * 2 - b.deaths - (a.kills * 3 + a.assists + a.contestsWon * 2 - a.deaths),
  )[0];

  return {
    won,
    events,
    lanes: state.lanes,
    momentum,
    mvp: mvpLine?.name ?? carry?.name ?? yours[0]?.name ?? "—",
    daring: won ? daring : 0,
    yourStyle: state.yourStyle,
    theirStyle: state.theirStyle,
    contests: ledger.contests,
    goldSeries: ledger.goldSeries,
    gold: Math.round(ledger.gold),
    players: ledger.players,
    baron: dance,
  };
}

/**
 * A whole match in one call — the halves stitched with a chooser, which
 * defaults to the safe play. Tests and calibration live here; the real
 * game pauses between the halves for the human.
 */
export function simulateMatch(
  yours: GauntletCard[],
  theirs: GauntletCard[],
  ctx: MatchContext,
  rand: () => number,
  choose: (situation: CrossroadsSituation, state: HalfState) => string = (situation) =>
    safeChoiceOf(situation).key,
): Omit<MatchResult, "score"> {
  const half = simulateFirstHalf(yours, theirs, ctx, rand);
  const situation = CROSSROADS_BY_KEY.get(half.situationKey);
  const choiceKey = situation ? choose(situation, half) : "";
  return simulateSecondHalf(half, choiceKey, yours, theirs, ctx, rand);
}

/** What a landed call is worth in the round it was landed in. Depth is
 *  the dominant term in a run's score (200 + 55/round), so an unscaled
 *  daring bonus could never compete with just surviving — this makes a
 *  bold call late worth more than twice the same call in round 1. */
export function daringForRound(daring: number, round: number): number {
  return Math.round(daring * (1 + (round - 1) * 0.18));
}

/**
 * What a cleared round pays. Base by round with a difficulty ramp, style
 * points for margin, the daring bonus for a landed crossroads call, a tax
 * for every trialist fielded — and the style bonus is where cosmetics are
 * ALLOWED to matter: score, never the fight.
 */
export function roundScore(
  round: number,
  result: Pick<MatchResult, "won" | "momentum" | "daring">,
  lineup: GauntletCard[],
  effects: RelicEffects,
): number {
  if (!result.won) return 0;
  const base = 200 + round * 55;
  const margin = Math.round((result.momentum - 50) * 2.4);
  const trialistTax = lineup.filter((card) => card.trialist).length * 40;
  const flex = lineup.filter((card) => card.foil || card.signed).length * (effects.styleScorePerShiny ?? 5);
  return Math.max(
    25,
    base + margin - trialistTax + flex + daringForRound(result.daring, round) + (effects.scoreFlat ?? 0),
  );
}

/** The stand-in for an uncovered role — a warm body with flat 50s. */
export function makeTrialist(role: GauntletRole): GauntletCard {
  return {
    inventoryId: null,
    name: `Trialist ${role}`,
    role,
    overall: TRIALIST_OVERALL,
    stats: {},
    foil: false,
    signed: false,
    fresh: false,
    trialist: true,
  };
}
