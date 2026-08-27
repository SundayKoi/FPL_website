// Enemy traits and round conditions — the variety layer.
//
// Slay the Spire is replayable because its variety is COMBINATORIAL, not
// authored per run: relics with real downsides, stacked against modifiers
// you can read before you commit. Same trick here, one size smaller:
//
//   - a trait belongs to the enemy team and bends THEIR checks
//     ("PIT BULLIES: +8 on every objective")
//   - a condition belongs to the round and bends the RULES for both sides
//     ("BLOOD MOON: fights swing half again as hard")
//
// Both are rolled from the round's stored seed, and both are printed on
// the scouting screen BEFORE the fight — a modifier you can't see is just
// noise wearing a costume.
//
// THE RULE FOR TRAITS: a trait is a SHAPE, not a stat stick. Every one
// pays for its strength somewhere else, so scouting changes what you do
// rather than how doomed you are — the bracket ramp is where difficulty
// lives, and it is the only place.

/** What a trait does to the enemy's side of the checks. */
export interface TraitEffects {
  /** Flat on their objective contests (dragon, herald, Baron smite). */
  objectivesFlat?: number;
  /** Flat on their side of both teamfights. */
  fightFlat?: number;
  /** Flat on every lane matchup. */
  lanesFlat?: number;
  /** Flat when they siege your base in the hold. */
  holdFlat?: number;
  /** Flat on everything BEFORE 15:00 — the early-game dial. */
  earlyFlat?: number;
  /** Flat on everything AFTER 15:00 — the scaling dial. */
  lateFlat?: number;
  /** Multiplies the gold they take from a won beat. */
  goldMult?: number;
}

export interface EnemyTrait {
  key: string;
  title: string;
  /** What it does, in the player's language. */
  blurb: string;
  /** How to beat it — printed on the scouting screen. */
  counter: string;
  effects: TraitEffects;
}

export const TRAIT_CATALOG: EnemyTrait[] = [
  {
    key: "pit_bullies",
    title: "PIT BULLIES",
    blurb: "+9 on every dragon, herald and Baron contest — but −6 in a straight fight.",
    counter: "Refuse the pit and take the fights, or bring an objective relic and beat them at it.",
    effects: { objectivesFlat: 9, fightFlat: -6 },
  },
  {
    key: "slow_starters",
    title: "SLOW STARTERS",
    blurb: "−7 on everything before 15:00, +7 on everything after. They buy time.",
    counter: "Your snowball has a deadline — call the aggressive line early.",
    effects: { earlyFlat: -7, lateFlat: 7 },
  },
  {
    key: "lane_bullies",
    title: "LANE BULLIES",
    blurb: "+8 in every lane, −7 on objectives. They intend to win before the map opens.",
    counter: "Survive the lanes and the map is free — they can't contest the pit.",
    effects: { lanesFlat: 8, objectivesFlat: -7 },
  },
  {
    key: "brawlers",
    title: "BRAWLERS",
    blurb: "+8 in both teamfights, −6 in lane. They only want the 5v5.",
    counter: "Win the lanes, take the map, and never give them the fight they want.",
    effects: { fightFlat: 8, lanesFlat: -6 },
  },
  {
    key: "turtles",
    title: "TURTLES",
    blurb: "+12 defending their base, −5 everywhere on the map.",
    counter: "Beat them to death in the open — just don't let it reach their base even.",
    effects: { holdFlat: 12, objectivesFlat: -5, fightFlat: -3 },
  },
  {
    key: "glass_house",
    title: "GLASS HOUSE",
    blurb: "+9 in fights, −14 defending. All offence, no home.",
    counter: "Survive the mid-game and their base folds on the first siege.",
    effects: { fightFlat: 9, holdFlat: -14 },
  },
  {
    key: "vultures",
    title: "VULTURES",
    blurb: "Every beat they win pays them 35% more gold — but they fight 5 worse.",
    counter: "Deny the first two objectives and the trait has nothing to eat.",
    effects: { goldMult: 1.35, fightFlat: -5 },
  },
  {
    key: "scrim_gods",
    title: "SCRIM GODS",
    blurb: "+3 on absolutely everything. No weakness, no specialty, no mercy.",
    counter: "Nothing to exploit — this one is won on your own numbers.",
    effects: { earlyFlat: 3, lateFlat: 3 },
  },
];

export const TRAIT_BY_KEY = new Map(TRAIT_CATALOG.map((trait) => [trait.key, trait]));

