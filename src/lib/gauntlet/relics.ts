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
  /** Flat extra score on every cleared round — pays the board, never the
   *  fight. */
  scoreFlat?: number;
  /** Multiplies the gold every beat you WIN pays you. */
  goldMult?: number;
  /** Multiplies what a gold lead is worth in late checks. */
  goldEdgeMult?: number;
  /** Multiplies what a landed crossroads call pays. */
  daringMult?: number;
  /** Multiplies how fast your team burns the Baron down. */
  baronBurnMult?: number;
  /** Extra seconds in the pit before they arrive. */
  baronWindowFlat?: number;
  /** Flat help on every check while you are BEHIND (momentum under 45). */
  comebackFlat?: number;
  /** Multiplies what your comp's commitment is worth. */
  commitmentMult?: number;
  /** Multiplies what your lineup's chemistry is worth. */
  chemistryMult?: number;
  /** Multiplies the draft read's opening momentum swing. */
  draftMult?: number;
}

/** How often a relic turns up in an offer. Rarity is the variety lever:
 *  a catalog where everything is equally likely has no highs. */
export type RelicRarity = "common" | "uncommon" | "rare";

export type RelicFamily = "ember" | "void" | "ice" | "gold";

export interface RelicDef {
  key: string;
  family: RelicFamily;
  rarity: RelicRarity;
  title: string;
  /** What it does, in the player's language. */
  effect: string;
  flavor: string;
  effects: RelicEffects;
}

