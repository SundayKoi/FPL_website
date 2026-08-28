// The two walls: round 4 and round 8.
//
// A boss is remembered because it tests everything you have learned at
// once — and because it does that with a RULE, not a bigger number. A
// boss that is simply +10 everywhere teaches nothing and is forgotten the
// moment it dies. So every boss here breaks one of the player's tools:
//
//   · THE GATEKEEPER takes every check you only just won.
//   · THE ARCHIVIST erases the lineup shape you drafted for.
//   · THE PIT KING takes the Baron line off the crossroads table.
//   · THE CLOSER makes the fights you lose cost double.
//   · THE UNBROKEN refuses to let you snowball at all.
//
// Every one is printed on the scouting screen BEFORE the fight, with its
// counter-play, because a rule you learn by dying to it is a stat check
// wearing a costume.
//
// Which boss stands where is a function of the WEEK, so a league argues
// about the same wall for seven days and then gets a new one.

export interface BossEffects {
  /** How far a check must fall your way to count as yours. Every margin
   *  under this goes to THEM. */
  tieBand?: number;
  /** Commitment and chemistry pay nothing — they scouted your five. */
  nullifyShape?: boolean;
  /** They hold the Baron pit whatever the scoreboard or your call says. */
  holdsPit?: boolean;
  /** Fights you LOSE swing this much harder. */
  lossSwingMult?: number;
  /** Your momentum can never climb past this — no snowball, ever. */
  momentumCeiling?: number;
}

export interface BossDef {
  key: string;
  /** The name on the scouting card. */
  title: string;
  /** The comp identity it wears, so the triangle still reads. */
  flavor: string;
  /** The rule, in one line. Printed before the fight, always. */
  rule: string;
  /** How to beat it. Also printed before the fight. */
  counter: string;
  effects: BossEffects;
}

/** The round-4 gate — the wall that decides who gets scraps. */
export const GATE_BOSSES: BossDef[] = [
  {
    key: "gatekeeper",
    title: "THE GATEKEEPER",
    flavor: "Nobody has ever talked their way past this one.",
    rule: "Any check you win by less than 2 goes to THEM instead. Close is a loss here.",
    counter: "You have been winning the near-misses all run for free. Bring a real edge to every check.",
    effects: { tieBand: 2 },
  },
  {
    key: "archivist",
    title: "THE ARCHIVIST",
    flavor: "They have watched every game you have ever played.",
    rule: "Your commitment and chemistry pay NOTHING. They scouted the five you drafted.",
    counter: "Raw bars only. The round your lineup shape can't save you is the round it can't hide you either.",
    effects: { nullifyShape: true },
  },
  {
    key: "pit_king",
    title: "THE PIT KING",
    flavor: "The Baron was theirs before either team walked out.",
    rule: "They hold the Baron pit at 25:00 no matter what the scoreboard says or what you call.",
    counter: "The Baron line is off the table — win the lanes, the fights and the hold instead.",
    effects: { holdsPit: true },
  },
];

/** The round-8 finale — the last thing between a run and a full clear. */
export const FINAL_BOSSES: BossDef[] = [
  {
    key: "closer",
    title: "THE CLOSER",
    flavor: "They do not need to win twice.",
    rule: "Every fight you LOSE swings double against you. One bad teamfight is the game.",
    counter: "Fight only where you are favoured. A protect comp that never loses a fight never loses to this.",
    effects: { lossSwingMult: 2 },
  },
  {
    key: "unbroken",
    title: "THE UNBROKEN",
    flavor: "They have never once been ahead. They have never once been behind either.",
    rule: "Your momentum can never climb past 62. There is no snowball to ride home.",
    counter: "You cannot bury them, so close it on gold and impact — the nexus reads more than momentum.",
    effects: { momentumCeiling: 62 },
  },
];

export const BOSS_BY_KEY = new Map(
  [...GATE_BOSSES, ...FINAL_BOSSES].map((boss) => [boss.key, boss]),
);

/** Which rounds carry a wall. */
export const GATE_ROUND = 4;
export const FINAL_ROUND = 8;

export function isBossRound(round: number): boolean {
  return round === GATE_ROUND || round === FINAL_ROUND;
}

/**
 * Who stands at a given round this week. Seeded by the WEEK rather than
 * the run, so everyone in the league fights the same wall for seven days
 * — which is the whole point of having something to argue about.
 */
export function bossFor(round: number, rand: () => number): BossDef | null {
  const pool = round === GATE_ROUND ? GATE_BOSSES : round === FINAL_ROUND ? FINAL_BOSSES : null;
  if (!pool) return null;
  return pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))];
}

/** Which round a wall stands at — read from the pools, not guessed from
 *  the key. */
export function bossRoundOf(key: string | null | undefined): number | null {
  if (!key) return null;
  if (GATE_BOSSES.some((boss) => boss.key === key)) return GATE_ROUND;
  if (FINAL_BOSSES.some((boss) => boss.key === key)) return FINAL_ROUND;
  return null;
}

export function bossEffects(key: string | null | undefined): BossEffects {
  return (key ? BOSS_BY_KEY.get(key)?.effects : undefined) ?? {};
}
