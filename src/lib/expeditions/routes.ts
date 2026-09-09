// The route inside a run: the forks that pause it, what each choice risks
// and earns, and what the squad looks like when it comes home.
//
// config.ts owns the money (grade, base dollars, comps, marks). This file
// owns everything the redesign added on top: the checkpoints, the choices,
// the harm ladder (wounded → lost → dead), the mutations, insurance and
// the rescue roll. Pure, like config.ts — `rand` is injected, the clock is
// passed in — so every table below is unit-testable and the server's
// CSPRNG is a drop-in.
//
// The rules, in the order a player meets them:
//   1. A run with N forks pauses N times, at evenly spaced checkpoints.
//      Each fork is open until the next checkpoint (or the end of the run).
//      Silence is a choice: an unanswered fork camps, the safe option.
//   2. Pushing adds to the loot multiplier and rolls one harm on one card.
//      Camping is safe on the ladder — except where the story says it is
//      not (the Legend Hunt's second checkpoint haunts; every Legendary
//      fork bites even a camper; a toll fork charges the careful).
//   3. A card can die only on the Legendary route and only once the squad
//      has pushed twice. Insurance turns lost into wounded and dead into
//      lost. One-of-ones never board a route that can lose them.
//   4. Mutations are one per copy and permanent. A roll that lands on an
//      already-mutated card does nothing.
//   5. The road is drawn per run (ROAD_RULES). Each checkpoint is one of
//      several places, picked from the run's own seed, so two Deep Raids
//      do not walk the same valley — and a convoy walks the host's draw,
//      because two squads on one clock must stand at one fork.
//   6. The squad's roles each have a call of their own, once a run: a Top
//      holds, a Jungle scouts, a Mid roams, a Bot kites, a Support wards.
//      A Veteran (trail.ts) makes its role's call sharper.
//   7. A run remembers itself: a toll paid at one fork buys free passage
//      at the next, and a scout at one fork means the squad knows where
//      not to camp at the next.
//   9. The week has weather (WEATHER_RULES, weather.ts): under Fog every
//      fork is dark, under a Drought the scouting gamble pays half, under
//      a Harvest the tolls are waived, under the Watch they cost double.
//      A run keeps the weather it launched under.
//   8. The road has company (COMPANY_RULES, company.ts): a rival squad is
//      another collector's run and the spot goes to the squad with more
//      shine; a road with nobody on it holds a cache where the rival
//      would have been; and a card that died on the Legendary route
//      walks the Legend and Legendary roads as a ghost — camp at the next
//      fork and the haunting is doubled, push and it is harmless, carry
//      its old team's colours and it stands aside and leaves a cache.

import type { MutationKey } from "@/lib/cards/mutations";
import { mulberry32 } from "@/lib/gauntlet/sim";
import { isVeteran, milesOf } from "./trail";
import { DROUGHT_GAMBLE, WATCH_TOLL, type WeatherKey } from "./weather";
import {
  EXPEDITION_TIERS,
  LOOT_MULT_CAP,
  WOUNDED_HOURS,
  isProtected,
  shineOf,
  type CardCopy,
  type ExpeditionTierKey,
  type OutcomeGrade,
} from "./config";

/** What a player can say at a fork. `camp` and `push` are always there;
 *  favour, light and rally are what the squad's prints unlock; the five
 *  after them are the role calls — what the squad's POSITIONS unlock. */
export type ForkChoice = "camp" | "push" | "favour" | "light" | "rally" | "hold" | "scout" | "roam" | "kite" | "ward";

export const FORK_CHOICES: ForkChoice[] = ["camp", "push", "favour", "light", "rally", "hold", "scout", "roam", "kite", "ward"];

/** The rulebook version from which a run walks a drawn road, meets the
 *  wider trail and can make a role call. queries.ts's TRAIL_RULES (2) is
 *  the version before it; a run stamped below this walks the fixed forks
 *  in FORKS and knows five words at a checkpoint. Lives here, not in
 *  queries.ts, because the resolver is pure and queries.ts is not. */
export const ROAD_RULES = 3;

/** The rulebook version from which the road has company (company.ts):
 *  rivals are real collectors' runs decided by shine, and the graveyard's
 *  dead walk the Legend and Legendary roads. A run stamped below this
 *  keeps its coin-tossed rival and meets no ghost — its journal is half
 *  written, and a beat that changed under it would rewrite lines the
 *  page already showed. */
export const COMPANY_RULES = 4;

/** What a run needs to hand the road-drawing functions: its seed, its
 *  rulebook, and the convoy it rides in (a convoy's two runs must draw the
 *  same road, so the convoy id seeds both). */
export interface RoadRef {
  runId: number;
  rules: number;
  convoy?: number | null;
  /** How many forks the RUN has, when it differs from the tier's count
   *  (a run from before forks existed has none). */
  forks?: number;
}

export interface ForkDef {
  /** A stable name for the place — what the rival fork keys on, and what
   *  the tests name. Titles are prose and can be reworded; keys cannot. */
  key: string;
  title: string;
  story: string;
  /** The button labels — what pushing and camping mean HERE. */
  pushLabel: string;
  campLabel: string;
  /** Added to the loot multiplier when the squad pushes. */
  lootBonus: number;
  /** Rolled on one random living card when the squad pushes. Each is a
   *  chance; they resolve worst-last so a dead roll outranks a wound. */
  pushRisk: { wounded: number; lost: number; dead: number };
  /** Rolled when the squad camps. Zero everywhere the ladder is kind. */
  campRisk: { wounded: number; haunted: number };
  /** A mutation pushing can bring home, on one unmutated card. */
  pushReward: { mutation: MutationKey; chance: number } | null;
  /** The squad warns against this one. Push anyway and have it go wrong,
   *  and the harmed card comes home Cursed. */
  warned: boolean;
  /** Dark enough that a foil can light the way (halves the push risk). */
  dark: boolean;
  /** The scouting run's fork is a coin flip on the bag, not a hazard:
   *  push and it either grows or shrinks. */
  gamble: { lose: number; down: number } | null;
  /** What a push can turn up besides loot: a map fragment, a free pack.
   *  Rolled after the harm, on any kind of push. */
  pushFind?: { fragment?: number; comp?: number };
  /** A mutation CAMPING can bring home — a night held at the right spot
   *  hardens a card the way forcing a ridge does. */
  campReward?: { mutation: MutationKey; chance: number } | null;
  /** The careful way has a price here: this chance that camping costs
   *  TOLL_LOOT off the multiplier. A fork where "safe" is not "free". */
  toll?: number;
}

const NO_PUSH_RISK = { wounded: 0, lost: 0, dead: 0 };
const NO_CAMP_RISK = { wounded: 0, haunted: 0 };

/**
 * Every place a route can pause, by checkpoint. ROADS[tier][i] is the
 * pool for fork i: each entry sits in the same risk envelope as the others
 * in its slot (a Deep Raid's second fork is a coin flip on a wound
 * whichever ridge it is), so the balance holds however the road is drawn.
 * The first entry of every slot is the fork the tier had before the road
 * was drawn per run — FORKS, below, is exactly those — which is what a run
 * stamped before ROAD_RULES still walks.
 *
 * The numbers are the balance of the feature: a Deep Raid pushed twice is
 * a 40% chance of a mutation against a 30% chance of a three-day bench; a
 * Legendary route pushed at every fork is a coin flip on a funeral.
 */
