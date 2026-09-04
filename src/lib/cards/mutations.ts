// Mutations — what an expedition can do to a card that comes home.
//
// Minted by resolve_expedition (src/lib/expeditions/routes.ts rolls them)
// and stamped into the copy's card json as `mutation: {key, date, run}`.
// The point of a mutation is that it makes one specific copy different
// from every other copy of the same player: it changes how the card looks,
// permanently, and it reaches into Fantasy, the Gauntlet and the market so
// the difference is worth something. One per copy. Never on an Eclipse, a
// moment, a champion or a team plate (they never board a route that mints
// one). An Exorcism removes Haunted or Cursed; nothing removes the rest.
//
// Each entry names a CSS utility in globals.css (the look), and says in
// words what the mutation does in each game. The numbers those sentences
// quote are MUTATION_EFFECTS below, which the scorers read — a sentence
// and a number that disagree is worse than either alone.

export type MutationKey = "irradiated" | "hardened" | "haunted" | "cursed" | "voidtouched";

/** What each mutation DOES — the numbers the scorers read. */
export interface MutationEffects {
  /** Fantasy: the slot's points are multiplied by this. */
  fantasyMult: number;
  /** Fantasy: chance each week the card flares out and scores zero. */
  flareChance: number;
  /** Gauntlet: added to every one of the card's bars. */
  gauntletStat: number;
  /** Gauntlet: what the card hands the whole lineup, as relic effects. */
  gauntletEffects: import("@/lib/gauntlet/relics").RelicEffects;
  /** Dust: the copy's dust value is multiplied by this. */
  dustMult: number;
  /** Market: days after the stamp during which the copy cannot change hands. */
  untradeableDays: number;
  /** Auto-dust never touches it. (Every mutation, in fact — see autoDust.ts —
   *  but Voidtouched is the one the rule is FOR.) */
  autoDustImmune: boolean;
}

export const MUTATION_EFFECTS: Record<MutationKey, MutationEffects> = {
  irradiated: {
    fantasyMult: 1.1,
    flareChance: 1 / 6,
    gauntletStat: 2,
    gauntletEffects: { holdFlat: -2 },
    dustMult: 1,
    untradeableDays: 0,
    autoDustImmune: true,
  },
  hardened: {
    fantasyMult: 1,
    flareChance: 0,
    gauntletStat: 1,
    gauntletEffects: { lanesFlat: 1, holdFlat: 2 },
    dustMult: 1.25,
    untradeableDays: 0,
    autoDustImmune: true,
  },
  haunted: {
    fantasyMult: 0.85,
    flareChance: 0,
    gauntletStat: 0,
    gauntletEffects: { crossroadsBonus: 2, objectivesFlat: 1 },
    dustMult: 1,
    untradeableDays: 0,
    autoDustImmune: true,
  },
  cursed: {
    fantasyMult: 0.75,
    flareChance: 0,
    gauntletStat: -3,
    gauntletEffects: { snowballMult: 1.15 },
    dustMult: 0.5,
    untradeableDays: 7,
    autoDustImmune: true,
  },
  voidtouched: {
    fantasyMult: 1.2,
    flareChance: 0,
    gauntletStat: 4,
    gauntletEffects: { fightFlat: 2 },
    dustMult: 2,
    untradeableDays: 0,
    autoDustImmune: true,
  },
};

const pct = (n: number) => `${Math.round(Math.abs(n - 1) * 100)}%`;
const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

export interface Mutation {
  key: MutationKey;
  label: string;
  /** One line, the way a card's chip would say it. */
  tagline: string;
  /** How you get it — which fork on which run. */
  source: string;
  /** The look, in words, for anyone reading the page without hovering. */
  look: string;
  /** What it does in Fantasy. */
  fantasy: string;
  /** What it does in the Gauntlet. */
  gauntlet: string;
  /** Market and dust consequences. */
  economy: string;
  /** The accent colour the chip and the glow use. */
  accent: string;
  /** The utility that draws it, from globals.css. */
  className: string;
  /** Good, bad, or both — for the page's colour coding. */
  tone: "boon" | "bane" | "mixed";
}

