// The road: every place a route can pause (ROADS), the fixed road every
// tier walked before the road was drawn per run (FORKS), the draw that
// picks one place per checkpoint from the run's own seed (forksFor), and
// what the week's weather does to a place (underWeather, tollCost).
//
// Part of routes.ts, which re-exports it; see the rules there. This is the
// half of the road a browser may never hold — every checkpoint a squad has
// not reached is in ROADS (expeditionImports.test.ts).

import type { MutationKey } from "@/lib/cards/mutations";
import { mulberry32 } from "@/lib/expeditions/prng";
import { DROUGHT_GAMBLE, WATCH_TOLL, type WeatherKey } from "./weather";
import { EXPEDITION_TIERS, type ExpeditionTierKey } from "./config";
import { ROAD_RULES, TOLL_LOOT, type RoadRef } from "./forks";

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
  // Past the rift. Five checkpoints, two places each, every one of them
  // warned and dark: there is no safe way on this road, only the careful
  // one, and the careful one still haunts.
  mythic: [
    [
      {
        key: "unmade",
        title: "The unmade road",
        story: "The road stops being a road. Past here the ground is an idea the squad has to keep having. The Voidtouched one walks ahead as if it were paved.",
        pushLabel: "Follow the Voidtouched one",
        campLabel: "Wait for the road to come back",
        lootBonus: 0.4,
        pushRisk: { wounded: 0.15, lost: 0.1, dead: 0.1 },
        campRisk: { wounded: 0, haunted: 0.2 },
        pushReward: null,
        warned: true,
        dark: true,
        gamble: null,
      },
      {
        key: "stairwell",
        title: "The stairwell of hours",
        story: "A stair that goes down for a day and comes out an hour before the squad started climbing. Take it, or wait at the top until the hours catch up.",
        pushLabel: "Take the stair",
        campLabel: "Wait at the top",
        lootBonus: 0.45,
        pushRisk: { wounded: 0.2, lost: 0.1, dead: 0.1 },
        campRisk: { wounded: 0, haunted: 0.2 },
        pushReward: null,
        warned: true,
        dark: true,
        gamble: null,
      },
    ],
    [
      {
        key: "blackwater",
        title: "The blackwater",
        story: "A lake with no far shore and something patient in it. The squad can swim for the light on the water or walk the edge, which is longer than it looks and not always there.",
        pushLabel: "Swim for the light",
        campLabel: "Walk the edge",
        lootBonus: 0.45,
        pushRisk: { wounded: 0.15, lost: 0.15, dead: 0.15 },
        campRisk: { wounded: 0.1, haunted: 0.2 },
        pushReward: null,
        warned: true,
        dark: true,
        gamble: null,
      },
      {
        key: "orrery",
        title: "The orrery",
        story: "A room of turning spheres the size of houses. One of them is home. The squad can climb through the works while they turn, or wait for the gap.",
        pushLabel: "Climb through the works",
        campLabel: "Wait for the gap",
        lootBonus: 0.5,
        pushRisk: { wounded: 0.2, lost: 0.1, dead: 0.15 },
        campRisk: { wounded: 0.1, haunted: 0.2 },
        pushReward: null,
        warned: true,
        dark: true,
        gamble: null,
      },
    ],
    [
      {
        key: "hollow",
        title: "The hollow",
        story: "Where the singing comes from. A hollow in the world with a floor of eyes, all closed. Cross it while they are, or go round through the dark that is not dark.",
        pushLabel: "Cross while they sleep",
        campLabel: "Go round",
        lootBonus: 0.5,
        pushRisk: { wounded: 0.2, lost: 0.15, dead: 0.2 },
        campRisk: { wounded: 0, haunted: 0.3 },
        pushReward: null,
        warned: true,
        dark: true,
        gamble: null,
      },
      {
        key: "cathedral",
        title: "The cathedral of teeth",
        story: "A nave that is a mouth, and it is open. The altar is at the back. The squad can walk the length of it, or wait in the porch and pray it does not close.",
        pushLabel: "Walk the nave",
        campLabel: "Wait in the porch",
        lootBonus: 0.55,
        pushRisk: { wounded: 0.2, lost: 0.15, dead: 0.2 },
        campRisk: { wounded: 0.1, haunted: 0.25 },
        pushReward: null,
        warned: true,
        dark: true,
        gamble: null,
      },
    ],
    [
      {
        key: "eclipse",
        title: "The eclipse",
        story: "The one star goes out. In the dark something asks each of the squad a question, and the Voidtouched one answers for them or does not. Push, and go and see what asked.",
        pushLabel: "Go and see what asked",
        campLabel: "Let the Voidtouched one answer",
        lootBonus: 0.55,
        pushRisk: { wounded: 0.2, lost: 0.2, dead: 0.2 },
        campRisk: { wounded: 0, haunted: 0.3 },
        pushReward: null,
        warned: true,
        dark: true,
        gamble: null,
      },
      {
        key: "glassthrone",
        title: "The throne of glass",
        story: "An empty throne, and it is warm. Whoever sits in it sees the way home and something else. The squad can put someone on it, or leave it empty and take the long way.",
        pushLabel: "Put someone on the throne",
        campLabel: "Leave it empty",
        lootBonus: 0.6,
        pushRisk: { wounded: 0.2, lost: 0.15, dead: 0.25 },
        campRisk: { wounded: 0.1, haunted: 0.25 },
        pushReward: null,
        warned: true,
        dark: true,
        gamble: null,
      },
    ],
    [
      {
        key: "farshore",
        title: "The far shore",
        story: "The way back, and it is a shore, and the sea between is the same blackwater. The squad can swim it with everything they carry, or leave half of it on the sand and wade.",
        pushLabel: "Swim with everything",
        campLabel: "Wade with half",
        lootBonus: 0.6,
        pushRisk: { wounded: 0.2, lost: 0.2, dead: 0.3 },
        campRisk: { wounded: 0.1, haunted: 0.2 },
        pushReward: null,
        warned: true,
        dark: true,
        gamble: null,
        toll: 0.5,
      },
      {
        key: "lastdoor",
        title: "The last door",
        story: "A door with the squad's own camp painted on it, badly. Open it, and it is either home or a painting of home. Or wait beside it until it opens on its own, which it will, once.",
        pushLabel: "Open it",
        campLabel: "Wait for it to open",
        lootBonus: 0.65,
        pushRisk: { wounded: 0.2, lost: 0.2, dead: 0.3 },
        campRisk: { wounded: 0, haunted: 0.3 },
        pushReward: null,
        warned: true,
        dark: true,
        gamble: null,
      },
    ],
  ],
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
  return ROADS[tier].slice(0, count).map((slot, index) => {
    const drawn = slot[Math.min(slot.length - 1, Math.floor(rand() * slot.length))];
    const wanted = road.places?.[index];
    return (wanted && slot.find((fork) => fork.key === wanted)) || drawn;
  });
}

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