export const ROADS: Record<ExpeditionTierKey, ForkDef[][]> = {
  scout: [
    [
      {
        key: "riverbed",
        title: "The dry riverbed",
        story: "The trail forks at a dry riverbed. Downstream is the road home with what you have. Upstream, the scouts think they saw a camp.",
        pushLabel: "Follow the riverbed up",
        campLabel: "Head home with the bag",
        lootBonus: 0.4,
        pushRisk: NO_PUSH_RISK,
        campRisk: NO_CAMP_RISK,
        pushReward: null,
        warned: false,
        dark: false,
        gamble: { lose: 0.45, down: 0.3 },
      },
      {
        key: "orchard",
        title: "The orchard wall",
        story: "A wall with fruit trees on the far side and a gap the scouts could fit through. The farmer is either away or asleep, and nobody can say which.",
        pushLabel: "Go over the wall",
        campLabel: "Keep to the road",
        lootBonus: 0.35,
        pushRisk: NO_PUSH_RISK,
        campRisk: NO_CAMP_RISK,
        pushReward: null,
        warned: false,
        dark: false,
        gamble: { lose: 0.4, down: 0.25 },
      },
      {
        key: "ferry",
        title: "The ferry",
        story: "A ferry with nobody at the rope. Across the water there is a village that might pay for news; behind the squad, the road home.",
        pushLabel: "Pull yourselves across",
        campLabel: "Walk the bank home",
        lootBonus: 0.5,
        pushRisk: NO_PUSH_RISK,
        campRisk: NO_CAMP_RISK,
        pushReward: null,
        warned: false,
        dark: false,
        gamble: { lose: 0.5, down: 0.3 },
      },
      {
        key: "fair",
        title: "The fair",
        story: "A travelling fair on the common, half packed up. Somebody is still running a game of chance at the last stall, and they are smiling.",
        pushLabel: "Play the last stall",
        campLabel: "Buy a pie and go",
        lootBonus: 0.4,
        pushRisk: NO_PUSH_RISK,
        campRisk: NO_CAMP_RISK,
        pushReward: null,
        warned: false,
        dark: false,
        gamble: { lose: 0.45, down: 0.3 },
      },
    ],
  ],
  gilded: [
    [
      {
        key: "toll",
        title: "The toll bridge",
        story: "A bridge with a keeper who wants paying in stories, not coin. The squad can cross by the toll or wade the ford beneath it, where the footing is bad and the water runs gold.",
        pushLabel: "Wade the ford",
        campLabel: "Pay the toll and cross",
        lootBonus: 0.3,
        pushRisk: { wounded: 0.1, lost: 0, dead: 0 },
        campRisk: NO_CAMP_RISK,
        pushReward: { mutation: "hardened", chance: 0.15 },
        warned: false,
        dark: false,
        gamble: null,
        // The keeper's price. Paid here, it is good for the moneylender's
        // stair at the next fork (rule 7) — the one road where the memory
        // of a toll can be spent.
        toll: 0.3,
      },
      {
        key: "gate",
        title: "The gilded gate",
        story: "A gate of real gold, shut, and a gatehouse that will open it for a story. Or the wall can be climbed, and the spikes along the top are gold too.",
        pushLabel: "Climb the wall",
        campLabel: "Talk the gate open",
        lootBonus: 0.3,
        pushRisk: { wounded: 0.1, lost: 0, dead: 0 },
        campRisk: NO_CAMP_RISK,
        pushReward: { mutation: "hardened", chance: 0.15 },
        warned: false,
        dark: false,
        gamble: null,
      },
      {
        key: "ledgers",
        title: "The counting house",
        story: "A counting house with the ledgers open and the clerk asleep on them. Everything in the back room is owed to somebody, and the door to it is ajar.",
        pushLabel: "Read the ledgers",
        campLabel: "Let the clerk sleep",
        lootBonus: 0.35,
        pushRisk: { wounded: 0.1, lost: 0, dead: 0 },
        campRisk: NO_CAMP_RISK,
        pushReward: null,
        warned: false,
        dark: false,
        gamble: null,
        pushFind: { comp: 0.2 },
      },
    ],
    [
      {
        key: "lanterns",
        title: "The lantern market",
        story: "A night market under paper lanterns, and the stalls at the dark end sell what the bright end will not. The squad can browse the dark end or buy what is lit and go.",
        pushLabel: "Browse the dark end",
        campLabel: "Buy what is lit and go",
        lootBonus: 0.35,
        pushRisk: { wounded: 0.15, lost: 0, dead: 0 },
        campRisk: NO_CAMP_RISK,
        pushReward: null,
        warned: false,
        dark: true,
        gamble: null,
      },
      {
        key: "ball",
        title: "The masked ball",
        story: "An invitation nobody sent, to a ball where every guest is masked and the dancing is in the dark rooms. The bright hall has wine and music and nothing worth taking.",
        pushLabel: "Go through to the dark rooms",
        campLabel: "Stay in the bright hall",
        lootBonus: 0.35,
        pushRisk: { wounded: 0.15, lost: 0, dead: 0 },
        campRisk: NO_CAMP_RISK,
        pushReward: null,
        warned: false,
        dark: true,
        gamble: null,
        pushFind: { comp: 0.15 },
      },
      {
        key: "stair",
        title: "The moneylender's stair",
        story: "A stair down under a moneylender's, lit by one candle. Somebody is owed a fortune down there. Settling up at the counter instead is possible, and it is not free.",
        pushLabel: "Go down the stair",
        campLabel: "Settle up at the counter",
        lootBonus: 0.4,
        pushRisk: { wounded: 0.2, lost: 0, dead: 0 },
        campRisk: NO_CAMP_RISK,
        pushReward: null,
        warned: false,
        dark: true,
        gamble: null,
        toll: 0.3,
      },
    ],
  ],
  raid: [
    [
      {
        key: "reactor",
        title: "The reactor",
        story: "A cooling tower leans over the valley and something inside it is still humming. The salvage in there is worth a fortune and glows faintly.",
        pushLabel: "Go into the reactor",
        campLabel: "Skirt the valley",
        lootBonus: 0.25,
        pushRisk: { wounded: 0.15, lost: 0, dead: 0 },
        campRisk: NO_CAMP_RISK,
        pushReward: { mutation: "irradiated", chance: 0.2 },
        warned: false,
        dark: false,
        gamble: null,
      },
      {
        key: "waterworks",
        title: "The flooded works",
        story: "The waterworks under the valley are half drowned and still running. The pumps glow faintly through the water, and so does whatever is on the shelves.",
        pushLabel: "Wade the works",
        campLabel: "Follow the pipe overland",
        lootBonus: 0.25,
        pushRisk: { wounded: 0.15, lost: 0, dead: 0 },
        campRisk: NO_CAMP_RISK,
        pushReward: { mutation: "irradiated", chance: 0.2 },
        warned: false,
        dark: false,
        gamble: null,
      },
      {
        key: "mast",
        title: "The signal mast",
        story: "A mast on the hill, still broadcasting to nobody. There is a locked hut at its foot and the salvage in it never left.",
        pushLabel: "Climb to the hut",
        campLabel: "Take the road below the hill",
        lootBonus: 0.3,
        pushRisk: { wounded: 0.2, lost: 0, dead: 0 },
        campRisk: NO_CAMP_RISK,
        pushReward: { mutation: "hardened", chance: 0.1 },
        warned: false,
        dark: false,
        gamble: null,
        pushFind: { fragment: 0.1 },
      },
    ],
    [
      {
        key: "ridge",
        title: "The brutal fork",
        story: "The ridge road is held. The squad can force it, and the ones who force it come back harder, or they come back carried.",
        pushLabel: "Force the ridge",
        campLabel: "Take the long way round",
        lootBonus: 0.25,
        pushRisk: { wounded: 0.3, lost: 0, dead: 0 },
        campRisk: NO_CAMP_RISK,
        pushReward: { mutation: "hardened", chance: 0.2 },
        warned: false,
        dark: true,
        gamble: null,
      },
      {
        key: "barricade",
        title: "The barricade",
        story: "A barricade across the only road, and the people behind it want a share of everything the squad is carrying. It could be run, in the dark.",
        pushLabel: "Run the barricade",
        campLabel: "Give up a share and pass",
        lootBonus: 0.3,
        pushRisk: { wounded: 0.3, lost: 0, dead: 0 },
        campRisk: NO_CAMP_RISK,
        pushReward: { mutation: "hardened", chance: 0.2 },
        warned: false,
        dark: true,
        gamble: null,
        toll: 0.5,
      },
      {
        key: "pits",
        title: "The dog pits",
        story: "The pits are quiet at this hour and the handlers are counting money in the back. What they are guarding is in the far kennel.",
        pushLabel: "Cross the pits",
        campLabel: "Circle wide of them",
        lootBonus: 0.25,
        pushRisk: { wounded: 0.3, lost: 0, dead: 0 },
        campRisk: NO_CAMP_RISK,
        pushReward: { mutation: "hardened", chance: 0.15 },
        warned: false,
        dark: true,
        gamble: null,
      },
    ],
  ],
  legend: [
    [
      {
        key: "shaft",
        title: "The glowing shaft",
        story: "An old mine shaft breathes warm green air. The map says the seam runs deep.",
        pushLabel: "Descend the shaft",
        campLabel: "Stay on the surface",
        lootBonus: 0.3,
        pushRisk: { wounded: 0.2, lost: 0, dead: 0 },
        campRisk: NO_CAMP_RISK,
        pushReward: { mutation: "irradiated", chance: 0.15 },
        warned: false,
        dark: true,
        gamble: null,
      },
      {
        key: "chapel",
        title: "The drowned chapel",
        story: "A chapel below the waterline, the windows still whole and something lit inside. The map's seam runs under it.",
        pushLabel: "Dive for the door",
        campLabel: "Stay on the bank",
        lootBonus: 0.3,
        pushRisk: { wounded: 0.2, lost: 0, dead: 0 },
        campRisk: NO_CAMP_RISK,
        pushReward: { mutation: "irradiated", chance: 0.15 },
        warned: false,
        dark: true,
        gamble: null,
      },
      {
        key: "furnaces",
        title: "The furnace hall",
        story: "A hall of cold furnaces, and one of them is not cold. The heat is coming from somewhere below it.",
        pushLabel: "Go down past the live one",
        campLabel: "Keep to the cold side",
        lootBonus: 0.3,
        pushRisk: { wounded: 0.2, lost: 0, dead: 0 },
        campRisk: NO_CAMP_RISK,
        pushReward: { mutation: "hardened", chance: 0.15 },
        warned: false,
        dark: true,
        gamble: null,
      },
    ],
    [
      {
        key: "checkpoint",
        title: "The wrong checkpoint",
        story: "Night falls at a checkpoint nobody built. Push on through the dark, or camp here — the squad says the place feels watched.",
        pushLabel: "March through the night",
        campLabel: "Camp at the checkpoint",
        lootBonus: 0.3,
        pushRisk: { wounded: 0.25, lost: 0, dead: 0 },
        campRisk: { wounded: 0, haunted: 0.15 },
        pushReward: null,
        warned: false,
        dark: true,
        gamble: null,
      },
      {
        key: "village",
        title: "The empty village",
        story: "A village with the doors open and the fires lit and nobody in it. Push on, or sleep in a bed for once. The squad says the beds are warm.",
        pushLabel: "March past it",
        campLabel: "Sleep in the village",
        lootBonus: 0.3,
        pushRisk: { wounded: 0.25, lost: 0, dead: 0 },
        campRisk: { wounded: 0, haunted: 0.15 },
        pushReward: null,
        warned: false,
        dark: true,
        gamble: null,
      },
      {
        key: "belltower",
        title: "The bell tower",
        story: "A bell tower ringing the hour when nobody is pulling the rope. The road on runs under it; the squad could wait the night out at its foot.",
        pushLabel: "Go on under the bell",
        campLabel: "Wait out the night here",
        lootBonus: 0.3,
        pushRisk: { wounded: 0.25, lost: 0, dead: 0 },
        campRisk: { wounded: 0, haunted: 0.2 },
        pushReward: null,
        warned: false,
        dark: true,
        gamble: null,
        campReward: { mutation: "hardened", chance: 0.1 },
      },
    ],
    [
      {
        key: "vault",
        title: "The vault door",
        story: "The legend's vault, and the squad's every instinct says walk away. Whatever is behind it is worth the run twice over.",
        pushLabel: "Open the vault",
        campLabel: "Walk away with the haul",
        lootBonus: 0.4,
        pushRisk: { wounded: 0.3, lost: 0.15, dead: 0 },
        campRisk: NO_CAMP_RISK,
        pushReward: null,
        warned: true,
        dark: false,
        gamble: null,
      },
      {
        key: "throne",
        title: "The throne room",
        story: "A throne room with the throne still warm. The legend's whole hoard is stacked behind it, and the squad is whispering that they should not be here.",
        pushLabel: "Take the hoard",
        campLabel: "Back out quietly",
        lootBonus: 0.4,
        pushRisk: { wounded: 0.3, lost: 0.15, dead: 0 },
        campRisk: NO_CAMP_RISK,
        pushReward: null,
        warned: true,
        dark: false,
        gamble: null,
        pushFind: { fragment: 0.25 },
      },
      {
        key: "sleeper",
        title: "The sleeper",
        story: "Something enormous asleep across the last passage, and the only way past is over it. Every instinct in the squad says turn around.",
        pushLabel: "Climb over it",
        campLabel: "Turn around with what you have",
        lootBonus: 0.4,
        pushRisk: { wounded: 0.3, lost: 0.15, dead: 0 },
        campRisk: NO_CAMP_RISK,
        pushReward: null,
        warned: true,
        dark: false,
        gamble: null,
        pushFind: { comp: 0.2 },
      },
    ],
  ],
  rescue: [
    [
      {
        key: "camp",
        title: "The holding camp",
        story: "The lost card is in there. Go in loud and fast, or wait for dark and slip in.",
        pushLabel: "Go in loud",
        campLabel: "Wait for dark",
        lootBonus: 0,
        pushRisk: { wounded: 0.35, lost: 0, dead: 0 },
        campRisk: { wounded: 0.15, haunted: 0 },
        pushReward: null,
        warned: false,
        dark: true,
        gamble: null,
      },
      {
        key: "crossing",
        title: "The river crossing",
        story: "They are moving the lost card downriver at first light. Rush the boats now, or wait on the far bank and take them at the crossing.",
        pushLabel: "Rush the boats",
        campLabel: "Wait at the crossing",
        lootBonus: 0,
        pushRisk: { wounded: 0.3, lost: 0, dead: 0 },
        campRisk: { wounded: 0.15, haunted: 0 },
        pushReward: null,
        warned: false,
        dark: true,
        gamble: null,
      },
      {
        key: "auction",
        title: "The auction",
        story: "The lost card is up for sale tonight, in a barn with one door. Kick it in, or bid with what the squad is carrying and walk out.",
        pushLabel: "Kick the door in",
        campLabel: "Bid and walk out",
        lootBonus: 0,
        pushRisk: { wounded: 0.35, lost: 0, dead: 0 },
        campRisk: { wounded: 0.1, haunted: 0 },
        pushReward: null,
        warned: false,
        dark: true,
        gamble: null,
        toll: 0.5,
      },
    ],
  ],
  exorcism: [],
  legendary: [
    [
      {
        key: "threshold",
        title: "The threshold",
        story: "The fragments fit together and the map shows a door where there is no door. Past it the ground is wrong.",
        pushLabel: "Cross the threshold running",
        campLabel: "Cross it slowly",
        lootBonus: 0.3,
        pushRisk: { wounded: 0.25, lost: 0.1, dead: 0 },
        campRisk: { wounded: 0.1, haunted: 0 },
        pushReward: { mutation: "hardened", chance: 0.15 },
        warned: false,
        dark: true,
        gamble: null,
      },
      {
        key: "stairs",
        title: "The stair that goes both ways",
        story: "A stair the map insists is one step. It goes up and down at once, and the squad's footing is not to be trusted on it.",
        pushLabel: "Run the stair",
        campLabel: "Feel your way",
        lootBonus: 0.3,
        pushRisk: { wounded: 0.25, lost: 0.1, dead: 0 },
        campRisk: { wounded: 0.1, haunted: 0 },
        pushReward: { mutation: "hardened", chance: 0.15 },
        warned: false,
        dark: true,
        gamble: null,
      },
      {
        key: "doors",
        title: "The gallery of doors",
        story: "A gallery of doors, all of them open on the same room. The fragments point at the one that is not.",
        pushLabel: "Take the wrong door",
        campLabel: "Try them one by one",
        lootBonus: 0.3,
        pushRisk: { wounded: 0.25, lost: 0.1, dead: 0 },
        campRisk: { wounded: 0.1, haunted: 0 },
        pushReward: null,
        warned: false,
        dark: true,
        gamble: null,
        pushFind: { comp: 0.2 },
      },
    ],
    [
      {
        key: "singing",
        title: "The singing dark",
        story: "Something is singing under the floor and the squad wants to leave. There is light ahead, and the singing gets louder toward it.",
        pushLabel: "Follow the light",
        campLabel: "Hold position",
        lootBonus: 0.3,
        pushRisk: { wounded: 0.25, lost: 0.15, dead: 0.2 },
        campRisk: { wounded: 0.1, haunted: 0 },
        pushReward: null,
        warned: true,
        dark: true,
        gamble: null,
      },
      {
        key: "choir",
        title: "The choir",
        story: "Voices in the walls, singing one note each, and the note changes when the squad moves. Ahead the singing stops, which is worse.",
        pushLabel: "Walk into the silence",
        campLabel: "Hold where the singing is",
        lootBonus: 0.3,
        pushRisk: { wounded: 0.25, lost: 0.15, dead: 0.2 },
        campRisk: { wounded: 0.1, haunted: 0 },
        pushReward: null,
        warned: true,
        dark: true,
        gamble: null,
      },
      {
        key: "mirrors",
        title: "The mirror hall",
        story: "A hall of mirrors that show the squad a step behind where they are. One of the reflections is not keeping up.",
        pushLabel: "Go through the glass",
        campLabel: "Back along the wall",
        lootBonus: 0.3,
        pushRisk: { wounded: 0.25, lost: 0.15, dead: 0.2 },
        campRisk: { wounded: 0.1, haunted: 0 },
        pushReward: null,
        warned: true,
        dark: true,
        gamble: null,
      },
    ],
    [
      {
        key: "rift",
        title: "The rift",
        story: "A tear in the air, and stars on the other side that are not ours. The map fragments are pulling toward it.",
        pushLabel: "Go through the rift",
        campLabel: "Edge around it",
        lootBonus: 0.3,
        pushRisk: { wounded: 0.25, lost: 0.15, dead: 0.3 },
        campRisk: { wounded: 0.15, haunted: 0 },
        pushReward: null,
        warned: false,
        dark: false,
        gamble: null,
      },
      {
        key: "sky",
        title: "The falling sky",
        story: "The ceiling is sky, and the sky is falling upward. The map fragments are lighter in the hand than they were.",
        pushLabel: "Go up with it",
        campLabel: "Crawl along the floor",
        lootBonus: 0.3,
        pushRisk: { wounded: 0.25, lost: 0.15, dead: 0.3 },
        campRisk: { wounded: 0.15, haunted: 0 },
        pushReward: null,
        warned: false,
        dark: false,
        gamble: null,
      },
      {
        key: "tide",
        title: "The tide",
        story: "A tide coming in across a floor with no sea. It is warm, and it is pulling toward the far wall.",
        pushLabel: "Swim with it",
        campLabel: "Climb above the line",
        lootBonus: 0.3,
        pushRisk: { wounded: 0.25, lost: 0.15, dead: 0.3 },
        campRisk: { wounded: 0.15, haunted: 0 },
        pushReward: null,
        warned: false,
        dark: false,
        gamble: null,
      },
    ],
    [
      {
        key: "home",
        title: "The way home",
        story: "The door is behind you and closing. Everything the route promised is in the last chamber, and the squad is begging to go.",
        pushLabel: "Take the last chamber",
        campLabel: "Go home now",
        lootBonus: 0.4,
        pushRisk: { wounded: 0.25, lost: 0.2, dead: 0.4 },
        campRisk: { wounded: 0.1, haunted: 0 },
        pushReward: null,
        warned: true,
        dark: false,
        gamble: null,
      },
      {
        key: "table",
        title: "The last table",
        story: "A table laid for the squad, by name, in the last chamber. Everything the route promised is under the cloth. The door home is behind you, and it is not waiting.",
        pushLabel: "Sit down to it",
        campLabel: "Leave the table",
        lootBonus: 0.4,
        pushRisk: { wounded: 0.25, lost: 0.2, dead: 0.4 },
        campRisk: { wounded: 0.1, haunted: 0 },
        pushReward: null,
        warned: true,
        dark: false,
        gamble: null,
      },
      {
        key: "keeper",
        title: "The keeper",
        story: "Something is keeping the last chamber and it has learned the squad's names. It offers a trade: what it has for what you are carrying. The door home is narrowing.",
        pushLabel: "Take the trade",
        campLabel: "Take the door",
        lootBonus: 0.4,
        pushRisk: { wounded: 0.25, lost: 0.2, dead: 0.4 },
        campRisk: { wounded: 0.1, haunted: 0 },
        pushReward: null,
        warned: true,
        dark: false,
        gamble: null,
        pushFind: { comp: 0.3 },
      },
    ],
  ],
};

