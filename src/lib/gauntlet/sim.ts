// The Gauntlet's match engine — a league game as a pure function.
//
// Everything here is deterministic given (lineup, opponent, relics, seed):
// no Date, no Math.random, no I/O. The server rolls one CSPRNG seed per
// round and stores it BEFORE the fight resolves, so a run can be replayed,
// audited, and re-rendered forever — the same discipline as pack rolls,
// applied to a whole match.
//
// The sim reads the REAL cards: the five role bars every card carries
// (percentiles against the player's role cohort, src/lib/cards/measures)
// drive the three phases a league game actually has — lanes, objectives,
// fights — and the event log quotes the numbers so players can argue with
// the math. Cosmetics stay cosmetic: foil and ink never move a stat here
// (money must not win fights); relics may REFERENCE them for style score.

import type { MeasureKey } from "@/lib/cards/measures";
import type { RelicEffects } from "./relics";

/** One card in a Gauntlet lineup — the slice of PlayerCardData the sim
 *  reads, flattened so the server can build it from an inventory row. */
export interface GauntletCard {
  inventoryId: number | null;
  name: string;
  /** Display role: Top / Jungle / Mid / Bot / Support. */
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
  kind: "draft" | "lanes" | "objective" | "fight" | "hold" | "nexus";
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

export interface MatchResult {
  won: boolean;
  events: MatchEvent[];
  lanes: LaneResult[];
  /** 0–100 after the final whistle — the margin the score reads. */
  momentum: number;
  mvp: string;
  /** Round score earned (0 on a loss). */
  score: number;
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

function teamAvg(team: GauntletCard[], keys: MeasureKey[], effects?: RelicEffects): number {
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

/** Which bar decides each role's lane. Junglers don't lane — their early
 *  game is pathing and presence. */
const LANE_KEY: Record<GauntletRole, MeasureKey> = {
  Top: "laning",
  Jungle: "presence",
  Mid: "laning",
  Bot: "laning",
  Support: "vision",
};

const byRole = (team: GauntletCard[], role: GauntletRole): GauntletCard | undefined =>
  team.find((card) => card.role === role);

/**
 * One full match. `rand` MUST come from mulberry32(seed) — the caller owns
 * the seed's provenance.
 */
export function simulateMatch(
  yours: GauntletCard[],
  theirs: GauntletCard[],
  effects: RelicEffects,
  rand: () => number,
): Omit<MatchResult, "score"> {
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
  const lanes: LaneResult[] = GAUNTLET_ROLES.map((role) => {
    const mine = byRole(yours, role);
    const foe = byRole(theirs, role);
    const yoursVal = mine ? statOf(mine, LANE_KEY[role], effects) : TRIALIST_OVERALL - 10;
    const theirsVal = foe ? statOf(foe, LANE_KEY[role], effects) : TRIALIST_OVERALL - 10;
    const noise = (rand() - 0.5) * 24; // a bad day is real, a 20-point gap still isn't luck
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

  // ── Objectives: two contests, the jungler's war with the team behind it.
  const yourObj = teamAvg(yours, ["objectives", "presence"], effects) + (effects.objectivesFlat ?? 0);
  const theirObj = teamAvg(theirs, ["objectives", "presence"]);
  const OBJECTIVES = ["🐉 Dragon", "🐲 Second dragon", "👁 Herald"] as const;
  for (let i = 0; i < 2; i += 1) {
    const name = OBJECTIVES[Math.floor(rand() * OBJECTIVES.length)];
    const won = yourObj + (rand() - 0.5) * 30 >= theirObj;
    momentum = clamp(momentum + (won ? 5 : -5), 5, 95);
    events.push({
      clock: 13 + i * 4, kind: "objective", tone: won ? "win" : "loss",
      text: won ? `${name} — taken clean` : `${name} — conceded`,
      detail: `objectives ${Math.round(yourObj)} vs ${Math.round(theirObj)}`,
    });
  }

  // ── Fights: damage decides, survival forgives. Early kills can carry a
  //   relic bonus; the loudest card gets named.
  const yourFight = teamAvg(yours, ["combat", "damage"], effects);
  const theirFight = teamAvg(theirs, ["combat", "damage"]);
  const yourSurvival = teamAvg(yours, ["survival"], effects);
  const carry = [...yours].sort(
    (a, b) => statOf(b, "damage", effects) - statOf(a, "damage", effects),
  )[0];
  for (let i = 0; i < 2; i += 1) {
    const early = i === 0;
    const bonus = early ? (effects.earlyFightBonus ?? 0) : 0;
    const won = yourFight + bonus + (rand() - 0.5) * 28 >= theirFight;
    const swing = won ? 8 : Math.max(3, 8 - Math.round((yourSurvival - 50) / 10));
    momentum = clamp(momentum + (won ? swing : -swing), 5, 95);
    events.push({
      clock: 19 + i * 5, kind: "fight", tone: won ? "win" : "loss",
      text: won
        ? `⚔ ${early ? "Skirmish in river" : "Fight at Baron pit"} — won, ${carry?.name ?? "your carry"} leads`
        : `⚔ ${early ? "Skirmish in river" : "Fight at Baron pit"} — lost${yourSurvival >= 60 ? ", but the team disengages clean" : ""}`,
      detail: `damage ${Math.round(yourFight + bonus)} vs ${Math.round(theirFight)} · survival ${Math.round(yourSurvival)}`,
    });
  }

  // ── A close game earns a hold: the backdoor beat, survival's stage.
  // A real contest against THEIR closing power, not a fixed bar — a fixed
  // threshold made every good lineup hold every base, which compounded
  // into a home-side bias the bracket never asked for.
  if (momentum >= 35 && momentum <= 65) {
    const holder = [...yours].sort(
      (a, b) => statOf(b, "survival", effects) - statOf(a, "survival", effects),
    )[0];
    const held =
      teamAvg(yours, ["survival", "turrets"], effects) + (rand() - 0.5) * 20 >=
      teamAvg(theirs, ["damage", "objectives"]);
    momentum = clamp(momentum + (held ? 6 : -8), 5, 95);
    events.push({
      clock: 26, kind: "hold", tone: held ? "win" : "loss",
      text: held ? `🏰 They backdoor — ${holder?.name ?? "the base"} holds alone` : "🏰 They backdoor — the base cracks",
      detail: `survival ${Math.round(statOf(holder ?? yours[0], "survival", effects))}`,
    });
  }

  // ── The call: momentum plus the closers' impact, snowballed if a relic
  //   earned it.
  const impact = teamAvg(yours, ["impact"], effects) - teamAvg(theirs, ["impact"]);
  const snowball = lanesWon >= 3 ? (effects.snowballMult ?? 1) : 1;
  const finalScore = (momentum - 50) * snowball + impact * 0.6 + (rand() - 0.5) * 10;
  const won = finalScore >= 0;
  momentum = clamp(Math.round(50 + finalScore), 2, 98);
  events.push({
    clock: 29, kind: "nexus", tone: won ? "win" : "loss",
    text: won ? "VICTORY — NEXUS FALLS" : "DEFEAT — the run ends here",
    detail: null,
  });

  return { won, events, lanes, momentum, mvp: carry?.name ?? yours[0]?.name ?? "—", yourStyle, theirStyle };
}

/**
 * What a cleared round pays. Base by round with a difficulty ramp, style
 * points for margin, a tax for every trialist fielded — and the style
 * bonus is where cosmetics are ALLOWED to matter: score, never the fight.
 */
export function roundScore(
  round: number,
  result: Pick<MatchResult, "won" | "momentum">,
  lineup: GauntletCard[],
  effects: RelicEffects,
): number {
  if (!result.won) return 0;
  const base = 200 + round * 55;
  const margin = Math.round((result.momentum - 50) * 2.4);
  const trialistTax = lineup.filter((card) => card.trialist).length * 40;
  const flex = lineup.filter((card) => card.foil || card.signed).length * (effects.styleScorePerShiny ?? 5);
  return Math.max(25, base + margin - trialistTax + flex);
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