/** The combined effect of a team's traits. Flats add, multipliers stack. */
export function aggregateTraits(keys: string[]): TraitEffects {
  const total: TraitEffects = {};
  for (const key of keys) {
    const trait = TRAIT_BY_KEY.get(key);
    if (!trait) continue;
    const fx = trait.effects;
    if (fx.objectivesFlat) total.objectivesFlat = (total.objectivesFlat ?? 0) + fx.objectivesFlat;
    if (fx.fightFlat) total.fightFlat = (total.fightFlat ?? 0) + fx.fightFlat;
    if (fx.lanesFlat) total.lanesFlat = (total.lanesFlat ?? 0) + fx.lanesFlat;
    if (fx.holdFlat) total.holdFlat = (total.holdFlat ?? 0) + fx.holdFlat;
    if (fx.earlyFlat) total.earlyFlat = (total.earlyFlat ?? 0) + fx.earlyFlat;
    if (fx.lateFlat) total.lateFlat = (total.lateFlat ?? 0) + fx.lateFlat;
    if (fx.goldMult) total.goldMult = (total.goldMult ?? 1) * fx.goldMult;
  }
  return total;
}

/** How many traits a round's enemy wears. The bracket gets stranger as it
 *  gets harder, so late rounds are read-the-scouting-screen rounds. */
export function traitCountFor(round: number): number {
  if (round <= 2) return 1;
  if (round <= 5) return 2;
  return 3;
}

/** Rolls a round's traits without duplicates. */
export function rollTraits(round: number, rand: () => number): string[] {
  const pool = [...TRAIT_CATALOG];
  const picked: string[] = [];
  const want = Math.min(traitCountFor(round), pool.length);
  while (picked.length < want) {
    const index = Math.min(pool.length - 1, Math.floor(rand() * pool.length));
    picked.push(pool.splice(index, 1)[0].key);
  }
  return picked;
}

// ── Round conditions ────────────────────────────────────────────────────

/** What a condition does to the match's RULES — both sides equally. */
export interface ConditionEffects {
  /** Multiplies the momentum a fight swings. */
  fightSwingMult?: number;
  /** Multiplies gold paid by objectives. */
  objectiveGoldMult?: number;
  /** Multiplies how much a gold lead helps late fights. */
  goldEdgeMult?: number;
  /** Multiplies the momentum staked at the crossroads. */
  crossroadsStakesMult?: number;
  /** Multiplies every check's noise band — chaos, both ways. */
  noiseMult?: number;
  /** Multiplies how fast the Baron burns down. */
  baronSpeedMult?: number;
}

export interface RoundCondition {
  key: string;
  title: string;
  blurb: string;
  /** The strategic read, printed under it on the scouting screen. */
  tip: string;
  effects: ConditionEffects;
}

export const CONDITION_CATALOG: RoundCondition[] = [
  {
    key: "standard",
    title: "STANDARD PATCH",
    blurb: "No changes. The game as written.",
    tip: "Nothing to play around — draft for the enemy, not the patch.",
    effects: {},
  },
  {
    key: "blood_moon",
    title: "BLOOD MOON",
    blurb: "Every teamfight swings half again as much momentum.",
    tip: "Ember relics spike. A fight-losing comp can be dead by 20:00.",
    effects: { fightSwingMult: 1.5 },
  },
  {
    key: "turtle_patch",
    title: "TURTLE PATCH",
    blurb: "Objectives pay double gold, and the Baron takes 25% longer to kill.",
    tip: "The crossroads Baron call is worth twice as much — if you can finish it.",
    effects: { objectiveGoldMult: 2, baronSpeedMult: 0.75 },
  },
  {
    key: "gold_rush",
    title: "GOLD RUSH",
    blurb: "A gold lead counts double in late fights. Snowballs don't melt.",
    tip: "Win the lane phase and the game is already decided. Lose it and hurry.",
    effects: { goldEdgeMult: 2 },
  },
  {
    key: "high_stakes",
    title: "HIGH STAKES",
    blurb: "Every crossroads call stakes half again as much momentum, both ways.",
    tip: "The safe play has never been worth more — or cost more.",
    effects: { crossroadsStakesMult: 1.5 },
  },
  {
    key: "coin_flip",
    title: "COIN-FLIP PATCH",
    blurb: "Every check draws 40% more noise. Skill matters less; nerve matters more.",
    tip: "Favourites suffer here. If you're outgunned, this is your round.",
    effects: { noiseMult: 1.4 },
  },
  {
    key: "sudden_death",
    title: "SUDDEN DEATH",
    blurb: "The Baron dies 40% faster — the pit is decided in seconds.",
    tip: "Contesting is cheaper for BOTH teams. Vision is worth more than usual.",
    effects: { baronSpeedMult: 1.4 },
  },
];

export const CONDITION_BY_KEY = new Map(CONDITION_CATALOG.map((condition) => [condition.key, condition]));

/** The round's condition. Round 1 is always standard — a player's first
 *  fight of a run teaches the base game, then the patches start. */
export function rollCondition(round: number, rand: () => number): string {
  if (round <= 1) return "standard";
  const pool = CONDITION_CATALOG.filter((condition) => condition.key !== "standard");
  return pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))].key;
}

export function conditionEffects(key: string | null | undefined): ConditionEffects {
  return CONDITION_BY_KEY.get(key ?? "standard")?.effects ?? {};
}