/** The fixed road: the first place in every slot. Exactly the forks every
 *  tier had before ROAD_RULES, and what a run stamped below it walks. */
export const FORKS: Record<ExpeditionTierKey, ForkDef[]> = Object.fromEntries(
  (Object.keys(ROADS) as ExpeditionTierKey[]).map((tier) => [tier, ROADS[tier].map((slot) => slot[0])]),
) as Record<ExpeditionTierKey, ForkDef[]>;

/** A road's seed: the convoy's id where there is one (both squads must
 *  draw one road), else the run's. Salted apart so convoy 5 and run 5 do
 *  not walk the same valley by coincidence of numbering. */
function roadSeed(road: RoadRef): number {
  return road.convoy ? (road.convoy * 7919 + 11) >>> 0 : (road.runId * 7919 + 5) >>> 0;
}

/**
 * The forks a run actually walks: one place per checkpoint, drawn from
 * ROADS by the run's own seed — or the fixed road (FORKS) for a run from
 * before roads were drawn. Pure and deterministic, so the page, the ping,
 * the convoy announcement and the claim all see the same road without a
 * write; a run launched before forks existed has none and walks none.
 */
export function forksFor(tier: ExpeditionTierKey, road?: RoadRef | null): ForkDef[] {
  const count = road?.forks ?? EXPEDITION_TIERS[tier].forks;
  if (!road || road.rules < ROAD_RULES) return FORKS[tier].slice(0, count);
  const rand = mulberry32(roadSeed(road));
  return ROADS[tier].slice(0, count).map((slot) => slot[Math.min(slot.length - 1, Math.floor(rand() * slot.length))]);
}