export const MUTATIONS: Mutation[] = [
  {
    key: "irradiated",
    label: "Irradiated",
    tagline: "Runs hot. Sometimes too hot.",
    source: "Pushed into the Deep Raid's reactor, or down the Legend Hunt's glowing shaft.",
    look: "A sick green light from inside the frame that breathes, geiger rings pulsing off the art, fallout drifting up, and a faint trefoil burned into the corner.",
    fantasy: `Scores +${pct(MUTATION_EFFECTS.irradiated.fantasyMult)} every week, with a 1-in-${Math.round(1 / MUTATION_EFFECTS.irradiated.flareChance)} chance each week of flaring out and scoring zero. High variance under a salary cap.`,
    gauntlet: `${signed(MUTATION_EFFECTS.irradiated.gauntletStat)} on every bar. Runs too hot to hold a base: the lineup's backdoor hold is ${MUTATION_EFFECTS.irradiated.gauntletEffects.holdFlat} while it is fielded.`,
    economy: "Dust value unchanged. Never auto-dusted. Listings show the mutation, and the market decides what a hot card is worth.",
    accent: "#8cff3c",
    className: "card-mut-irradiated",
    tone: "mixed",
  },
  {
    key: "hardened",
    label: "Hardened",
    tagline: "Walked out of something that should have ended it.",
    source: "Forced the Deep Raid's brutal ridge, or crossed the Legendary route's threshold running.",
    look: "Brushed steel plating riveted over the frame, a diagonal scar across the art that catches a slow glint, corners chipped.",
    fantasy: "No change to points. The safest mutation.",
    gauntlet: `${signed(MUTATION_EFFECTS.hardened.gauntletStat)} on every bar, and it steadies the whole lineup: +${MUTATION_EFFECTS.hardened.gauntletEffects.lanesFlat} on every lane, +${MUTATION_EFFECTS.hardened.gauntletEffects.holdFlat} on the backdoor hold.`,
    economy: `Dust value +${pct(MUTATION_EFFECTS.hardened.dustMult)}. Never auto-dusted. The one a trader pays for.`,
    accent: "#c9d3dc",
    className: "card-mut-hardened",
    tone: "boon",
  },
  {
    key: "haunted",
    label: "Haunted",
    tagline: "Brought something back with it.",
    source: "Camped overnight at the Legend Hunt's wrong checkpoint.",
    look: "The art drained cold with frost creeping in at the corners, pale spirits rising through the card at their own speeds, and every few seconds a lightning flicker in which a pair of eyes shows behind the player.",
    fantasy: `Scores -${pct(MUTATION_EFFECTS.haunted.fantasyMult)}. Whatever it carries feeds on the points.`,
    gauntlet: `Counts as a free relic: whatever it carries whispers at the crossroads (+${MUTATION_EFFECTS.haunted.gauntletEffects.crossroadsBonus} on every call) and at the objectives (+${MUTATION_EFFECTS.haunted.gauntletEffects.objectivesFlat}). Good in one game and bad in the other is the point.`,
    economy: "Dust value unchanged. Never auto-dusted. An Exorcism removes it for good.",
    accent: "#a66bff",
    className: "card-mut-haunted",
    tone: "mixed",
  },
  {
    key: "cursed",
    label: "Cursed",
    tagline: "You were warned.",
    source: "Pushed a fork the squad warned against, and had it go wrong.",
    look: "Black veins crawling in from the edges, the art drained of colour, a crimson sigil ring turning slowly behind the player.",
    fantasy: `Scores -${pct(MUTATION_EFFECTS.cursed.fantasyMult)}.`,
    gauntlet: `${MUTATION_EFFECTS.cursed.gauntletStat} on every bar, but the lineup snowballs harder once it is ahead (x${MUTATION_EFFECTS.cursed.gauntletEffects.snowballMult}).`,
    economy: `Dust value halved, and untradeable for ${MUTATION_EFFECTS.cursed.untradeableDays} days after it comes home. Sent out again on a route that can lose it, it may not come back. An Exorcism removes it.`,
    accent: "#ff3d5a",
    className: "card-mut-cursed",
    tone: "bane",
  },
  {
    key: "voidtouched",
    label: "Voidtouched",
    tagline: "It went somewhere the map does not show.",
    source: "The only way home from the Legendary route. Three map fragments open it; the squad comes back with this or does not come back.",
    look: "A ragged black bleed eats in from the edges, a deep star field drifts and twinkles across the art, and a tilted rift of white light stands open beside the player, breathing but never closing.",
    fantasy: `Scores +${pct(MUTATION_EFFECTS.voidtouched.fantasyMult)}.`,
    gauntlet: `${signed(MUTATION_EFFECTS.voidtouched.gauntletStat)} on every bar, and +${MUTATION_EFFECTS.voidtouched.gauntletEffects.fightFlat} to both teamfights while it is fielded.`,
    economy: "Dust value doubled. Never auto-dusted. Announced in Discord when it comes home, like an Eclipse.",
    accent: "#e8dcff",
    className: "card-mut-voidtouched",
    tone: "boon",
  },
];

export function mutationByKey(key: string): Mutation | undefined {
  return MUTATIONS.find((mutation) => mutation.key === key);
}

/** What PlayerCard3D draws: the utility, the chip, and the Cursed sigil's
 *  second layer. */
export interface MutationOverlay {
  label: string;
  className: string;
  accent: string;
  extra?: string;
}

export function mutationOverlay(mutation: Mutation): MutationOverlay {
  return {
    label: mutation.label,
    className: mutation.className,
    accent: mutation.accent,
    ...(mutation.key === "cursed" ? { extra: "card-mut-cursed-sigil" } : {}),
  };
}

/** The run ladder the proposal adds to the three that exist. */
export interface ProposedRun {
  label: string;
  hours: number;
  forks: number;
  /** Whether a card can be lost on it. */
  risk: "none" | "wounded" | "lost" | "dead";
  what: string;
}

export const PROPOSED_RUNS: ProposedRun[] = [
  { label: "Scouting Run", hours: 8, forks: 1, risk: "none", what: "The run that exists. Dollars and a mark. The one fork is 'push or camp'; pushing risks nothing but a smaller payout." },
  { label: "Deep Raid", hours: 24, forks: 2, risk: "wounded", what: "Two forks. The reactor fork can irradiate a card; the brutal fork can harden one or send it home wounded (benched three days)." },
  { label: "Legend Hunt", hours: 48, forks: 3, risk: "lost", what: "Three forks. Camping at the wrong one haunts a card. A card can be lost here and rescued within a week, or ransomed." },
  { label: "Rescue", hours: 12, forks: 1, risk: "wounded", what: "New. Send a squad after a lost card. Succeeds on shine; fails and the rescuers come home wounded. The only run that can bring a card back." },
  { label: "Exorcism", hours: 8, forks: 0, risk: "none", what: "New. A Scouting Run with a fee that removes Haunted or Cursed from one card. No loot. The way out of a bad mutation." },
  { label: "Legendary route", hours: 72, forks: 4, risk: "dead", what: "New. Opened by three map fragments. Every fork is dangerous, a card can die for good, and the survivors come home Voidtouched." },
];
