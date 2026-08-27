// The relic catalog — the roguelike layer, as data.
//
// A relic is a run-scoped modifier the sim consumes through one aggregated
// RelicEffects object, so adding a relic is adding a catalog row, never
// touching the engine. Families reuse the moment-card vocabulary (ember /
// void / ice / gold) so the pick screen inherits a visual language the
// league already reads.
//
// THE LINE COSMETICS DON'T CROSS: foil and ink may feed style SCORE
// (styleScorePerShiny) but never a stat the fight reads — pack luck and
// patron money must not win matches, here or anywhere.

export interface RelicEffects {
  /** Multiplies the momentum swing of the lane phase. */
  laneMomentumMult?: number;
  /** Flat bonus to the team's objective contests. */
  objectivesFlat?: number;
  /** Flat bonus to the FIRST fight of each match. */
  earlyFightBonus?: number;
  /** Multiplies the endgame snowball earned by winning 3+ lanes. */
  snowballMult?: number;
  /** Extra Fresh Legs on this week's prints. */
  freshLegsExtra?: number;
  /** Score per foil/signed card fielded — style, never power. */
  styleScorePerShiny?: number;
  /** One mid-run lineup swap (consumed by the run state, not the sim). */
  benchSwap?: boolean;
  /** Flat bonus to BOTH fights — the brawler's dial. */
  fightFlat?: number;
  /** Flat shift on every lane matchup. Negative on tradeoff relics. */
  lanesFlat?: number;
  /** Flat bonus to the backdoor hold. Negative on glass builds. */
  holdFlat?: number;
  /** Flat help on every crossroads check — the shot-caller's dial. */
  crossroadsBonus?: number;
  /** Extra percent banked when retreating (consumed by the run state). */
  bankBonusPct?: number;
}

export type RelicFamily = "ember" | "void" | "ice" | "gold";

export interface RelicDef {
  key: string;
  family: RelicFamily;
  title: string;
  /** What it does, in the player's language. */
  effect: string;
  flavor: string;
  effects: RelicEffects;
}

export const RELIC_CATALOG: RelicDef[] = [
  {
    key: "blood_in_the_water",
    family: "ember",
    title: "BLOOD IN THE WATER",
    effect: "Your team fights the first skirmish of every match at +8.",
    flavor: "He speaks only in highlights.",
    effects: { earlyFightBonus: 8 },
  },
  {
    key: "home_crowd",
    family: "gold",
    title: "HOME CROWD",
    effect: "Win 3+ lanes and your endgame snowball is half again as heavy.",
    flavor: "The crowd knew before the cast did.",
    effects: { snowballMult: 1.5 },
  },
  {
    key: "smite_tax",
    family: "void",
    title: "SMITE TAX",
    effect: "Every objective is contested at +10. It was never their Baron.",
    flavor: "It was never their Baron.",
    effects: { objectivesFlat: 10 },
  },
  {
    key: "lane_kingdom",
    family: "ice",
    title: "LANE KINGDOM",
    effect: "The lane phase moves half again as much momentum — both ways.",
    flavor: "Fifteen minutes of farm decides the next fifteen.",
    effects: { laneMomentumMult: 1.5 },
  },
  {
    key: "fresh_legs",
    family: "gold",
    title: "TRAINING ARC",
    effect: "This week's prints carry double Fresh Legs.",
    flavor: "They practiced. It shows.",
    effects: { freshLegsExtra: 3 },
  },
  {
    key: "showcase",
    family: "gold",
    title: "THE SHOWCASE",
    effect: "Every foil or signed card you field pays +15 score per round. Style, never power.",
    flavor: "Shine is a stat now. (It is not.)",
    effects: { styleScorePerShiny: 15 },
  },
  {
    key: "sixth_man",
    family: "ice",
    title: "THE SIXTH MAN",
    effect: "Once this run, swap one fielded card for any card on your shelf between rounds.",
    flavor: "The bench was never cold.",
    effects: { benchSwap: true },
  },
  {
    key: "cold_blood",
    family: "ice",
    title: "COLD BLOOD",
    effect: "Lost fights bleed less — your disengage is rehearsed. (+6 effective survival in fights.)",
    flavor: "Nobody chases like they used to.",
    // Modeled as an early-fight cushion rather than a stat write, so the
    // engine stays the only thing that touches numbers.
    effects: { earlyFightBonus: 3, laneMomentumMult: 1.1 },
  },
  {
    key: "overtime",
    family: "ember",
    title: "OVERTIME",
    effect: "Both fights at +6 — but every lane at −3. You skipped scrims for this.",
    flavor: "Practice is for teams that lose.",
    effects: { fightFlat: 6, lanesFlat: -3 },
  },
  {
    key: "glass_cannon",
    family: "ember",
    title: "GLASS CANNON",
    effect: "Fights at +8; the base hold at −8. Nobody's home.",
    flavor: "The best defense is their fountain.",
    effects: { fightFlat: 8, holdFlat: -8 },
  },
  {
    key: "shot_caller",
    family: "gold",
    title: "THE SHOT CALLER",
    effect: "Every crossroads check at +8. The call was right before the fight started.",
    flavor: "Mid says go. You go.",
    effects: { crossroadsBonus: 8 },
  },
  {
    key: "deep_wards",
    family: "void",
    title: "DEEP WARDS",
    effect: "The base hold at +8 and objectives at +4 — you see everything coming.",
    flavor: "They walked past three of them.",
    effects: { holdFlat: 8, objectivesFlat: 4 },
  },
  {
    key: "pit_boss",
    family: "void",
    title: "PIT BOSS",
    effect: "Objectives at +6 and crossroads checks at +4 — the pit belongs to you.",
    flavor: "House rules.",
    effects: { objectivesFlat: 6, crossroadsBonus: 4 },
  },
  {
    key: "late_bloomer",
    family: "ice",
    title: "LATE BLOOMER",
    effect: "Lanes at −4; fights at +4 and the hold at +6. The game you want starts at 20 minutes.",
    flavor: "Ask again after three items.",
    effects: { lanesFlat: -4, fightFlat: 4, holdFlat: 6 },
  },
  {
    key: "the_banker",
    family: "gold",
    title: "THE BANKER",
    effect: "Retreating banks 15% extra score. The coward's exit, gilded.",
    flavor: "A living score beats a dead legend.",
    effects: { bankBonusPct: 15 },
  },
];