/** Death needs this many pushes on the run, counting the one being
 *  rolled. "Only after two reckless forks." */
export const DEAD_NEEDS_PUSHES = 2;

/** What holding a checkpoint is worth: a Top's call camps with none of
 *  the camp's risks and this much more loot — more for a Veteran Top. */
export const HOLD_LOOT = 0.1;
export const VETERAN_HOLD_LOOT = 0.15;
/** A scout at one fork means the squad knows where not to camp at the
 *  next: its camp risks are scaled by this. */
export const SCOUTED_CAMP_RISK = 0.5;
/** What a toll fork takes off the multiplier when the squad pays it. */
export const TOLL_LOOT = 0.15;

/** What a toll costs this week: double under the Watch (weather.ts). */
export function tollCost(weather?: WeatherKey | null): number {
  return weather === "watch" ? TOLL_LOOT * WATCH_TOLL : TOLL_LOOT;
}

/** A fork as the week's weather leaves it: dark under Fog, its gamble
 *  paying DROUGHT_GAMBLE of its bonus under a Drought, its toll waived
 *  under a Harvest. The Watch's toll is priced in tollCost. */
export function underWeather(fork: ForkDef, weather?: WeatherKey | null): ForkDef {
  if (!weather || weather === "clear" || weather === "watch") return fork;
  if (weather === "fog") return fork.dark ? fork : { ...fork, dark: true };
  if (weather === "drought") return fork.gamble ? { ...fork, lootBonus: fork.lootBonus * DROUGHT_GAMBLE } : fork;
  return fork.toll ? { ...fork, toll: undefined } : fork;
}
/** Map fragments a single run can bring home, however it finds them.
 *  resolve_expedition refuses more. */
export const FRAGMENT_CAP = 3;

// === role calls ===============================================================

export type RoleCall = Extract<ForkChoice, "hold" | "scout" | "roam" | "kite" | "ward">;

export interface RoleCallDef {
  choice: RoleCall;
  /** The role word as printed on cards (ROLE_LABELS in cards/build.ts). */
  role: string;
  label: string;
  /** What it does, in the button's words. */
  tease: string;
  /** Whether it is a kind of push (rolls the fork's harm) or a kind of
   *  camp (the safe way, made safer). */
  kind: "push" | "camp";
}

/**
 * The five role calls — one per position the league prints, each once a
 * run, each the shape of the role's job in the actual game:
 *
 *   Top holds: a camp with none of the camp's risks (no wound, no haunt,
 *     no toll) and a little more loot. A Top spends the night on an island
 *     and is fine.
 *   Jungle scouts: a push at three-quarter risk, and whatever goes wrong
 *     goes wrong for the Jungle, who went in first.
 *   Mid roams: a push for half again the loot, with the harm rolled on two
 *     cards instead of one. Tempo, at a price.
 *   Bot kites: a push for half the loot at a quarter of the risk. Take
 *     what you can from range and never get close.
 *   Support wards: a push where the wound roll is what it was but the
 *     lost and dead rolls are halved. You see the danger coming.
 */
export const ROLE_CALLS: RoleCallDef[] = [
  { choice: "hold", role: "Top", label: "Hold the checkpoint", tease: `Camp, and nothing that can happen to a camper happens. +${Math.round(HOLD_LOOT * 100)}% loot. A Top's call, once a run.`, kind: "camp" },
  { choice: "scout", role: "Jungle", label: "Scout it first", tease: "Push at three-quarter risk, and whatever goes wrong lands on the Jungle. Once a run.", kind: "push" },
  { choice: "roam", role: "Mid", label: "Roam for it", tease: "Push for half again the loot; the harm is rolled on two cards, not one. A Mid's call, once a run.", kind: "push" },
  { choice: "kite", role: "Bot", label: "Kite it", tease: "Push for half the loot at a quarter of the risk. A Bot's call, once a run.", kind: "push" },
  { choice: "ward", role: "Support", label: "Ward the approach", tease: "Push with the lost and dead rolls halved. A Support's call, once a run.", kind: "push" },
];

/** What the call says on the button when a Veteran is making it. */
export const VETERAN_TEASE: Record<RoleCall, string> = {
  hold: `Veteran Top: +${Math.round(VETERAN_HOLD_LOOT * 100)}% instead.`,
  scout: "Veteran Jungle: half risk instead.",
  roam: "Veteran Mid: three-quarters again the loot instead.",
  kite: "Veteran Bot: an eighth of the risk instead.",
  ward: "Veteran Support: lost and dead rolls to a quarter.",
};

export const ROLE_CALL_BY_CHOICE: Record<RoleCall, RoleCallDef> = Object.fromEntries(ROLE_CALLS.map((call) => [call.choice, call])) as Record<RoleCall, RoleCallDef>;

export function isRoleCall(choice: ForkChoice | null): choice is RoleCall {
  return choice !== null && choice in ROLE_CALL_BY_CHOICE;
}

/** Whether a choice keeps the squad where it is. `hold` is a camp with a
 *  Top's name on it; everything else that is not `camp` moves. */
export function isCampChoice(choice: ForkChoice | null): boolean {
  return choice === "camp" || choice === "hold";
}

const roleOf = (copy: Pick<CardCopy, "role">): string => (copy.role ?? "").trim().toLowerCase();

/** The squad's members in a role, as printed on the card. */
function inRole(copies: Pick<CardCopy, "role">[], role: string): Pick<CardCopy, "role">[] {
  return copies.filter((copy) => roleOf(copy) === role.toLowerCase());
}

/** What the squad's own cards unlock at a fork. */
export interface SquadAbilities {
  /** A signed card can call in a favour: the push bonus with no risk,
   *  once per run. */
  favour: boolean;
  /** A foil lights a dark fork: push at half the risk. */
  light: boolean;
  /** Three from one roster rally: double the push bonus, half again the
   *  risk — and the wipe rule on a Legend Hunt (see resolveRoute). */
  rally: boolean;
}

