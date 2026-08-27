// The Gauntlet's match engine — a league game as a pure function.
//
// Everything here is deterministic given (lineup, opponent, relics, seed):
// no Date, no Math.random, no I/O. The server rolls CSPRNG seeds and
// stores them BEFORE anything resolves, so a run can be replayed, audited,
// and re-rendered forever — the same discipline as pack rolls.
//
// v2 shape: a match is TWO HALVES around a crossroads. The first half
// (draft read, lanes, an objective, a skirmish) sets the scoreboard; the
// scoreboard summons a situation (crossroads.ts) and the PLAYER makes the
// call; the second half (the call, a second objective, the big fight, the
// hold, the nexus) resolves it. Fights are symmetric — no home cushion:
// v1's survival discount on your losses compounded into an edge strong
// lineups farmed. Cosmetics never touch a stat (pinned by test).

import type { MeasureKey } from "@/lib/cards/measures";
import type { RelicEffects } from "./relics";
import {
  type CrossroadsChoice,
  CROSSROADS_BY_KEY,
  type CrossroadsSituation,
  safeChoiceOf,
  situationFor,
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
  /** A stand-in for a role the collection can't cover. Costs score. */
  trialist?: boolean;
}

export type GauntletRole = "Top" | "Jungle" | "Mid" | "Bot" | "Support";
export const GAUNTLET_ROLES: GauntletRole[] = ["Top", "Jungle", "Mid", "Bot", "Support"];

/** The stat edge a card printed this week carries — the reason the weekly
 *  drop rotates the meta. Small on a 0–99 scale, and stated on the draft
 *  screen rather than hidden. */
export const FRESH_LEGS_BONUS = 3;

/** What a trialist plays like: a warm body, not a carry. */
export const TRIALIST_OVERALL = 55;

/** Rounds in a full run. */
export const GAUNTLET_ROUNDS = 8;

/** Comp identities, read from a team's stat shape. The triangle:
 *  poke > dive > protect > poke. */
export type CompStyle = "poke" | "dive" | "protect";
const COUNTERS: Record<CompStyle, CompStyle> = { poke: "dive", dive: "protect", protect: "poke" };

export interface MatchEvent {
  /** Minutes into the game, or null for pre-game lines. */
  clock: number | null;
  kind: "draft" | "lanes" | "objective" | "fight" | "crossroads" | "hold" | "nexus";
  /** Good/bad for YOUR side, for the timeline's dot colors. */
  tone: "win" | "loss" | "neutral";
  text: string;
  /** The numbers behind the line, monospace on the timeline. */
  detail: string | null;
}