export const RELIC_CATALOG: RelicDef[] = [
  {
    key: "blood_in_the_water",
    rarity: "uncommon",
    family: "ember",
    title: "BLOOD IN THE WATER",
    effect: "Your team fights the first skirmish of every match at +8.",
    flavor: "He speaks only in highlights.",
    effects: { earlyFightBonus: 8 },
  },
  {
    key: "home_crowd",
    rarity: "uncommon",
    family: "gold",
    title: "HOME CROWD",
    effect: "Win 3+ lanes and your endgame snowball is half again as heavy.",
    flavor: "The crowd knew before the cast did.",
    effects: { snowballMult: 1.5 },
  },
  {
    key: "smite_tax",
    rarity: "uncommon",
    family: "void",
    title: "SMITE TAX",
    effect: "Every objective is contested at +9. It was never their Baron.",
    flavor: "It was never their Baron.",
    effects: { objectivesFlat: 9 },
  },
  {
    key: "lane_kingdom",
    rarity: "uncommon",
    family: "ice",
    title: "LANE KINGDOM",
    effect: "The lane phase moves half again as much momentum — both ways.",
    flavor: "Fifteen minutes of farm decides the next fifteen.",
    effects: { laneMomentumMult: 1.5 },
  },
  {
    key: "fresh_legs",
    rarity: "common",
    family: "gold",
    title: "TRAINING ARC",
    effect: "This week's prints carry double Fresh Legs.",
    flavor: "They practiced. It shows.",
    effects: { freshLegsExtra: 3 },
  },
  {
    key: "showcase",
    rarity: "common",
    family: "gold",
    title: "THE SHOWCASE",
    effect: "Every foil or signed card you field pays +15 score per round. Style, never power.",
    flavor: "Shine is a stat now. (It is not.)",
    effects: { styleScorePerShiny: 15 },
  },
  {
    key: "sixth_man",
    rarity: "rare",
    family: "ice",
    title: "THE SIXTH MAN",
    effect: "Once this run, swap one fielded card for any card on your shelf between rounds.",
    flavor: "The bench was never cold.",
    effects: { benchSwap: true },
  },
  {
    key: "cold_blood",
    rarity: "common",
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
    rarity: "common",
    family: "ember",
    title: "OVERTIME",
    effect: "Both fights at +6 — but every lane at −2. You skipped scrims for this.",
    flavor: "Practice is for teams that lose.",
    effects: { fightFlat: 6, lanesFlat: -2 },
  },
  {
    key: "glass_cannon",
    rarity: "uncommon",
    family: "ember",
    title: "GLASS CANNON",
    effect: "Fights at +8; the base hold at −6. Nobody's home.",
    flavor: "The best defense is their fountain.",
    effects: { fightFlat: 8, holdFlat: -6 },
  },
  {
    key: "shot_caller",
    rarity: "uncommon",
    family: "gold",
    title: "THE SHOT CALLER",
    effect: "Every crossroads check at +8. The call was right before the fight started.",
    flavor: "Mid says go. You go.",
    effects: { crossroadsBonus: 8 },
  },
  {
    key: "deep_wards",
    rarity: "uncommon",
    family: "void",
    title: "DEEP WARDS",
    effect: "The base hold at +8 and objectives at +4 — you see everything coming.",
    flavor: "They walked past three of them.",
    effects: { holdFlat: 8, objectivesFlat: 4 },
  },
  {
    key: "pit_boss",
    rarity: "common",
    family: "void",
    title: "PIT BOSS",
    effect: "Objectives at +6 and crossroads checks at +4 — the pit belongs to you.",
    flavor: "House rules.",
    effects: { objectivesFlat: 6, crossroadsBonus: 4 },
  },
  {
    key: "late_bloomer",
    rarity: "common",
    family: "ice",
    title: "LATE BLOOMER",
    effect: "Lanes at −3; fights at +4 and the hold at +6. The game you want starts at 20 minutes.",
    flavor: "Ask again after three items.",
    effects: { lanesFlat: -3, fightFlat: 4, holdFlat: 6 },
  },
  {
    key: "the_promoter",
    rarity: "common",
    family: "gold",
    title: "THE PROMOTER",
    effect: "Every cleared round pays +60 extra score. Winning sells tickets.",
    flavor: "The gate splits after the show.",
    effects: { scoreFlat: 60 },
  },

  // ── Commons: one dial, no strings. The bread of the catalog.
  {
    key: "first_blood",
    rarity: "common",
    family: "ember",
    title: "FIRST BLOOD",
    effect: "The opening skirmish at +6. Set the tone or don't bother.",
    flavor: "Three minutes in and the map already knows.",
    effects: { earlyFightBonus: 6 },
  },
  {
    key: "ward_line",
    rarity: "common",
    family: "void",
    title: "THE WARD LINE",
    effect: "The base hold at +7. They will not walk in unannounced.",
    flavor: "Every bush, every game, without being asked.",
    effects: { holdFlat: 7 },
  },
  {
    key: "lane_discipline",
    rarity: "common",
    family: "ice",
    title: "LANE DISCIPLINE",
    effect: "Every lane at +4. Nothing flashy; just fifteen clean minutes.",
    flavor: "Wave management is a personality.",
    effects: { lanesFlat: 4 },
  },
  {
    key: "bounty_board",
    rarity: "common",
    family: "gold",
    title: "THE BOUNTY BOARD",
    effect: "Every beat you win pays 20% more gold.",
    flavor: "Somebody put a price on all of them.",
    effects: { goldMult: 1.2 },
  },
  {
    key: "pit_timer",
    rarity: "common",
    family: "void",
    title: "PIT TIMER",
    effect: "Your team burns the Baron down 25% faster.",
    flavor: "Counted from the moment it spawned.",
    effects: { baronBurnMult: 1.25 },
  },

  // ── Uncommons: a real dial and a real price.
  {
    key: "all_in",
    rarity: "uncommon",
    family: "ember",
    title: "ALL IN",
    effect: "Fights at +10 and the base hold at −9. There is no plan B.",
    flavor: "Backdoor? We don't have a back door.",
    effects: { fightFlat: 10, holdFlat: -9 },
  },
  {
    key: "the_playbook",
    rarity: "uncommon",
    family: "gold",
    title: "THE PLAYBOOK",
    effect: "Crossroads checks at +5, and a landed call pays 30% more score.",
    flavor: "Page nine has been circled since Tuesday.",
    effects: { crossroadsBonus: 5, daringMult: 1.3 },
  },
  {
    key: "deep_pockets",
    rarity: "uncommon",
    family: "gold",
    title: "DEEP POCKETS",
    effect: "Your gold lead counts 60% harder in every late check.",
    flavor: "Items are just numbers you bought.",
    effects: { goldEdgeMult: 1.6 },
  },
  {
    key: "counter_pick",
    rarity: "uncommon",
    family: "ice",
    title: "THE COUNTER-PICK",
    effect: "The draft read swings double — both ways. Know the matchup.",
    flavor: "They showed their hand on the second rotation.",
    effects: { draftMult: 2 },
  },
  {
    key: "smoke_start",
    rarity: "uncommon",
    family: "void",
    title: "SMOKE START",
    effect: "Seven more seconds alone in the pit before anyone finds you.",
    flavor: "Nobody saw five people leave.",
    effects: { baronWindowFlat: 7 },
  },
  {
    key: "comeback_kid",
    rarity: "uncommon",
    family: "ember",
    title: "COMEBACK KID",
    effect: "+9 on every check while you're behind. Dead last is a starting position.",
    flavor: "Down twelve and grinning about it.",
    effects: { comebackFlat: 9 },
  },
  {
    key: "the_analyst",
    rarity: "uncommon",
    family: "ice",
    title: "THE ANALYST",
    effect: "Your comp's commitment is worth 60% more. Useless on a scattered five.",
    flavor: "He drew the same arrow eleven times.",
    effects: { commitmentMult: 1.6 },
  },

  // ── Rares: they define a run, and they ask for something back.
  {
    key: "blood_pact",
    rarity: "rare",
    family: "ember",
    title: "BLOOD PACT",
    effect: "Fights at +11, objectives at −5. The map is a rumour; the fight is real.",
    flavor: "Nobody signed it. Everybody meant it.",
    effects: { fightFlat: 11, objectivesFlat: -5 },
  },
  {
    key: "the_architect",
    rarity: "rare",
    family: "void",
    title: "THE ARCHITECT",
    effect: "Objectives at +8 and the hold at +9 — but fights at −5. Win it on the map.",
    flavor: "The game was drawn before it was played.",
    effects: { objectivesFlat: 8, holdFlat: 9, fightFlat: -5 },
  },
  {
    key: "high_roller",
    rarity: "rare",
    family: "gold",
    title: "HIGH ROLLER",
    effect: "Landed calls pay 2.2× score — and your lanes run at −3 while you scheme.",
    flavor: "The safe play has never once been described as fun.",
    effects: { daringMult: 2.2, lanesFlat: -3 },
  },
  {
    key: "the_dynasty",
    rarity: "rare",
    family: "ice",
    title: "THE DYNASTY",
    effect: "Your lineup's chemistry counts 2.5× over. Worth nothing without teammates fielded.",
    flavor: "Four years, same five, same jokes.",
    effects: { chemistryMult: 2.5 },
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
    if (fx.scoreFlat) total.scoreFlat = (total.scoreFlat ?? 0) + fx.scoreFlat;
    if (fx.baronWindowFlat) total.baronWindowFlat = (total.baronWindowFlat ?? 0) + fx.baronWindowFlat;
    if (fx.comebackFlat) total.comebackFlat = (total.comebackFlat ?? 0) + fx.comebackFlat;
    if (fx.goldMult) total.goldMult = (total.goldMult ?? 1) * fx.goldMult;
    if (fx.goldEdgeMult) total.goldEdgeMult = (total.goldEdgeMult ?? 1) * fx.goldEdgeMult;
    if (fx.daringMult) total.daringMult = (total.daringMult ?? 1) * fx.daringMult;
    if (fx.baronBurnMult) total.baronBurnMult = (total.baronBurnMult ?? 1) * fx.baronBurnMult;
    if (fx.commitmentMult) total.commitmentMult = (total.commitmentMult ?? 1) * fx.commitmentMult;
    if (fx.chemistryMult) total.chemistryMult = (total.chemistryMult ?? 1) * fx.chemistryMult;
    if (fx.draftMult) total.draftMult = (total.draftMult ?? 1) * fx.draftMult;
    if (fx.benchSwap) total.benchSwap = true;
  }
  return total;
}