export function squadAbilities(copies: Pick<CardCopy, "signed" | "foil" | "card">[]): SquadAbilities {
  const teams = new Set(copies.map((copy) => (copy.card?.teamName ?? "").trim().toLowerCase()).filter(Boolean));
  return {
    favour: copies.some((copy) => copy.signed),
    light: copies.some((copy) => copy.foil),
    rally: copies.length === 3 && teams.size === 1,
  };
}

export interface ForkOption {
  choice: ForkChoice;
  label: string;
  /** What it does, for the button's caption. */
  tease: string;
  /** Why it is not available, when it is not. */
  locked: string | null;
  /** The role a call needs, for the five that need one. */
  role?: string;
}

/**
 * The choices at one fork, for this squad, given what has already been
 * spent. Everything is listed — locked options say why — so the page
 * teaches what a signed card or a full roster would have bought. The role
 * calls are listed too, and only under a road (ROAD_RULES): a run that
 * left before they existed never hears of them.
 */
export function forkOptions(
  tier: ExpeditionTierKey,
  index: number,
  copies: Pick<CardCopy, "signed" | "foil" | "card" | "role">[],
  earlier: (ForkChoice | null)[],
  road?: RoadRef | null,
  weather?: WeatherKey | null,
): ForkOption[] {
  const drawn = forksFor(tier, road)[index];
  if (!drawn) return [];
  const fork = underWeather(drawn, weather);
  const abilities = squadAbilities(copies);
  const favourSpent = earlier.includes("favour");
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const risk = worstRisk(fork);
  const bonus = fork.gamble ? `${pct(fork.lootBonus)} more or ${pct(fork.gamble.down)} less` : `+${pct(fork.lootBonus)} loot`;
  const finds = [
    fork.pushFind?.fragment ? `${pct(fork.pushFind.fragment)} a map fragment` : null,
    fork.pushFind?.comp ? `${pct(fork.pushFind.comp)} a free pack` : null,
  ].filter(Boolean);
  const campTease = fork.campRisk.haunted > 0
    ? `Keep what you have. ${pct(fork.campRisk.haunted)} chance a card comes home Haunted.`
    : fork.campRisk.wounded > 0
      ? `The careful way. Still ${pct(fork.campRisk.wounded)} to wound a card here.`
      : "Keep what you have. Nothing is risked.";
  const options: ForkOption[] = [
    {
      choice: "camp",
      label: fork.campLabel,
      tease: `${campTease}${fork.toll ? ` ${pct(fork.toll)} it costs ${pct(tollCost(weather))} of the loot.` : ""}${fork.campReward ? ` ${pct(fork.campReward.chance)} to come home ${fork.campReward.mutation}.` : ""}`,
      locked: null,
    },
    {
      choice: "push",
      label: fork.pushLabel,
      tease: fork.gamble
        ? `${bonus}. Nothing can hurt a card on this run.`
        : `${bonus}. ${risk}${fork.pushReward ? ` ${pct(fork.pushReward.chance)} to bring home ${fork.pushReward.mutation}.` : ""}${finds.length ? ` ${finds.join(", ")}.` : ""}${fork.warned ? " The squad warns against it: go wrong here and the card comes home Cursed." : ""}`,
      locked: null,
    },
    {
      choice: "favour",
      label: "Call in a favour",
      tease: `${bonus} with no risk. A signed card's favour, once per run.`,
      locked: !abilities.favour ? "Needs a signed card in the squad." : favourSpent ? "Already spent on this run." : null,
    },
    {
      choice: "light",
      label: "Light the way",
      tease: weather === "fog" ? `Push at half the risk. A foil lights a dark fork — and in this fog, every fork is dark.` : `Push at half the risk. A foil lights a dark fork.`,
      locked: !fork.dark ? "This fork is not dark." : !abilities.light ? "Needs a foil in the squad." : null,
    },
    {
      choice: "rally",
      label: "Rally the roster",
      tease: `Push for double the loot at half again the risk. Three from one team.`,
      locked: !abilities.rally ? "Needs three cards from one roster." : null,
    },
  ];
  if (road && road.rules >= ROAD_RULES) {
    for (const call of ROLE_CALLS) {
      // A gamble fork has no harm to shape and no camp worth holding: the
      // scouting run's fork is a coin flip, and a role call is not a coin.
      const members = inRole(copies, call.role) as CardCopy[];
      const present = members.length > 0;
      const veteran = present && members.some((member) => isVeteran(member));
      options.push({
        choice: call.choice,
        label: call.label,
        tease: veteran ? `${call.tease} ${VETERAN_TEASE[call.choice]}` : call.tease,
        role: call.role,
        locked: fork.gamble
          ? "Not on a coin flip."
          : !present
            ? `Needs a ${call.role} in the squad.`
            : earlier.includes(call.choice)
              ? "Already spent on this run."
              : null,
      });
    }
  }
  return options;
}

function worstRisk(fork: ForkDef): string {
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const parts: string[] = [];
  if (fork.pushRisk.wounded > 0) parts.push(`${pct(fork.pushRisk.wounded)} a card is wounded`);
  if (fork.pushRisk.lost > 0) parts.push(`${pct(fork.pushRisk.lost)} one is lost`);
  if (fork.pushRisk.dead > 0) parts.push(`${pct(fork.pushRisk.dead)} one dies (after ${DEAD_NEEDS_PUSHES} pushes)`);
  return parts.length ? `${parts.join(", ")}.` : "No risk.";
}

/** Whether a choice is one the squad can actually make here. The server
 *  checks this before the RPC writes it; the RPC only knows the words. */
export function choiceAllowed(
  tier: ExpeditionTierKey,
  index: number,
  choice: ForkChoice,
  copies: Pick<CardCopy, "signed" | "foil" | "card" | "role">[],
  earlier: (ForkChoice | null)[],
  road?: RoadRef | null,
  weather?: WeatherKey | null,
): boolean {
  return forkOptions(tier, index, copies, earlier, road, weather).some((option) => option.choice === choice && option.locked === null);
}

// === timing ==================================================================

export interface ForkWindow {
  index: number;
  opensAt: Date;
  closesAt: Date;
}

/**
 * When each fork opens and closes. N forks split the run into N+1 legs;
 * fork i opens at the end of leg i and stays open until the end of the
 * next leg, so a 24-hour raid pauses at 8h and 16h and each fork waits
 * eight hours for an answer. decide_expedition_fork computes the same
 * window in SQL — this is what the page reads; that is what the write
 * checks.
 */
export function forkWindows(startedAt: string, resolvesAt: string, forks: number): ForkWindow[] {
  const start = new Date(startedAt).getTime();
  const end = new Date(resolvesAt).getTime();
  const span = end - start;
  const legs = forks + 1;
  const windows: ForkWindow[] = [];
  for (let i = 1; i <= forks; i += 1) {
    windows.push({
      index: i - 1,
      opensAt: new Date(start + (span * i) / legs),
      closesAt: new Date(start + (span * (i + 1)) / legs),
    });
  }
  return windows;
}

export type ForkStatus = "pending" | "open" | "decided" | "missed";

export interface ForkView extends ForkWindow {
  status: ForkStatus;
  /** What was chosen, or null while pending/open, or "camp" once missed. */
  choice: ForkChoice | null;
}

/** One recorded answer, as the run row stores it in `choices`. */
export interface RecordedChoice {
  index: number;
  choice: ForkChoice;
  at: string;
}

/** Every fork on a run with where it stands right now. */
export function forkViews(
  run: { startedAt: string; resolvesAt: string; forks: number; choices: RecordedChoice[] },
  now: Date,
): ForkView[] {
  const decided = new Map(run.choices.map((choice) => [choice.index, choice.choice]));
  return forkWindows(run.startedAt, run.resolvesAt, run.forks).map((window) => {
    const choice = decided.get(window.index) ?? null;
    if (choice) return { ...window, status: "decided", choice };
    if (now.getTime() < window.opensAt.getTime()) return { ...window, status: "pending", choice: null };
    if (now.getTime() < window.closesAt.getTime()) return { ...window, status: "open", choice: null };
    return { ...window, status: "missed", choice: "camp" };
  });
}

/** The fork waiting on an answer right now, or null. */
export function openFork(
  run: { startedAt: string; resolvesAt: string; forks: number; choices: RecordedChoice[] },
  now: Date,
): ForkView | null {
  return forkViews(run, now).find((fork) => fork.status === "open") ?? null;
}

/**
 * The choices as the resolver reads them: one per fork, in order, null
 * where the squad was never told. Silence resolves as camp INSIDE
 * resolveRoute, but it is kept distinct here because the Legend Hunt's
 * wipe rule counts silences, not camps.
 */
export function choiceSheet(forks: number, choices: RecordedChoice[]): (ForkChoice | null)[] {
  const decided = new Map(choices.map((choice) => [choice.index, choice.choice]));
  return Array.from({ length: forks }, (_, index) => decided.get(index) ?? null);
}

// === resolution ==============================================================

export type CardFateKind = "home" | "wounded" | "lost" | "dead";

const FATE_RANK: Record<CardFateKind, number> = { home: 0, wounded: 1, lost: 2, dead: 3 };

export interface CardFate {
  id: number;
  fate: CardFateKind;
  /** A mutation the card came home with (never on a dead card). */
  mutation: MutationKey | null;
  /** The bench, when wounded. */
  woundedUntil: string | null;
}