export interface LaneResult {
  role: GauntletRole;
  won: boolean;
  yours: number;
  theirs: number;
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
  /** Crossroads score landed by a daring call — folded into `score` by
   *  roundScore; kept for the tape's own line. */
  daring: number;
  yourStyle: CompStyle;
  theirStyle: CompStyle;
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
 * poke, combat+presence reads dive, survival+vision reads protect. Derived
 * rather than declared, so the lineup you drafted IS your identity and
 * re-drafting changes it — the layer of the game above the numbers.
 */
export function compStyleOf(team: GauntletCard[]): CompStyle {
  const poke = teamAvg(team, ["damage", "laning"]);
  const dive = teamAvg(team, ["combat", "presence"]);
  const protect = teamAvg(team, ["survival", "vision"]);
  if (poke >= dive && poke >= protect) return "poke";
  if (dive >= protect) return "dive";
  return "protect";
}

/** The three identity scores behind compStyleOf, for the draft screen's
 *  readout — the player deserves the same numbers the sim reads. */
export function compProfileOf(team: GauntletCard[]): Record<CompStyle, number> {
  return {
    poke: Math.round(teamAvg(team, ["damage", "laning"])),
    dive: Math.round(teamAvg(team, ["combat", "presence"])),
    protect: Math.round(teamAvg(team, ["survival", "vision"])),
  };
}

/** Which bar decides each role's lane. Junglers don't lane — their early
 *  game is pathing and presence. Exported for the draft screen's table. */
export const LANE_KEY: Record<GauntletRole, MeasureKey> = {
  Top: "laning",
  Jungle: "presence",
  Mid: "laning",
  Bot: "laning",
  Support: "vision",
};

const byRole = (team: GauntletCard[], role: GauntletRole): GauntletCard | undefined =>
  team.find((card) => card.role === role);

/**
 * The first half: draft read, lanes, the first objective, the skirmish —
 * everything before the game asks a question. `rand` MUST come from
 * mulberry32(seed); the caller owns the seed's provenance.
 */
export function simulateFirstHalf(
  yours: GauntletCard[],
  theirs: GauntletCard[],
  effects: RelicEffects,
  rand: () => number,
): HalfState {
  const events: MatchEvent[] = [];
  const yourStyle = compStyleOf(yours);
  const theirStyle = compStyleOf(theirs);

  // ── Draft read: the counter triangle sets the opening momentum.
  let momentum = 50;
  if (COUNTERS[yourStyle] === theirStyle) {
    momentum += 6;
    events.push({
      clock: 0, kind: "draft", tone: "win",
      text: `Draft read: your ${yourStyle} comp counters their ${theirStyle} · edge YOU`,
      detail: null,
    });
  } else if (COUNTERS[theirStyle] === yourStyle) {
    momentum -= 6;
    events.push({
      clock: 0, kind: "draft", tone: "loss",
      text: `Draft read: their ${theirStyle} comp counters your ${yourStyle} · edge THEM`,
      detail: null,
    });
  } else {
    events.push({
      clock: 0, kind: "draft", tone: "neutral",
      text: `Draft read: ${yourStyle} into ${theirStyle} — even on paper`,
      detail: null,
    });
  }

  // ── Lane phase: role vs role on the bar that decides that lane.
  const lanesFlat = effects.lanesFlat ?? 0;
  const lanes: LaneResult[] = GAUNTLET_ROLES.map((role) => {
    const mine = byRole(yours, role);
    const foe = byRole(theirs, role);
    const yoursVal = (mine ? statOf(mine, LANE_KEY[role], effects) : TRIALIST_OVERALL - 10) + lanesFlat;
    const theirsVal = foe ? statOf(foe, LANE_KEY[role], effects) : TRIALIST_OVERALL - 10;
    const noise = (rand() - 0.5) * 24;
    return { role, won: yoursVal + noise >= theirsVal, yours: Math.round(yoursVal), theirs: Math.round(theirsVal) };
  });
  const lanesWon = lanes.filter((lane) => lane.won).length;
  const laneSwing = (lanesWon - 2.5) * (4 * (effects.laneMomentumMult ?? 1));
  momentum = clamp(momentum + laneSwing, 5, 95);
  events.push({
    clock: 8, kind: "lanes", tone: lanesWon >= 3 ? "win" : "loss",
    text: `Lane phase — ${lanesWon} of 5 lanes won`,
    detail: `laning ${lanes.map((l) => l.yours).join("·")} vs ${lanes.map((l) => l.theirs).join("·")}`,
  });

  // ── First objective: the jungler's war with the team behind it.
  const yourObj = teamAvg(yours, ["objectives", "presence"], effects) + (effects.objectivesFlat ?? 0);
  const theirObj = teamAvg(theirs, ["objectives", "presence"]);
  const objWon = yourObj + (rand() - 0.5) * 30 >= theirObj;
  momentum = clamp(momentum + (objWon ? 5 : -5), 5, 95);
  events.push({
    clock: 14, kind: "objective", tone: objWon ? "win" : "loss",
    text: objWon ? "🐉 Dragon — taken clean" : "🐉 Dragon — conceded",
    detail: `objectives ${Math.round(yourObj)} vs ${Math.round(theirObj)}`,
  });

  // ── The skirmish. Symmetric: ±8 either way, no home cushion.
  const fightFlat = (effects.fightFlat ?? 0) + (effects.earlyFightBonus ?? 0);
  const yourFight = teamAvg(yours, ["combat", "damage"], effects) + fightFlat;
  const theirFight = teamAvg(theirs, ["combat", "damage"]);
  const carry = [...yours].sort((a, b) => statOf(b, "damage", effects) - statOf(a, "damage", effects))[0];
  const fightWon = yourFight + (rand() - 0.5) * 28 >= theirFight;
  momentum = clamp(momentum + (fightWon ? 8 : -8), 5, 95);
  events.push({
    clock: 18, kind: "fight", tone: fightWon ? "win" : "loss",
    text: fightWon
      ? `⚔ Skirmish in river — won, ${carry?.name ?? "your carry"} leads`
      : "⚔ Skirmish in river — lost",
    detail: `damage ${Math.round(yourFight)} vs ${Math.round(theirFight)}`,
  });

  return {
    momentum: Math.round(momentum),
    events,
    lanes,
    lanesWon,
    yourStyle,
    theirStyle,
    situationKey: situationFor(momentum).key,
  };
}

/** The two sides of one crossroads check, for the choice screen — the
 *  EXACT numbers resolveCrossroads will roll. An empty-keyed (safe)
 *  choice previews as null: there is nothing to roll. */
export function previewCrossroadsChoice(
  choice: CrossroadsChoice,
  yours: GauntletCard[],
  theirs: GauntletCard[],
  effects: RelicEffects,
): { yourVal: number; theirVal: number } | null {
  if (choice.yourKeys.length === 0) return null;
  return {
    yourVal: Math.round(teamAvg(yours, choice.yourKeys, effects) + choice.bonus + (effects.crossroadsBonus ?? 0)),
    theirVal: Math.round(teamAvg(theirs, choice.theirKeys)),
  };
}

/**
 * The second half: the call, the second objective, the big fight, the
 * hold, the nexus. `choiceKey` must belong to the state's situation; an
 * unknown key resolves as the safe play (an abandoned run still ends).
 */
export function simulateSecondHalf(
  state: HalfState,
  choiceKey: string,
  yours: GauntletCard[],
  theirs: GauntletCard[],
  effects: RelicEffects,
  rand: () => number,
): Omit<MatchResult, "score"> {
  const situation: CrossroadsSituation = CROSSROADS_BY_KEY.get(state.situationKey) ?? {
    key: state.situationKey,
    title: "THE CALL",
    band: [0, 100],
    narration: "",
    choices: [],
  };
  const choice =
    situation.choices.find((entry) => entry.key === choiceKey) ?? safeChoiceOf(situation);

  const events = [...state.events];
  let momentum = state.momentum;
  let daring = 0;

  // ── The call.
  const preview = previewCrossroadsChoice(choice, yours, theirs, effects);
  let called: boolean;
  if (!preview) {
    called = true;
    momentum = clamp(momentum + choice.win, 5, 95);
    events.push({
      clock: 20, kind: "crossroads", tone: "neutral",
      text: `📣 ${situation.title}: ${choice.label} — no dice rolled, the map is conceded quietly`,
      detail: null,
    });
  } else {
    called = preview.yourVal + (rand() - 0.5) * 26 >= preview.theirVal;
    momentum = clamp(momentum + (called ? choice.win : choice.lose), 5, 95);
    if (called) daring = choice.scoreBonus;
    events.push({
      clock: 20, kind: "crossroads", tone: called ? "win" : "loss",
      text: `📣 ${situation.title}: ${choice.label} — ${called ? "IT LANDS" : "it fails"}`,
      detail: `your ${choice.yourKeys.join("+")} ${preview.yourVal} vs their ${choice.theirKeys.join("+")} ${preview.theirVal}`,
    });
  }

  // ── Second objective.
  const yourObj = teamAvg(yours, ["objectives", "presence"], effects) + (effects.objectivesFlat ?? 0);
  const theirObj = teamAvg(theirs, ["objectives", "presence"]);
  const objWon = yourObj + (rand() - 0.5) * 30 >= theirObj;
  momentum = clamp(momentum + (objWon ? 5 : -5), 5, 95);
  events.push({
    clock: 23, kind: "objective", tone: objWon ? "win" : "loss",
    text: objWon ? "🐲 Soul point dragon — secured" : "🐲 Soul point dragon — lost",
    detail: `objectives ${Math.round(yourObj)} vs ${Math.round(theirObj)}`,
  });

  // ── The big fight. Symmetric ±8, same as the skirmish.
  const fightFlat = effects.fightFlat ?? 0;
  const yourFight = teamAvg(yours, ["combat", "damage"], effects) + fightFlat;
  const theirFight = teamAvg(theirs, ["combat", "damage"]);
  const carry = [...yours].sort((a, b) => statOf(b, "damage", effects) - statOf(a, "damage", effects))[0];
  const fightWon = yourFight + (rand() - 0.5) * 28 >= theirFight;
  momentum = clamp(momentum + (fightWon ? 8 : -8), 5, 95);
  events.push({
    clock: 26, kind: "fight", tone: fightWon ? "win" : "loss",
    text: fightWon
      ? `⚔ Fight at Baron pit — won, ${carry?.name ?? "your carry"} cleans it up`
      : "⚔ Fight at Baron pit — lost",
    detail: `damage ${Math.round(yourFight)} vs ${Math.round(theirFight)}`,
  });

  // ── A close game earns a hold: a real contest against their closers.
  if (momentum >= 35 && momentum <= 65) {
    const holder = [...yours].sort((a, b) => statOf(b, "survival", effects) - statOf(a, "survival", effects))[0];
    const held =
      teamAvg(yours, ["survival", "turrets"], effects) + (effects.holdFlat ?? 0) + (rand() - 0.5) * 20 >=
      teamAvg(theirs, ["damage", "objectives"]);
    momentum = clamp(momentum + (held ? 6 : -8), 5, 95);
    events.push({
      clock: 28, kind: "hold", tone: held ? "win" : "loss",
      text: held ? `🏰 They backdoor — ${holder?.name ?? "the base"} holds alone` : "🏰 They backdoor — the base cracks",
      detail: `survival ${Math.round(statOf(holder ?? yours[0], "survival", effects))}`,
    });
  }

  // ── The call home: momentum plus the closers' impact, snowballed if
  //   the lanes earned it.
  const impact = teamAvg(yours, ["impact"], effects) - teamAvg(theirs, ["impact"]);
  const snowball = state.lanesWon >= 3 ? (effects.snowballMult ?? 1) : 1;
  const finalScore = (momentum - 50) * snowball + impact * 0.6 + (rand() - 0.5) * 10;
  const won = finalScore >= 0;
  momentum = clamp(Math.round(50 + finalScore), 2, 98);
  events.push({
    clock: 30, kind: "nexus", tone: won ? "win" : "loss",
    text: won ? "VICTORY — NEXUS FALLS" : "DEFEAT — the run ends here",
    detail: null,
  });

  return {
    won,
    events,
    lanes: state.lanes,
    momentum,
    mvp: carry?.name ?? yours[0]?.name ?? "—",
    daring: won ? daring : 0,
    yourStyle: state.yourStyle,
    theirStyle: state.theirStyle,
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
  effects: RelicEffects,
  rand: () => number,
  choose: (situation: CrossroadsSituation, state: HalfState) => string = (situation) =>
    safeChoiceOf(situation).key,
): Omit<MatchResult, "score"> {
  const half = simulateFirstHalf(yours, theirs, effects, rand);
  const situation = CROSSROADS_BY_KEY.get(half.situationKey);
  const choiceKey = situation ? choose(situation, half) : "";
  return simulateSecondHalf(half, choiceKey, yours, theirs, effects, rand);
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
  return Math.max(25, base + margin - trialistTax + flex + result.daring + (effects.scoreFlat ?? 0));
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
