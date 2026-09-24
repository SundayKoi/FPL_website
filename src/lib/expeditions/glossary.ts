// The expedition board's words, explained where they are used.
//
// Every game word the board prints is either said in plain words first or
// wrapped in a <Term> (src/components/cards/expeditions/Term.tsx) that
// opens one of these definitions. Pure: no React, no clock, so the page,
// the tests and the preview all read the same sentences, and every number
// is imported from the module that enforces it.
//
// Each definition is at most two sentences. The rules tab (ExpeditionRules)
// holds the long form; a definition's job is to let a first-time reader
// make the decision in front of them without going there.

import { fmtPoints } from "@/lib/betting/format";
import {
  BRIEF_BONUS,
  EXPEDITION_TIERS,
  INSURANCE_FEE,
  INSURANCE_PER_WEEK,
  PATRON_INSURANCE_PER_WEEK,
  SURGE_BONUS,
} from "./config";
import { REVEAL_FRAGMENTS } from "./reveal";
import { TRAIL_TITLES } from "./trail";

export type GlossaryKey =
  | "power"
  | "shine"
  | "fork"
  | "camp"
  | "push"
  | "roleCall"
  | "edge"
  | "toll"
  | "mark"
  | "mutation"
  | "fragment"
  | "insurance"
  | "convoy"
  | "campaign"
  | "weather"
  | "brief"
  | "matchDay"
  | "miles"
  | "standings";

export interface GlossaryEntry {
  /** The plain word the board prints on the Term's button. */
  label: string;
  /** One or two sentences, plain words first. */
  says: string;
  /** How the word is spotted in running text — the board test uses it to
   *  prove no game word above the fold goes unexplained. */
  match: RegExp;
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

const [trailworn, veteran, wayfarer] = TRAIL_TITLES;

export const GLOSSARY: Record<GlossaryKey, GlossaryEntry> = {
  power: {
    label: "power",
    says: "Power is what a card brings to a squad; the rules call it shine. A higher tier, a foil and a signature all add power, and each run asks for a total.",
    match: /\bpower\b/i,
  },
  shine: {
    label: "shine",
    says: "Shine is the rules' word for a card's power. A higher tier, a foil and a signature all add to it, and each run asks for a total.",
    match: /\bshine\b/i,
  },
  fork: {
    label: "fork",
    says: "A fork is a stop on the road where the squad asks you what to do. Answer before it closes; if you don't, they play it safe.",
    match: /\bforks?\b/i,
  },
  camp: {
    label: "play it safe",
    says: "Playing it safe (camping) keeps what the squad has found. A few places still carry a small risk, and the choice prints it.",
    match: /\bcamp(s|ing|ed)?\b/i,
  },
  push: {
    label: "go for it",
    says: "Going for it (pushing) adds loot but risks the squad; every choice prints its odds. Signed cards, foils and roles unlock gentler ways to push.",
    match: /\bpush(es|ing|ed)?\b/i,
  },
  roleCall: {
    label: "role call",
    says: "A role call is a choice a card's role unlocks, once a run: a Top holds, a Jungle scouts, a Mid roams, a Bot kites, a Support wards. Each button says what it does.",
    match: /\brole calls?\b/i,
  },
  edge: {
    label: "edge",
    says: "An edge is what a card's title does on the road, like softening harm or paying more at camp. Only one edge of each kind counts in a squad, so three different kinds is best.",
    match: /\bedges?\b/i,
  },
  toll: {
    label: "toll",
    says: "A toll is a guarded gate: camping there can cost a share of the loot. Harvest weeks waive tolls and the Watch doubles them.",
    match: /\btolls?\b/i,
  },
  mark: {
    label: "mark",
    says: "A mark (Trail, Sigil or Legend) is a badge a card can bring home and keep for good. It changes nothing on the road, except that a Legend mark opens the Mythic route.",
    match: /\bmarks?\b/i,
  },
  mutation: {
    label: "changed for good",
    says: "Some places change a card for good: Irradiated, Hardened, Haunted, Cursed, Voidtouched or Voidborn. Each one has an upside or a cost, listed in the rules.",
    match: /\bmutat(ion|ions|ed)\b/i,
  },
  fragment: {
    label: "map fragments",
    says: `Map fragments come home from Legend Hunts and Deep Raid jackpots. ${EXPEDITION_TIERS.legendary.fragments} of them open the Legendary route, and ${REVEAL_FRAGMENTS === 1 ? "one" : REVEAL_FRAGMENTS} shows a squad on the road every checkpoint it has left.`,
    match: /\bfragments?\b/i,
  },
  insurance: {
    label: "insurance",
    says: `Insurance (${fmtPoints(INSURANCE_FEE)} at launch) makes the worst case one step softer: lost becomes wounded and dead becomes lost. ${INSURANCE_PER_WEEK} a week, ${PATRON_INSURANCE_PER_WEEK} for patrons.`,
    match: /\binsur(e|ed|ance)\b/i,
  },
  convoy: {
    label: "ride with a friend",
    says: "In a convoy two collectors' squads share one clock and one set of forks. A fork pushes only if you both push.",
    match: /\bconvoys?\b/i,
  },
  campaign: {
    label: "campaign",
    says: "A campaign is three runs that tell one story; each stage's luck sets the next stage's road. Finish it and the finale prints a relic of a survivor.",
    match: /\bcampaigns?\b/i,
  },
  weather: {
    label: "weather",
    says: "Every week has weather (Clear, Fog, Drought, Harvest or the Watch) and it changes the road. A run keeps the weather it launched under.",
    match: /\b(fog|drought|harvest|the watch)\b/i,
  },
  brief: {
    label: "today's brief",
    says: `The brief names a role each day: send a card of that role and the run pays ${pct(BRIEF_BONUS)} more. It is scored on the day you launch.`,
    match: /\bbrief\b/i,
  },
  matchDay: {
    label: "match day",
    says: `When a card's team plays today, a squad carrying that card brings home ${pct(SURGE_BONUS)} more.`,
    match: /\bmatch day\b/i,
  },
  miles: {
    label: "miles",
    says: `Every trip home adds miles to a card: ${trailworn.miles} makes it ${trailworn.label}, ${veteran.miles} a ${veteran.label}, ${wayfarer.miles} a ${wayfarer.label}. A title makes its role call stronger.`,
    match: /\bmiles?\b/i,
  },
  standings: {
    label: "standings",
    says: "The season's table: miles walked, loot brought home, clean homecomings and rivals beaten. At season close the leaders are marked Pathfinder, Plunderer and Survivor.",
    match: /\bstandings\b/i,
  },
};

export const GLOSSARY_KEYS = Object.keys(GLOSSARY) as GlossaryKey[];

/** Every glossary word a piece of text uses. */
export function glossaryHits(text: string): GlossaryKey[] {
  return GLOSSARY_KEYS.filter((key) => GLOSSARY[key].match.test(text));
}