export interface RouteEvent {
  /** Which fork, or null for the run's finale. */
  fork: number | null;
  tone: "good" | "bad" | "neutral";
  text: string;
}

/** An encounter as the resolver reads it: journal.ts decides where they
 *  fall and how a coin landed; this only applies them. `won` is the
 *  rival's verdict, `found` the hunter's — settled at derivation so the
 *  journal can say so hours before the claim. */
export interface RouteEncounter {
  leg: number;
  key: string;
  won?: boolean;
  found?: boolean;
  /** A rival encounter with nobody on the road (COMPANY_RULES): the cairn
   *  holds a cache instead. */
  alone?: boolean;
  /** The rival's username, when the rival is a real collector's run. */
  rivalName?: string;
  /** The ghost met on this leg: the dead card's name and whether it stood
   *  aside for its old team's colours. */
  ghost?: { name: string; owner?: string; team?: string | null; stood: boolean } | null;
}

/** What the trail's beats do to the multiplier, for the ones that touch
 *  it. A cache is found; a rival is beaten or not; a shrine keeps its
 *  hand on the next fork's harm. */
export const CACHE_LOOT = 0.15;
export const RIVAL_WIN_LOOT = 0.2;
export const RIVAL_LOSS_LOOT = 0.1;
/** A shrine on leg i halves the push risk at fork i — the one the squad
 *  reaches next. */
export const SHRINE_RISK = 0.5;
/** A ghost on leg i walks the camp at fork i: the haunting is rolled at
 *  GHOST_HAUNT times the fork's own, and never under GHOST_HAUNT_FLOOR —
 *  a fork whose camp was safe is not safe with a ghost at its edge. */
export const GHOST_HAUNT = 2;
export const GHOST_HAUNT_FLOOR = 0.2;

export interface RouteResult {
  /** What the base payout is multiplied by, capped at LOOT_MULT_CAP. */
  lootMultiplier: number;
  pushes: number;
  /** Forks the squad answered with silence. */
  silences: number;
  fates: CardFate[];
  /** Map fragments found, on the finale and on the road, capped. */
  fragments: number;
  /** A free pack found on the road (the finale's comp is config.ts's). */
  comp: boolean;
  /** A Rescue's verdict; null on every other route. */
  rescued: boolean | null;
  /** The Exorcism's cleansed card; null elsewhere. */
  cleansed: number | null;
  events: RouteEvent[];
}

export interface RouteInput {
  tier: ExpeditionTierKey;
  /** How many forks the RUN had. A run launched before forks existed has
   *  none, and walks none — its squad never saw a checkpoint. Defaults to
   *  the tier's count. */
  forks?: number;
  /** The run's road: which places it walked and whether it may make a
   *  role call. Omitted, the fixed road is walked (a run from before
   *  ROAD_RULES, or a test that names the forks by their old numbers). */
  road?: RoadRef | null;
  copies: CardCopy[];
  /** One per fork, null for silence. */
  choices: (ForkChoice | null)[];
  insured: boolean;
  grade: OutcomeGrade;
  /** The Rescue's lost card or the Exorcism's afflicted one. */
  target: number | null;
  /** The trail's beats that touch the resolution. Optional: a run from
   *  before the road met none of these. */
  encounters?: RouteEncounter[];
  /** The weather the run launched under (weather.ts), or none. */
  weather?: WeatherKey | null;
  /** The clock, for the wounded bench's end. */
  now: Date;
}

/** A chance that isn't one. Zero and one are settled without touching the
 *  stream, the config.ts discipline, so a chance tuned to 0 never shifts
 *  what a later roll reads. */
function decide(chance: number, rand: () => number): boolean {
  if (chance <= 0) return false;
  if (chance >= 1) return true;
  return rand() < chance;
}

/** One of `items`, uniformly. Consumes one rand; none for a single item. */
function pick<T>(items: T[], rand: () => number): T | undefined {
  if (items.length === 0) return undefined;
  if (items.length === 1) return items[0];
  return items[Math.min(items.length - 1, Math.floor(rand() * items.length))];
}

/** Where a fragment can turn up, and how often. Only the Legend Hunt
 *  drops them reliably: three is the price of the Legendary route, and a
 *  Deep Raid jackpot is the one other way in. */
export const FRAGMENT_CHANCE: Partial<Record<ExpeditionTierKey, Partial<Record<OutcomeGrade, number>>>> = {
  raid: { jackpot: 0.25 },
  legend: { solid: 0.35, jackpot: 1 },
};

/** A second survivor comes home Voidtouched this often; the first always. */
export const VOIDTOUCHED_SECOND_CHANCE = 0.25;

/** A Cursed card sent out again on a route that can lose it has this
 *  chance of not coming back. A curse you ignore compounds. */
export const CURSED_AGAIN_LOST = 0.15;

/** The Rescue roll: a floor everyone gets, plus shine, capped. */
export const RESCUE_BASE = 0.45;
export const RESCUE_PER_SHINE = 0.015;
export const RESCUE_CAP = 0.9;
export const RESCUE_PUSH_BONUS = 0.15;
/** When a rescue fails: each rescuer's wound chance, and the chance the
 *  camp keeps one of them too. */
export const RESCUE_FAIL_WOUNDED = 0.5;
export const RESCUE_FAIL_LOST = 0.1;

export function rescueChance(copies: CardCopy[], pushed: boolean): number {
  const shine = copies.reduce((sum, copy) => sum + shineOf(copy), 0);
  return Math.min(RESCUE_CAP, RESCUE_BASE + RESCUE_PER_SHINE * shine + (pushed ? RESCUE_PUSH_BONUS : 0));
}

/** How each kind of push shapes the fork's numbers: what it multiplies
 *  the loot bonus by, what it scales the wound roll by, what it scales the
 *  lost and dead rolls by, and whose head the harm lands on. */
type PushShape = { bonus: number; risk: number; deepRisk: number; victims: "one" | "two" | "jungle" };

const PUSH_SHAPE: Record<Exclude<ForkChoice, "camp" | "hold">, PushShape> = {
  push: { bonus: 1, risk: 1, deepRisk: 1, victims: "one" },
  favour: { bonus: 1, risk: 0, deepRisk: 0, victims: "one" },
  light: { bonus: 1, risk: 0.5, deepRisk: 0.5, victims: "one" },
  rally: { bonus: 2, risk: 1.5, deepRisk: 1.5, victims: "one" },
  scout: { bonus: 1, risk: 0.75, deepRisk: 0.75, victims: "jungle" },
  roam: { bonus: 1.5, risk: 1, deepRisk: 1, victims: "two" },
  kite: { bonus: 0.5, risk: 0.25, deepRisk: 0.25, victims: "one" },
  ward: { bonus: 1, risk: 1, deepRisk: 0.5, victims: "one" },
};

/** The same calls in a Veteran's hands (trail.ts, sixteen miles): the
 *  Jungle scouts at half risk, the Mid roams for three-quarters again, the
 *  Bot kites at an eighth, the Support wards the lost and dead rolls down
 *  to a quarter. Only the card making the call has to be the veteran. */
export const VETERAN_SHAPE: Record<RoleCall, PushShape | null> = {
  hold: null,
  scout: { bonus: 1, risk: 0.5, deepRisk: 0.5, victims: "jungle" },
  roam: { bonus: 1.75, risk: 1, deepRisk: 1, victims: "two" },
  kite: { bonus: 0.5, risk: 0.125, deepRisk: 0.125, victims: "one" },
  ward: { bonus: 1, risk: 1, deepRisk: 0.25, victims: "one" },
};

/** The card that makes a role call: the squad's member in that role with
 *  the most miles, so a squad with two Junglers scouts with the one who
 *  has walked further. */
function caller(copies: CardCopy[], role: string): CardCopy | undefined {
  return [...(inRole(copies, role) as CardCopy[])].sort((a, b) => milesOf(b) - milesOf(a))[0];
}

const PUSH_VERB: Record<Exclude<ForkChoice, "camp" | "hold">, string> = {
  push: "they pushed through",
  favour: "a favour got them through clean",
  light: "a foil lit the way through",
  rally: "the roster rallied and took it",
  scout: "the Jungle went in first and the rest followed",
  roam: "the Mid roamed for it and the squad came out ahead",
  kite: "the Bot kited it from range and never got close",
  ward: "the Support warded the approach and they saw it coming",
};

/**
 * Walks the route and settles every card.
 *
 * Rand consumption, fork by fork in order: [gamble] → [push: the card it
 * lands on, then wounded, lost, dead in that order] → [push reward: the
 * card, then the chance] → [push find: fragment, then pack] → [camp:
 * wounded, then haunted, then the toll, then the camp reward's card and
 * chance]. Then the finale: the Legend wipe (no rand), the Legendary's
 * Voidtouched picks, the Rescue roll, fragments. Every roll whose chance is
 * 0 or 1 is settled without drawing, and every draw the road added comes
 * AFTER the ones the fixed road made, so a scripted queue in a test reads
 * left to right and a run from before the road rolls exactly what it did.
 */
