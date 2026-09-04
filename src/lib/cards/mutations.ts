// Mutations — what an expedition can do to a card that comes home.
//
// A PROPOSAL, previewed on /admin/mutations and minted by nothing. The
// point of a mutation is that it makes one specific copy different from
// every other copy of the same player: it changes how the card looks,
// permanently, and it reaches into Fantasy and the Gauntlet so the
// difference is worth something. One per copy. Never on an Eclipse, a
// moment, a champion or a team plate.
//
// Each entry names a CSS utility in globals.css (the look), and says in
// words what the mutation would do in each game. The numbers are the
// proposal's opening bid, not tuning.

export type MutationKey = "irradiated" | "hardened" | "haunted" | "cursed" | "voidtouched";

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
    source: "Came back from a Deep Raid's reactor fork, or any run where the squad pushed through the glow.",
    look: "A sick green light from inside the frame that breathes, geiger rings pulsing off the art, fallout drifting up, and a faint trefoil burned into the corner.",
    fantasy: "Scores +10% every week, with a 1-in-6 chance each week of flaring out and scoring zero. High variance under a salary cap.",
    gauntlet: "Deals splash damage to the enemy beside its target. Takes 1 extra damage from everything.",
    economy: "Dust value unchanged. Listings show the mutation, and the market decides what a hot card is worth.",
    accent: "#8cff3c",
    className: "card-mut-irradiated",
    tone: "mixed",
  },
  {
    key: "hardened",
    label: "Hardened",
    tagline: "Walked out of something that should have ended it.",
    source: "Survived the brutal fork on a Deep Raid or Legend Hunt with the whole squad intact.",
    look: "Brushed steel plating riveted over the frame, a diagonal scar across the art that catches a slow glint, corners chipped.",
    fantasy: "No change to points. Cannot be benched by a bad week: its floor is 60% of its average.",
    gauntlet: "Immune to the first boss mechanic of every run and shrugs off the first hit it takes each fight.",
    economy: "Dust value +25%. The safest mutation, and the one a trader pays for.",
    accent: "#c9d3dc",
    className: "card-mut-hardened",
    tone: "boon",
  },
  {
    key: "haunted",
    label: "Haunted",
    tagline: "Brought something back with it.",
    source: "Camped overnight at the wrong checkpoint on a Legend Hunt.",
    look: "The art drained cold with frost creeping in at the corners, pale spirits rising through the card at their own speeds, and every few seconds a lightning flicker in which a pair of eyes shows behind the player.",
    fantasy: "Scores -15%. Whatever it carries feeds on the points.",
    gauntlet: "Counts as a relic slot: the thing it carries is a free relic that scales with the card's tier. Good in one game and bad in the other is the point.",
    economy: "Dust value unchanged. Can be exorcised on a Scouting Run for a fee, which removes the mutation for good.",
    accent: "#a66bff",
    className: "card-mut-haunted",
    tone: "mixed",
  },
  {
    key: "cursed",
    label: "Cursed",
    tagline: "You were warned.",
    source: "Ignored the squad's warning at a fork and pushed anyway, and the run went badly.",
    look: "Black veins crawling in from the edges, the art drained of colour, a crimson sigil ring turning slowly behind the player.",
    fantasy: "Scores -25% and cannot captain.",
    gauntlet: "Takes double damage. Deals +50% on the hit that kills it.",
    economy: "Dust value halved and untradeable for seven days after it comes home. The market treats it as damaged goods, which is a story in itself.",
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
    fantasy: "Scores +20%, and its score is doubled the week its player is Card of the Week.",
    gauntlet: "Starts every fight with a shield equal to its overall. Bosses target it first.",
    economy: "Untouchable by auto-dust. Dust value doubled. Announced in Discord when it comes home, like an Eclipse.",
    accent: "#e8dcff",
    className: "card-mut-voidtouched",
    tone: "boon",
  },
];

export function mutationByKey(key: string): Mutation | undefined {
  return MUTATIONS.find((mutation) => mutation.key === key);
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