/** Base draw weights per rarity — Slay the Spire's 50/33/17, which is
 *  the ratio that makes a rare feel like a find rather than a Tuesday. */
const RARITY_WEIGHT: Record<RelicRarity, number> = { common: 50, uncommon: 33, rare: 17 };

/** How the odds move as a run gets deep: rares get likelier the further
 *  you've earned your way, because a round-7 offer should be able to
 *  change the ending. */
export function rarityWeights(round: number): Record<RelicRarity, number> {
  const shift = Math.min(18, Math.max(0, round - 1) * 2.5);
  return {
    common: RARITY_WEIGHT.common - shift,
    uncommon: RARITY_WEIGHT.uncommon,
    rare: RARITY_WEIGHT.rare + shift,
  };
}

/** The three relics offered after a cleared round — a seeded, rarity-
 *  weighted draw of the catalog minus what's already held. Fewer than
 *  three remain only late in a run stacked with relics; the offer just
 *  shrinks. */
export function offerRelics(heldKeys: string[], rand: () => number, round = 1): RelicDef[] {
  const pool = RELIC_CATALOG.filter((relic) => !heldKeys.includes(relic.key));
  const weights = rarityWeights(round);
  const offer: RelicDef[] = [];
  while (offer.length < 3 && pool.length > 0) {
    const total = pool.reduce((sum, relic) => sum + weights[relic.rarity], 0);
    let ticket = rand() * total;
    let index = pool.length - 1;
    for (let i = 0; i < pool.length; i += 1) {
      ticket -= weights[pool[i].rarity];
      if (ticket <= 0) {
        index = i;
        break;
      }
    }
    offer.push(pool.splice(index, 1)[0]);
  }
  return offer;
}