export function resolveRoute(input: RouteInput, rand: () => number): RouteResult {
  const forks = forksFor(input.tier, { ...(input.road ?? { runId: 0, rules: 0 }), forks: input.forks ?? input.road?.forks ?? EXPEDITION_TIERS[input.tier].forks })
    .map((fork) => underWeather(fork, input.weather));
  const abilities = squadAbilities(input.copies);
  const roleCalls = Boolean(input.road && input.road.rules >= ROAD_RULES);
  const events: RouteEvent[] = [];
  const woundedUntil = new Date(input.now.getTime() + WOUNDED_HOURS * 3_600_000).toISOString();

  const fates = new Map<number, CardFate>(
    input.copies.map((copy) => [copy.id, { id: copy.id, fate: "home", mutation: null, woundedUntil: null }]),
  );
  const alive = () => input.copies.filter((copy) => fates.get(copy.id)!.fate !== "dead");
  const unmutated = () => alive().filter((copy) => !copy.card?.mutation && fates.get(copy.id)!.mutation === null);
  const nameOf = (id: number) => input.copies.find((copy) => copy.id === id)?.playerName ?? `#${id}`;

  function harm(id: number, kind: CardFateKind) {
    const fate = fates.get(id)!;
    // One-of-ones cannot board a route that loses them, but the ceiling is
    // enforced here too: a rule that lives only in the gate is a rule one
    // missed check away from being nothing.
    const copy = input.copies.find((c) => c.id === id);
    const capped = copy && isProtected(copy) && FATE_RANK[kind] > FATE_RANK.wounded ? "wounded" : kind;
    if (FATE_RANK[capped] > FATE_RANK[fate.fate]) fate.fate = capped;
  }
  function mutate(id: number, key: MutationKey): boolean {
    const fate = fates.get(id)!;
    const copy = input.copies.find((c) => c.id === id);
    if (fate.fate === "dead" || fate.mutation || copy?.card?.mutation) return false;
    fate.mutation = key;
    return true;
  }

  let lootMultiplier = 1;
  let pushes = 0;
  let silences = 0;
  let favourSpent = false;
  let fragments = 0;
  let comp = false;
  const callsSpent = new Set<RoleCall>();
  // What the run remembers of itself between forks.
  let tollPaid = false;
  let scouted = false;

  // The trail's beats, first: none of them draws, all of them were settled
  // when the journal was written. A shrine is remembered for the fork it
  // guards; the rest move the multiplier or the bag.
  const shrines = new Set<number>();
  const ghosts = new Set<number>();
  for (const encounter of input.encounters ?? []) {
    if (encounter.key === "cache") {
      lootMultiplier += CACHE_LOOT;
      events.push({ fork: null, tone: "good", text: "An old expedition's cache on the trail: what they left was worth carrying." });
    } else if (encounter.key === "rival" && encounter.alone) {
      // Nobody else on the road: the cairn where the rival would have
      // been holds a cache.
      lootMultiplier += CACHE_LOOT;
      events.push({ fork: null, tone: "good", text: "The road was the squad's alone, and the cache under the cairn was theirs for the taking." });
    } else if (encounter.key === "rival") {
      lootMultiplier += encounter.won ? RIVAL_WIN_LOOT : -RIVAL_LOSS_LOOT;
      const rival = encounter.rivalName ? `${encounter.rivalName}'s squad` : "A rival squad";
      events.push({ fork: null, tone: encounter.won ? "good" : "bad", text: encounter.won ? `${rival} on the same trail, and yours got there first.` : `${rival} on the same trail got there first, and left less.` });
    } else if (encounter.key === "ghost" && encounter.ghost?.stood) {
      lootMultiplier += CACHE_LOOT;
      events.push({ fork: null, tone: "good", text: `${encounter.ghost.name}'s ghost knew the squad's colours and stood aside; under the cairn where it stood, a cache.` });
    } else if (encounter.key === "ghost" && encounter.ghost) {
      ghosts.add(encounter.leg);
    } else if (encounter.key === "hunter" && encounter.found) {
      fragments += 1;
      events.push({ fork: null, tone: "good", text: "A relic hunter on the road traded a piece of a map that shows a place the map does not." });
    } else if (encounter.key === "shrine") {
      shrines.add(encounter.leg);
    }
  }

  forks.forEach((fork, index) => {
    const answer = input.choices[index] ?? null;
    if (answer === null) silences += 1;
    // Silence camps. An unlocked-but-ineligible choice (a favour with no
    // signed card, say) also camps: the server refuses to record one, so
    // reading it here would mean the row was written around the RPC.
    let choice: ForkChoice = answer ?? "camp";
    if (choice === "favour" && (!abilities.favour || favourSpent)) choice = "camp";
    if (choice === "light" && (!abilities.light || !fork.dark)) choice = "camp";
    if (choice === "rally" && !abilities.rally) choice = "camp";
    if (isRoleCall(choice)) {
      const call = ROLE_CALL_BY_CHOICE[choice];
      if (!roleCalls || fork.gamble || callsSpent.has(choice) || inRole(alive(), call.role).length === 0) choice = "camp";
      else callsSpent.add(choice);
    }
    if (choice === "favour") favourSpent = true;

    // What the last fork left behind, read once and spent here.
    const passage = tollPaid;
    const knowing = scouted;
    tollPaid = false;
    scouted = false;

    if (choice === "hold") {
      // A Top on the checkpoint: the safe way with nothing that makes the
      // safe way unsafe — no wound, no haunting, no toll — and a little
      // more in the bag for the night's work. A Veteran Top holds for more.
      const top = caller(alive(), "Top");
      lootMultiplier += top && isVeteran(top) ? VETERAN_HOLD_LOOT : HOLD_LOOT;
      events.push({ fork: index, tone: "good", text: `${fork.title}: ${top ? nameOf(top.id) : "the Top"} held the checkpoint alone all night, and the squad kept everything.` });
      return;
    }

    if (choice === "camp") {
      // A scout at the last fork means the squad knows where not to camp
      // at this one: both camp risks are halved.
      const campScale = knowing ? SCOUTED_CAMP_RISK : 1;
      if (knowing && (fork.campRisk.wounded > 0 || fork.campRisk.haunted > 0)) {
        events.push({ fork: index, tone: "neutral", text: `${fork.title}: the Jungle's scouting held — the squad knew where not to sleep.` });
      }
      if (decide(fork.campRisk.wounded * campScale, rand)) {
        const victim = pick(alive(), rand);
        if (victim) {
          harm(victim.id, "wounded");
          events.push({ fork: index, tone: "bad", text: `${fork.title}: the squad held back and ${nameOf(victim.id)} was hurt anyway.` });
        }
      }
      // A ghost walked the last leg: it is at the camp's edge tonight.
      const haunted = ghosts.has(index) ? Math.max(fork.campRisk.haunted * GHOST_HAUNT, GHOST_HAUNT_FLOOR) : fork.campRisk.haunted;
      if (decide(haunted * campScale, rand)) {
        const victim = pick(unmutated(), rand);
        if (victim && mutate(victim.id, "haunted")) {
          events.push({ fork: index, tone: "bad", text: ghosts.has(index) ? `${fork.title}: the ghost sat at the fire all night, and ${nameOf(victim.id)} listened to it.` : `${fork.title}: ${nameOf(victim.id)} sat up all night listening, and brought something back.` });
        }
      } else if (ghosts.has(index)) {
        events.push({ fork: index, tone: "neutral", text: `${fork.title}: the ghost walked the camp's edge all night and took nothing.` });
      }
      let tolled = false;
      if (fork.toll && passage) {
        // The toll paid at the last fork bought this gate too.
        events.push({ fork: index, tone: "good", text: `${fork.title}: the toll they paid at the last gate was good for this one.` });
      } else if (fork.toll && decide(fork.toll, rand)) {
        lootMultiplier -= tollCost(input.weather);
        tolled = true;
        tollPaid = true;
        events.push({ fork: index, tone: "bad", text: `${fork.title}: the safe way had a price, and the squad paid it.` });
      }
      if (fork.campReward) {
        const bearer = pick(unmutated(), rand);
        if (bearer && decide(fork.campReward.chance, rand) && mutate(bearer.id, fork.campReward.mutation)) {
          events.push({ fork: index, tone: "good", text: `${fork.title}: ${nameOf(bearer.id)} waited it out and came away ${fork.campReward.mutation}.` });
        }
      }
      if (fork.campRisk.wounded === 0 && fork.campRisk.haunted === 0 && !tolled && !ghosts.has(index)) {
        events.push({ fork: index, tone: "neutral", text: `${fork.title}: ${answer === null ? "no word came, so the squad" : "the squad"} took the safe way.` });
      }
      return;
    }

    // Every other choice is a push of some kind. A role call in a Veteran's
    // hands takes the sharper shape; the caller is the squad's member in
    // that role with the most miles.
    pushes += 1;
    const veteran = isRoleCall(choice) ? caller(alive(), ROLE_CALL_BY_CHOICE[choice].role) : undefined;
    const shape = (isRoleCall(choice) && veteran && isVeteran(veteran) && VETERAN_SHAPE[choice]) || PUSH_SHAPE[choice];
    if (choice === "scout") scouted = true;
    const bonus = fork.lootBonus * shape.bonus;
    // A shrine on the leg before this fork keeps its hand on the harm.
    const guard = shrines.has(index) ? SHRINE_RISK : 1;
    const riskScale = shape.risk * guard;
    const deepScale = shape.deepRisk * guard;

    if (fork.gamble) {
      if (decide(fork.gamble.lose, rand)) {
        lootMultiplier -= fork.gamble.down;
        events.push({ fork: index, tone: "bad", text: `${fork.title}: the camp was empty and the detour cost them.` });
      } else {
        lootMultiplier += bonus;
        events.push({ fork: index, tone: "good", text: `${fork.title}: the camp was real, and unguarded.` });
      }
      return;
    }

    lootMultiplier += bonus;
    // Whose head it lands on. One card for most pushes; the Jungle for a
    // scout (they went in first — no draw when there is one of them); two
    // cards for a roam.
    const victims: CardCopy[] = [];
    if (riskScale > 0 || deepScale > 0) {
      if (shape.victims === "jungle") {
        // The Jungle who went in first — the one who made the call. With
        // one Jungle there is nothing to draw; with two the road picks.
        const junglers = inRole(alive(), "Jungle") as CardCopy[];
        const first = junglers.length === 1 ? junglers[0] : pick(junglers.length > 0 ? junglers : alive(), rand);
        if (first) victims.push(first);
      } else {
        const first = pick(alive(), rand);
        if (first) victims.push(first);
        if (shape.victims === "two" && first) {
          const second = pick(alive().filter((copy) => copy.id !== first.id), rand);
          if (second) victims.push(second);
        }
      }
    }
    let anyHarm = false;
    for (const victim of victims) {
      let worst: CardFateKind = "home";
      if (decide(Math.min(1, fork.pushRisk.wounded * riskScale), rand)) worst = "wounded";
      if (decide(Math.min(1, fork.pushRisk.lost * deepScale), rand)) worst = "lost";
      if (pushes >= DEAD_NEEDS_PUSHES && decide(Math.min(1, fork.pushRisk.dead * deepScale), rand)) worst = "dead";
      if (worst === "home") continue;
      anyHarm = true;
      // The warned fork's price: go wrong here and the card is Cursed. A
      // wound becomes the curse; a loss or a death carries it too.
      if (fork.warned) {
        const cursed = mutate(victim.id, "cursed");
        if (worst === "wounded") worst = "home";
        if (cursed) events.push({ fork: index, tone: "bad", text: `${fork.title}: they were warned. ${nameOf(victim.id)} comes home Cursed.` });
      }
      if (worst !== "home") {
        harm(victim.id, worst);
        const verb = worst === "dead" ? "did not survive it" : worst === "lost" ? "did not come out" : "was carried out";
        events.push({ fork: index, tone: "bad", text: `${fork.title}: they pushed, and ${nameOf(victim.id)} ${verb}.` });
      }
    }
    if (!anyHarm) {
      events.push({ fork: index, tone: "good", text: `${fork.title}: ${PUSH_VERB[choice]}.` });
    }
    if (fork.pushReward) {
      const bearer = pick(unmutated(), rand);
      if (bearer && decide(fork.pushReward.chance, rand) && mutate(bearer.id, fork.pushReward.mutation)) {
        events.push({ fork: index, tone: "good", text: `${fork.title}: ${nameOf(bearer.id)} came out of it ${fork.pushReward.mutation}.` });
      }
    }
    if (fork.pushFind?.fragment && decide(fork.pushFind.fragment, rand)) {
      fragments += 1;
      events.push({ fork: index, tone: "good", text: `${fork.title}: in the haul, a fragment of a map that shows a place the map does not.` });
    }
    if (fork.pushFind?.comp && decide(fork.pushFind.comp, rand)) {
      comp = true;
      events.push({ fork: index, tone: "good", text: `${fork.title}: a sealed pack, unopened, in with the rest. It is yours.` });
    }
  });

  // The finale.
  let rescued: boolean | null = null;
  let cleansed: number | null = null;

  // A curse you ignore compounds: a Cursed card out again on a route that
  // can lose it may not come back. Only where the route can lose a card —
  // a raid cannot, and the claim RPC would refuse a loss there anyway.
  if (input.tier === "legend" || input.tier === "legendary") {
    for (const copy of alive()) {
      if (copy.card?.mutation?.key === "cursed" && fates.get(copy.id)!.fate !== "lost" && decide(CURSED_AGAIN_LOST, rand)) {
        harm(copy.id, "lost");
        events.push({ fork: null, tone: "bad", text: `${nameOf(copy.id)} was Cursed, and went out anyway. It did not come back.` });
      }
    }
  }

  if (input.tier === "legend" && abilities.rally && silences >= 2) {
    // The chemistry that helps you is the same thing that sinks you: a
    // one-roster squad ignored twice moves as one, and is lost as one.
    for (const copy of alive()) harm(copy.id, "lost");
    events.push({ fork: null, tone: "bad", text: "Nobody answered twice, and a squad that moves as one roster is lost as one. All three are missing." });
  }

  if (input.tier === "legendary") {
    const survivors = alive();
    if (survivors.length === 0) {
      events.push({ fork: null, tone: "bad", text: "Nobody came home." });
    } else {
      const first = pick(unmutated(), rand);
      if (first && mutate(first.id, "voidtouched")) {
        events.push({ fork: null, tone: "good", text: `${nameOf(first.id)} came back through the rift Voidtouched.` });
      }
      if (decide(VOIDTOUCHED_SECOND_CHANCE, rand)) {
        const second = pick(unmutated(), rand);
        if (second && mutate(second.id, "voidtouched")) {
          events.push({ fork: null, tone: "good", text: `${nameOf(second.id)} came back Voidtouched too.` });
        }
      }
    }
  }

  if (input.tier === "rescue") {
    const pushed = !isCampChoice(input.choices[0] ?? "camp");
    rescued = decide(rescueChance(input.copies, pushed), rand);
    if (rescued) {
      events.push({ fork: null, tone: "good", text: "They found the lost card and brought it home. It is wounded, and it is home." });
    } else {
      events.push({ fork: null, tone: "bad", text: "The camp was ready for them. The lost card is still out there." });
      for (const copy of alive()) {
        if (decide(RESCUE_FAIL_WOUNDED, rand)) harm(copy.id, "wounded");
      }
      if (decide(RESCUE_FAIL_LOST, rand)) {
        const taken = pick(alive(), rand);
        if (taken) {
          harm(taken.id, "lost");
          events.push({ fork: null, tone: "bad", text: `${nameOf(taken.id)} did not make it out either.` });
        }
      }
    }
  }

  if (input.tier === "exorcism") {
    cleansed = input.target;
    events.push({ fork: null, tone: "good", text: `${input.target === null ? "The card" : nameOf(input.target)} came home clean. Whatever it carried is gone.` });
  }

  // Insurance, last: it reads the settled fate, and turns it down one rung.
  if (input.insured) {
    for (const fate of fates.values()) {
      if (fate.fate === "dead") {
        fate.fate = "lost";
        events.push({ fork: null, tone: "neutral", text: `Insurance: ${nameOf(fate.id)} is lost, not dead. A week to bring them home.` });
      } else if (fate.fate === "lost") {
        fate.fate = "wounded";
        events.push({ fork: null, tone: "neutral", text: `Insurance: ${nameOf(fate.id)} was carried home instead of left behind.` });
      }
    }
  }

  const fragmentChance = FRAGMENT_CHANCE[input.tier]?.[input.grade] ?? 0;
  if (decide(fragmentChance, rand)) {
    fragments += 1;
    events.push({ fork: null, tone: "good", text: "Among the haul: a fragment of a map that shows a place the map does not." });
  }

  for (const fate of fates.values()) {
    if (fate.fate === "wounded") fate.woundedUntil = woundedUntil;
    if (fate.fate === "dead") fate.mutation = null;
  }

  return {
    lootMultiplier: Math.max(0.1, Math.min(LOOT_MULT_CAP, Math.round(lootMultiplier * 100) / 100)),
    pushes,
    silences,
    fates: input.copies.map((copy) => fates.get(copy.id)!),
    fragments: Math.min(FRAGMENT_CAP, fragments),
    comp,
    rescued,
    cleansed,
    events,
  };
}

/** The consent line for a launch card: which of the picked cards can be
 *  hurt on this route, and how badly. */
export function consentLine(tier: ExpeditionTierKey, copies: CardCopy[], insured: boolean): string {
  const def = EXPEDITION_TIERS[tier];
  const risk = insured ? (def.risk === "dead" ? "lost" : def.risk === "lost" ? "wounded" : def.risk) : def.risk;
  if (risk === "none") return "Nothing on this run can hurt a card.";
  const names = copies.map((copy) => copy.playerName);
  const who = names.length === 0 ? "Every card you send" : names.join(", ");
  if (risk === "wounded") return `${who} can come home wounded: benched from expeditions and the Gauntlet for ${WOUNDED_HOURS / 24} days.`;
  if (risk === "lost") return `${who} can be lost here. A lost card has ${7} days to be rescued or ransomed, then it is gone for good.`;
  return `${who} can DIE on this route, for good, once the squad has pushed ${DEAD_NEEDS_PUSHES} forks. There is no rescue from dead.`;
}