export const RELIC_BY_KEY = new Map(RELIC_CATALOG.map((relic) => [relic.key, relic]));

/** The combined effect of a run's held relics — what the sim consumes.
 *  Multipliers stack multiplicatively, flats add; both stay bounded by the
 *  catalog being small and hand-tuned. */
export function aggregateEffects(relicKeys: string[]): RelicEffects {
  const total: RelicEffects = {};
  for (const key of relicKeys) {
    const relic = RELIC_BY_KEY.get(key);
    if (!relic) continue;
    const fx = relic.effects;
    if (fx.laneMomentumMult) total.laneMomentumMult = (total.laneMomentumMult ?? 1) * fx.laneMomentumMult;
    if (fx.snowballMult) total.snowballMult = (total.snowballMult ?? 1) * fx.snowballMult;
    if (fx.objectivesFlat) total.objectivesFlat = (total.objectivesFlat ?? 0) + fx.objectivesFlat;
    if (fx.earlyFightBonus) total.earlyFightBonus = (total.earlyFightBonus ?? 0) + fx.earlyFightBonus;
    if (fx.freshLegsExtra) total.freshLegsExtra = (total.freshLegsExtra ?? 0) + fx.freshLegsExtra;
    if (fx.styleScorePerShiny) total.styleScorePerShiny = (total.styleScorePerShiny ?? 0) + fx.styleScorePerShiny;
    if (fx.fightFlat) total.fightFlat = (total.fightFlat ?? 0) + fx.fightFlat;
    if (fx.lanesFlat) total.lanesFlat = (total.lanesFlat ?? 0) + fx.lanesFlat;
    if (fx.holdFlat) total.holdFlat = (total.holdFlat ?? 0) + fx.holdFlat;
    if (fx.crossroadsBonus) total.crossroadsBonus = (total.crossroadsBonus ?? 0) + fx.crossroadsBonus;
    if (fx.bankBonusPct) total.bankBonusPct = (total.bankBonusPct ?? 0) + fx.bankBonusPct;
    if (fx.benchSwap) total.benchSwap = true;
  }
  return total;
}

/** The three relics offered after a cleared round — a seeded draw of the
 *  catalog minus what's already held. Fewer than three remain only late in
 *  a run stacked with relics; the offer just shrinks. */
export function offerRelics(heldKeys: string[], rand: () => number): RelicDef[] {
  const pool = RELIC_CATALOG.filter((relic) => !heldKeys.includes(relic.key));
  const offer: RelicDef[] = [];
  while (offer.length < 3 && pool.length > 0) {
    const index = Math.min(pool.length - 1, Math.floor(rand() * pool.length));
    offer.push(pool.splice(index, 1)[0]);
  }
  return offer;
}
