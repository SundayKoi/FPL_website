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
//  10. Every card's title is an edge (ARCHETYPE_RULES, archetypes.ts): one
//      edge of each kind counts per squad, fixed at launch, and each bends
//      the road in one named place — a guard softens a harm roll, a camp
//      edge pays for the night, a finale edge settles the bag. A card that
//      dies takes its edge with it from that point. The base camp's tent
//      is read here too, under the same rulebook.

import type { MutationKey } from "@/lib/cards/mutations";
import { FALLBACK_ARCHETYPE } from "@/lib/cards/build";
import { mulberry32 } from "@/lib/expeditions/prng";
import { isVeteran, milesOf } from "./trail";
import { DROUGHT_GAMBLE, WATCH_TOLL, type WeatherKey } from "./weather";
import {
  ARCHETYPE_ABILITIES,
  ARCHETYPE_RULES,
  ASSASSIN_DEEP,
  CLUTCH_HARM,
  COINFLIP_SWING,
  CONDUCTOR_DEATH,
  CONDUCTOR_STREAK,
  EDGE,
  EDGE_BIG,
  EDGE_SMALL,
  FREE_WIN_LOSE,
  FRONTLINE_DEEP,
  GANK_WIN_MULT,
  GLASS_CANNON_HARM,
  HEATER_STREAK,
  HIGHLIGHT_REWARD,
  HYPERCARRY_LAST,
  ISLAND_HOLD,
  ISLAND_HOLDS,
  JUGGERNAUT_WOUND,
  LANE_BULLY_BONUS,
  LIFELINE_BENCH_HOURS,
  LIFELINE_RESCUE,
  PLATE_TOLL,
  POKE_CAMP_WOUND,
  POSITIONING_HARM,
  POWER_FARMER_CAMP,
  SKIRMISH_HARM,
  SPACE_HAUNT,
  STREAK_CAP,
  SURGEON_WOUND,
  TURRET_FINDS,
  UNDERDOG_MARGIN,
  WAVE_CAMP_WOUND,
  WEAKSIDE_HARM,
  activeAbilities,
} from "./archetypes";
import {
  EXPEDITION_TIERS,
  LOOT_MULT_CAP,
  WOUNDED_HOURS,
  isProtected,
  shineOf,
  squadShine,
  type CardCopy,
  type ExpeditionTierKey,
  type OutcomeGrade,
} from "./config";

// The client-safe half of the road — the words at a fork, the clock, the
// role calls, the route sizes, the numbers the rules page quotes, the
// consent line — lives in forks.ts so the board can hold it without
// holding ROADS. Re-exported here so every server caller keeps importing
// it from routes.ts as before.
import {
  CACHE_LOOT,
  CURSED_AGAIN_LOST,
  DEAD_NEEDS_PUSHES,
  FRAGMENT_CHANCE,
  GHOST_HAUNT,
  GHOST_HAUNT_FLOOR,
  HOLD_LOOT,
  MOMENTUM_BONUS,
  MOMENTUM_DEATH,
  RIVAL_LOSS_LOOT,
  RIVAL_WIN_LOOT,
  ROAD_RULES,
  ROLE_CALLS,
  ROLE_CALL_BY_CHOICE,
  SCOUTED_CAMP_RISK,
  SHRINE_RISK,
  TOLL_LOOT,
  VETERAN_HOLD_LOOT,
  VETERAN_TEASE,
  isCampChoice,
  isRoleCall,
  type ForkChoice,
  type ForkEdge,
  type ForkOption,
  type RoadRef,
  type RoleCall,
} from "./forks";
export {
  CACHE_LOOT,
  COMPANY_RULES,
  CURSED_AGAIN_LOST,
  DEAD_NEEDS_PUSHES,
  FORK_CHOICES,
  FRAGMENT_CHANCE,
  GHOST_HAUNT,
  GHOST_HAUNT_FLOOR,
  HOLD_LOOT,
  // The trail's numbers are journal.ts' (and re-exported there); here too so
  // every name forks.ts exports is also routes.ts', binding for binding.
  HUNTER_FRAGMENT_CHANCE,
  MOMENTUM_BONUS,
  MOMENTUM_DEATH,
  MUTATION_SOURCES,
  RIVAL_LOSS_LOOT,
  RIVAL_WIN_LOOT,
  ROAD_ENCOUNTER_CHANCE,
  ROAD_RULES,
  ROAD_SIZES,
  ROLE_CALLS,
  ROLE_CALL_BY_CHOICE,
  SCOUTED_CAMP_RISK,
  SHRINE_RISK,
  STORM_HOURS,
  STRANDED_BOUNTY,
  TOLL_LOOT,
  VETERAN_HOLD_LOOT,
  VETERAN_TEASE,
  choiceSheet,
  consentLine,
  forkViews,
  forkWindows,
  isCampChoice,
  isRoleCall,
  openFork,
} from "./forks";
export type {
  ForkChoice,
  ForkEdge,
  ForkOption,
  ForkStatus,
  ForkView,
  ForkWindow,
  MutationSource,
  RecordedChoice,
  RoadRef,
  RoleCall,
  RoleCallDef,
} from "./forks";

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

// === edges ===================================================================

/**
 * The titles the road reads (archetypes.ts), by the name the code calls
 * them. A title is a prose string on a frozen card; a typo here would be an
 * edge that quietly never fires, so routes.test.ts holds every value to a
 * key of ARCHETYPE_ABILITIES. The clocks, the reveals, Roam Enjoyer and
 * First Blood Merchant are not here: they change what the road IS, and
 * traitsOf reads them before a single fork is walked.
 */
export const EDGE_TITLE = {
  pentakill: "Pentakill Machine",
  heater: "On A Heater",
  glassCannon: "Glass Cannon",
  surgeon: "The Surgeon",
  highlight: "Highlight Reel",
  coinflip: "Coinflip Gamer",
  bornWinner: "Born Winner",
  clutch: "Clutch Gene",
  anchor: "The Anchor",
  veteran: "The Veteran",
  underdog: "The Underdog",
  ice: "Ice In The Veins",
  farmDemon: "Farm Demon",
  laneBully: "Lane Bully",
  goldHoarder: "Gold Hoarder",
  plate: "Plate Collector",
  wave: "Wave Manager",
  freeWin: "Free Win Lane",
  islandKing: "Island King",
  splitPusher: "Split Pusher",
  weakside: "Weakside Warrior",
  unkillable: "Unkillable",
  juggernaut: "The Juggernaut",
  powerFarmer: "Power Farmer",
  gank: "Gank Squad",
  counterJungler: "Counter Jungler",
  campThief: "Camp Thief",
  conductor: "Tempo Conductor",
  roamingThreat: "Roaming Threat",
  priorityMerchant: "Priority Merchant",
  burstMage: "Burst Mage",
  assassin: "The Assassin",
  hypercarry: "The Hypercarry",
  positioning: "Positioning God",
  lateGame: "Late Game Insurance",
  turret: "Turret Melter",
  silentCarry: "Silent Carry",
  bodyguard: "The Bodyguard",
  engage: "The Engage",
  lifeline: "The Lifeline",
  poke: "Poke Support",
  visionDenier: "Vision Denier",
  sacrificial: "Sacrificial Play",
  playmaker: "Playmaker",
  enabler: "The Enabler",
  frontline: "The Frontline",
  space: "Space Creator",
  duelist: "Duelist",
  executioner: "Executioner",
  skirmish: "Skirmish King",
  jack: FALLBACK_ARCHETYPE,
} as const;

type EdgeTitle = (typeof EDGE_TITLE)[keyof typeof EDGE_TITLE];

/** The edges that take the hit for a squadmate: the first victim drawn is
 *  replaced by the front card, without a draw. Split Pusher is the front
 *  edge that does the opposite, and is read on its own. */
const TAKERS: EdgeTitle[] = [EDGE_TITLE.juggernaut, EDGE_TITLE.bodyguard, EDGE_TITLE.sacrificial, EDGE_TITLE.frontline];

/** The edges that ignore a card's first harm. Unkillable ignores any; the
 *  other two a wound only. Each covers its own card. */
const SHIELDS: EdgeTitle[] = [EDGE_TITLE.unkillable, EDGE_TITLE.anchor, EDGE_TITLE.bodyguard];

/** A percentage as the page prints one: 0.15 is "15". */
const pctOf = (n: number): number => Math.round(n * 100);

/** Who counts, by title, under a run's rulebook: nothing below
 *  ARCHETYPE_RULES. Title → copy id. */
function countedEdges(copies: Pick<CardCopy, "id" | "card">[], rules: number): Map<string, number> {
  return new Map(rules >= ARCHETYPE_RULES ? activeAbilities(copies).map((entry) => [entry.ability.title, entry.copyId] as const) : []);
}

// === who can make a call =====================================================

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

/** A copy as the fork buttons read it: the prints for favour/light/rally,
 *  the role for the calls, the id, name and title for the edges. */
type ForkSquad = Pick<CardCopy, "id" | "playerName" | "signed" | "foil" | "card" | "role">[];

/**
 * The choices at one fork, for this squad, given what has already been
 * spent. Everything is listed — locked options say why — so the page
 * teaches what a signed card or a full roster would have bought. The role
 * calls are listed too, and only under a road (ROAD_RULES): a run that
 * left before they existed never hears of them. Under ARCHETYPE_RULES each
 * open option says what the squad's edges do to it, and an Island King
 * keeps the hold open for a second night.
 */
export function forkOptions(
  tier: ExpeditionTierKey,
  index: number,
  copies: ForkSquad,
  earlier: (ForkChoice | null)[],
  road?: RoadRef | null,
  weather?: WeatherKey | null,
): ForkOption[] {
  const walked = forksFor(tier, road);
  const drawn = walked[index];
  if (!drawn) return [];
  const fork = underWeather(drawn, weather);
  const counted = countedEdges(copies, road?.rules ?? 0);
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
      tease: `Push for double the loot at 50% more risk. Three from one team.`,
      locked: !abilities.rally ? "Needs three cards from one roster." : null,
    },
  ];
  if (road && road.rules >= ROAD_RULES) {
    // Island King: a Top may hold twice. Read off the launch squad's sheet,
    // as the resolver reads it.
    const holds = counted.has(EDGE_TITLE.islandKing) ? ISLAND_HOLDS : 1;
    for (const call of ROLE_CALLS) {
      // A gamble fork has no harm to shape and no camp worth holding: the
      // scouting run's fork is a coin flip, and a role call is not a coin.
      const members = inRole(copies, call.role) as CardCopy[];
      const present = members.length > 0;
      // The Veteran gives the shape, not the miles: its call is sharp when
      // it is the one making it — the member of the role with the most miles.
      const titled = present && counted.get(EDGE_TITLE.veteran) === caller(members, call.role)?.id;
      const veteran = present && (members.some((member) => isVeteran(member)) || titled);
      const spent = earlier.filter((choice) => choice === call.choice).length >= (call.choice === "hold" ? holds : 1);
      options.push({
        choice: call.choice,
        label: call.label,
        tease: veteran ? `${call.tease} ${VETERAN_TEASE[call.choice]}` : call.tease,
        role: call.role,
        locked: fork.gamble
          ? "Not on a coin flip."
          : !present
            ? `Needs a ${call.role} in the squad.`
            : spent
              ? "Already spent on this run."
              : null,
      });
    }
  }
  if (counted.size === 0) return options;
  return options.map((option) => {
    if (option.locked !== null) return option;
    const edges = edgeNotes(option.choice, { tier, index, fork, walked, earlier, counted, copies });
    if (edges.length === 0) return option;
    return { ...option, tease: `${option.tease} ${edges.map((note) => note.line).join(" ")}`, baseTease: option.tease, edges };
  });
}

/**
 * What the squad's counting edges do to one choice at one fork, in the
 * resolver's own terms: the page says here what the claim will do there.
 * Only what can be known before the claim — a death mid-run or a ghost on
 * the leg is the road's to reveal — so a line reads "if nobody is hurt"
 * where the resolver waits to see.
 */
function edgeNotes(
  choice: ForkChoice,
  ctx: {
    tier: ExpeditionTierKey;
    index: number;
    fork: ForkDef;
    walked: ForkDef[];
    earlier: (ForkChoice | null)[];
    counted: Map<string, number>;
    copies: ForkSquad;
  },
): ForkEdge[] {
  const { index, fork, walked, earlier, counted, copies } = ctx;
  const notes: ForkEdge[] = [];
  const nameOf = (id: number) => copies.find((copy) => copy.id === id)?.playerName ?? "that card";
  const note = (title: EdgeTitle, sentence: (name: string) => string) => {
    const id = counted.get(title);
    if (id === undefined) return;
    notes.push({ title, kind: ARCHETYPE_ABILITIES[title].kind, copyId: id, line: `${title}: ${sentence(nameOf(id))}` });
  };
  const last = index === walked.length - 1;
  const gambles = walked.some((slot) => slot.gamble);

  if (choice === "hold") {
    note(EDGE_TITLE.islandKing, () => `+${pctOf(ISLAND_HOLD)}% on top of the hold, and a Top may hold ${ISLAND_HOLDS === 2 ? "twice" : `${ISLAND_HOLDS} times`} this run.`);
    return notes;
  }

  if (choice === "camp") {
    const risky = fork.campRisk.wounded > 0 || fork.campRisk.haunted > 0;
    if (index === 0 && !gambles && risky) note(EDGE_TITLE.freeWin, () => "nothing at this first camp can touch the squad.");
    if (fork.campRisk.wounded > 0) {
      note(EDGE_TITLE.poke, () => "nobody is wounded at this camp.");
      note(EDGE_TITLE.wave, () => `camp wound rolls ×${WAVE_CAMP_WOUND}.`);
      for (const title of SHIELDS) note(title, (name) => `the first wound on ${name} is ignored.`);
    }
    if (fork.campRisk.haunted > 0) {
      note(EDGE_TITLE.space, () => `haunting rolls ×${SPACE_HAUNT}.`);
      note(EDGE_TITLE.silentCarry, (name) => `${name} never comes home Haunted.`);
    }
    if (fork.toll) {
      note(EDGE_TITLE.priorityMerchant, () => "the toll is waived.");
      note(EDGE_TITLE.plate, () => `the toll costs ×${PLATE_TOLL}.`);
    }
    if (fork.campReward) note(EDGE_TITLE.highlight, () => `the chance to come home ${fork.campReward!.mutation} ×${HIGHLIGHT_REWARD}.`);
    note(EDGE_TITLE.farmDemon, () => `+${pctOf(EDGE_SMALL)}% for the night.`);
    note(EDGE_TITLE.powerFarmer, () => `+${pctOf(POWER_FARMER_CAMP)}% for the night.`);
    return notes;
  }

  // Every other choice is a push. On a coin flip the loot edges ride the
  // win: they add to a bag the flip filled, and a lost flip pays none.
  const unsafe = fork.campRisk.wounded > 0 || fork.campRisk.haunted > 0 || Boolean(fork.toll);
  const ifWin = fork.gamble ? " if the flip lands" : "";
  if (fork.gamble) {
    note(EDGE_TITLE.coinflip, () => `the swing doubles both ways: +${pctOf(fork.lootBonus * COINFLIP_SWING)}% or −${pctOf(fork.gamble!.down * COINFLIP_SWING)}%.`);
    note(EDGE_TITLE.freeWin, () => `the chance of losing is ${pctOf(FREE_WIN_LOSE)}% lower.`);
  }
  note(EDGE_TITLE.glassCannon, (name) => `+${pctOf(EDGE_SMALL)}%${ifWin}${fork.gamble ? "" : `, and harm on ${name} ×${GLASS_CANNON_HARM}`}.`);
  if (index === 0 && fork.lootBonus > 0) note(EDGE_TITLE.laneBully, () => `this bonus ×${LANE_BULLY_BONUS}${ifWin}.`);
  if (last && fork.lootBonus > 0) note(EDGE_TITLE.hypercarry, () => `this bonus ×${HYPERCARRY_LAST}${ifWin}.`);
  if (fork.dark) note(EDGE_TITLE.burstMage, () => `+${pctOf(EDGE)}% at a dark fork${ifWin}.`);
  if (unsafe) note(EDGE_TITLE.engage, () => `+${pctOf(EDGE)}%: nobody camps here safely${ifWin}.`);
  if (isRoleCall(choice)) note(EDGE_TITLE.playmaker, () => `+${pctOf(EDGE_SMALL)}% on a role call.`);
  if (fork.warned) note(EDGE_TITLE.duelist, () => `+${pctOf(EDGE)}% at a warned fork.`);
  note(EDGE_TITLE.pentakill, () => `+${pctOf(EDGE_BIG)}% if nobody is hurt, the first time this run.`);
  note(EDGE_TITLE.executioner, () => `+${pctOf(EDGE_SMALL)}% if nobody is hurt.`);
  if (fork.gamble) return notes;

  // Momentum: the pushes in a row just behind this fork, as the sheet
  // stands. A silence camps, and lets it go.
  let streak = 0;
  for (let at = index - 1; at >= 0; at -= 1) {
    const said = earlier[at] ?? null;
    if (said === null || isCampChoice(said)) break;
    streak += 1;
  }
  const heat = Math.min(streak, STREAK_CAP);
  if (heat > 0) {
    const behind = `${heat} push${heat === 1 ? "" : "es"} in a row behind you`;
    note(EDGE_TITLE.heater, () => `+${pctOf(HEATER_STREAK * heat)}%, ${behind}.`);
    note(EDGE_TITLE.conductor, () => `+${pctOf(CONDUCTOR_STREAK * heat)}%, ${behind}${ctx.tier === "mythic" ? "; the death roll climbs at half the rate" : ""}.`);
  }
  if (!gambles && fork.lootBonus > 0 && earlier.slice(0, index).every((said) => said === null || isCampChoice(said))) {
    note(EDGE_TITLE.coinflip, () => "the run's first push is a coin: heads pays the bonus twice, tails pays none.");
  }
  if (fork.pushFind?.comp) note(EDGE_TITLE.turret, () => `the chance of a free pack ×${TURRET_FINDS}.`);
  if (fork.pushReward) note(EDGE_TITLE.highlight, () => `the chance to bring home ${fork.pushReward!.mutation} ×${HIGHLIGHT_REWARD}.`);
  if (isRoleCall(choice)) {
    const veteran = counted.get(EDGE_TITLE.veteran);
    const making = caller(inRole(copies, ROLE_CALL_BY_CHOICE[choice].role) as CardCopy[], ROLE_CALL_BY_CHOICE[choice].role);
    if (veteran !== undefined && making?.id === veteran && !isVeteran(making)) note(EDGE_TITLE.veteran, (name) => `${name} makes this call like a Veteran.`);
  }

  // The harm, where there is any to shape. A favour carries none.
  const shaped = PUSH_SHAPE[choice as Exclude<ForkChoice, "camp" | "hold">];
  const harmful = shaped.risk > 0 && fork.pushRisk.wounded + fork.pushRisk.lost + fork.pushRisk.dead > 0;
  if (!harmful) return notes;
  const deep = fork.pushRisk.lost + fork.pushRisk.dead > 0;
  if (choice === "roam") note(EDGE_TITLE.roamingThreat, () => "the harm is rolled on one card, not two.");
  if (last) note(EDGE_TITLE.clutch, () => `the last fork's harm ×${CLUTCH_HARM}.`);
  if (fork.warned) {
    note(EDGE_TITLE.skirmish, () => `harm here ×${SKIRMISH_HARM}.`);
    note(EDGE_TITLE.ice, (name) => `the curse never sticks to ${name}.`);
  }
  if (fork.pushRisk.wounded > 0) note(EDGE_TITLE.surgeon, () => `wound rolls ×${SURGEON_WOUND}.`);
  note(EDGE_TITLE.weakside, (name) => `harm on ${name} ×${WEAKSIDE_HARM}.`);
  note(EDGE_TITLE.positioning, (name) => `harm on ${name} ×${POSITIONING_HARM}.`);
  if (deep) note(EDGE_TITLE.assassin, (name) => `lost and dead rolls on ${name} ×${ASSASSIN_DEEP}.`);
  note(EDGE_TITLE.unkillable, (name) => `the first harm on ${name} is ignored.`);
  if (fork.pushRisk.wounded > 0) note(EDGE_TITLE.anchor, (name) => `the first wound on ${name} is ignored.`);
  // The Jungle who scouts goes in first by choice: no front stands in
  // front of a scout.
  if (choice !== "scout") {
    note(EDGE_TITLE.splitPusher, (name) => `harm never lands on ${name} while another card can take it.`);
    note(EDGE_TITLE.juggernaut, (name) => `${name} takes the hit for a squadmate, and wound rolls on it ×${JUGGERNAUT_WOUND}.`);
    note(EDGE_TITLE.bodyguard, (name) => `${name} takes the hit for a squadmate, and its first wound is ignored.`);
    note(EDGE_TITLE.sacrificial, (name) => `${name} takes the hit for a squadmate, and +${pctOf(EDGE_BIG)}% when it does.`);
    note(EDGE_TITLE.frontline, (name) => `${name} takes the hit for a squadmate, and lost and dead rolls on it ×${FRONTLINE_DEEP}.`);
  }
  return notes;
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
  copies: ForkSquad,
  earlier: (ForkChoice | null)[],
  road?: RoadRef | null,
  weather?: WeatherKey | null,
): boolean {
  return forkOptions(tier, index, copies, earlier, road, weather).some((option) => option.choice === choice && option.locked === null);
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
  /** The title whose edge (archetypes.ts) made this happen, so the
   *  ceremony can list the edges that fired. Absent on every other event,
   *  and on every run stamped below ARCHETYPE_RULES. */
  ability?: string;
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

// What the trail's beats do to the multiplier (CACHE_LOOT, RIVAL_WIN_LOOT,
// RIVAL_LOSS_LOOT, SHRINE_RISK, GHOST_HAUNT, GHOST_HAUNT_FLOOR) lives in
// forks.ts with the other numbers the rules page quotes.

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
  /** The collector's base camp as it stands at the claim — only the tent
   *  touches resolution, and only under ARCHETYPE_RULES. Absent or null
   *  reads as no camp. */
  camp?: { tent: number } | null;
  /** The squad's shine as the run froze it at launch (The Underdog reads
   *  it). Omitted, it is read off the copies. */
  shine?: number;
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

/** A second survivor comes home Voidtouched this often; the first always. */
export const VOIDTOUCHED_SECOND_CHANCE = 0.25;

// Momentum (MOMENTUM_BONUS, MOMENTUM_DEATH) and CURSED_AGAIN_LOST: forks.ts.

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

/** A roll as decide() makes it, keeping the number drawn: null when the
 *  chance settled it without drawing. */
type Roll = { hit: boolean; value: number | null };

function roll(chance: number, rand: () => number): Roll {
  if (chance <= 0) return { hit: false, value: null };
  if (chance >= 1) return { hit: true, value: null };
  const value = rand();
  return { hit: value < chance, value };
}

/** Whether an edge decided a roll that landed: at `base` it would have
 *  missed. Unknowable, and so false, when nothing was drawn. */
function edgeLanded(outcome: Roll, base: number): boolean {
  return outcome.hit && outcome.value !== null && outcome.value >= base;
}

/** Whether an edge decided a roll that missed: at `base` it would have
 *  landed. */
function edgeSpared(outcome: Roll, base: number): boolean {
  return !outcome.hit && outcome.value !== null && outcome.value < base;
}

const FATE_WORD: Record<CardFateKind, string> = { home: "scratch", wounded: "wound", lost: "loss", dead: "death" };

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
 *
 * Edges (ARCHETYPE_RULES) add one draw of their own: Coinflip Gamer's coin
 * on the run's first push, on a road with no coin flip — the LAST draw of
 * that fork, after its find. Everything else an edge does moves a chance
 * that was already rolled (a guard's scale, a camp edge's, Free Win Lane's
 * lose chance), narrows a pool that was already drawn from (Split Pusher,
 * Roaming Threat), or changes what an existing draw landed on (a front, a
 * shield, the tent, Silent Carry) — and a chance moved to 0 or 1 settles
 * without drawing, as every chance here does. Below ARCHETYPE_RULES none
 * of it exists, so a run stamped 5 draws, and says, exactly what it did.
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

  // The edges (archetypes.ts), under ARCHETYPE_RULES only. The sheet is the
  // launch squad's, read once: a card that dies takes its edge with it from
  // that point, and the same-kind edge it outranked stays ignored — the
  // picker told the player which edges count, and that stays true all run.
  const rules = input.road?.rules ?? 0;
  const counted = countedEdges(input.copies, rules);
  /** The copy whose counting edge is `title`, while it lives; else null. */
  const edge = (title: EdgeTitle): number | null => {
    const id = counted.get(title);
    return id !== undefined && fates.get(id)!.fate !== "dead" ? id : null;
  };
  // The base camp's tent, under the same rulebook: level 1 takes the first
  // camp wound or haunting that would land, level 2 the first toll too.
  const tent = rules >= ARCHETYPE_RULES ? Math.max(0, Math.min(2, Math.floor(input.camp?.tent ?? 0))) : 0;
  let tentHeld = false;
  let tentTolled = false;
  const takeTent = (): boolean => {
    if (!(tent >= 1) || tentHeld) return false;
    tentHeld = true;
    return true;
  };
  // A wound that lands while The Lifeline lives benches for less.
  const shortBench = new Set<number>();
  const benched = (id: number) => {
    if (edge(EDGE_TITLE.lifeline) !== null) shortBench.add(id);
    else shortBench.delete(id);
  };
  // Each shield covers its own card's first harm, once.
  const shielded = new Set<number>();
  function shieldFor(id: number, kind: CardFateKind): EdgeTitle | null {
    if (shielded.has(id)) return null;
    const title = SHIELDS.find((shield) => edge(shield) === id && (shield === EDGE_TITLE.unkillable || kind === "wounded")) ?? null;
    if (title !== null) shielded.add(id);
    return title;
  }
  /** What the edges do to the harm rolled on one card at one fork: the
   *  wound roll's scale, the lost and dead rolls' scale, and the edge that
   *  cut deepest — named when the cut decided the roll. A push's harm
   *  only: at a camp the roll is made before a card is drawn, so no card's
   *  own scale could reach it, and a camp's wound is the camp edges'. */
  function harmScale(id: number, fork: ForkDef, last: boolean): { wound: number; deep: number; by: EdgeTitle | null } {
    // [edge, wound ×, lost-and-dead ×, only when the harm is on its own card]
    const cuts: [EdgeTitle, number, number, boolean][] = [
      [EDGE_TITLE.surgeon, SURGEON_WOUND, 1, false],
      [EDGE_TITLE.weakside, WEAKSIDE_HARM, WEAKSIDE_HARM, true],
      [EDGE_TITLE.positioning, POSITIONING_HARM, POSITIONING_HARM, true],
      [EDGE_TITLE.assassin, 1, ASSASSIN_DEEP, true],
      [EDGE_TITLE.juggernaut, JUGGERNAUT_WOUND, 1, true],
      [EDGE_TITLE.frontline, 1, FRONTLINE_DEEP, true],
      [EDGE_TITLE.glassCannon, GLASS_CANNON_HARM, GLASS_CANNON_HARM, true],
    ];
    if (last) cuts.push([EDGE_TITLE.clutch, CLUTCH_HARM, CLUTCH_HARM, false]);
    if (fork.warned) cuts.push([EDGE_TITLE.skirmish, SKIRMISH_HARM, SKIRMISH_HARM, false]);
    let wound = 1;
    let deep = 1;
    let by: EdgeTitle | null = null;
    let deepest = 1;
    for (const [title, onWound, onDeep, own] of cuts) {
      const holder = edge(title);
      if (holder === null || (own && holder !== id)) continue;
      wound *= onWound;
      deep *= onDeep;
      if (Math.min(onWound, onDeep) < deepest) {
        deepest = Math.min(onWound, onDeep);
        by = title;
      }
    }
    return { wound, deep, by };
  }

  function harm(id: number, kind: CardFateKind) {
    const fate = fates.get(id)!;
    // One-of-ones cannot board a route that loses them, but the ceiling is
    // enforced here too: a rule that lives only in the gate is a rule one
    // missed check away from being nothing.
    const copy = input.copies.find((c) => c.id === id);
    const capped = copy && isProtected(copy) && FATE_RANK[kind] > FATE_RANK.wounded ? "wounded" : kind;
    if (FATE_RANK[capped] > FATE_RANK[fate.fate]) {
      fate.fate = capped;
      if (capped === "wounded") benched(id);
    }
  }
  function mutate(id: number, key: MutationKey): boolean {
    const fate = fates.get(id)!;
    const copy = input.copies.find((c) => c.id === id);
    if (fate.fate === "dead" || fate.mutation || copy?.card?.mutation) return false;
    fate.mutation = key;
    return true;
  }
  /** The second stage: a Voidtouched card that comes home from the Mythic
   *  route is Voidborn — the one mutation that replaces another. */
  function ascend(id: number): boolean {
    const fate = fates.get(id)!;
    const copy = input.copies.find((c) => c.id === id);
    if (fate.fate === "dead" || fate.mutation || copy?.card?.mutation?.key !== "voidtouched") return false;
    fate.mutation = "voidborn";
    return true;
  }

  let lootMultiplier = 1;
  let pushes = 0;
  // Momentum (the Mythic route, and the momentum edges): consecutive pushes so far.
  let streak = 0;
  let silences = 0;
  let favourSpent = false;
  let fragments = 0;
  let comp = false;
  const callsSpent = new Set<RoleCall>();
  let holdsCalled = 0;
  // What the run remembers of itself between forks.
  let tollPaid = false;
  let scouted = false;
  // Pentakill Machine pays once; The Enabler once.
  let cleanPaid = false;
  let enabled = false;
  const gambles = forks.some((fork) => fork.gamble !== null);

  /** An edge's event. The first one from any edge but its own pays The
   *  Enabler, while it lives. */
  function fire(event: RouteEvent & { ability: string }) {
    events.push(event);
    if (enabled || event.ability === EDGE_TITLE.enabler) return;
    const enabler = edge(EDGE_TITLE.enabler);
    if (enabler === null) return;
    enabled = true;
    lootMultiplier += EDGE_SMALL;
    events.push({ fork: event.fork, tone: "good", text: `The Enabler: ${nameOf(enabler)} set that up. +${pctOf(EDGE_SMALL)}%.`, ability: EDGE_TITLE.enabler });
  }
  /** An edge that moves the bag: `amount` on the multiplier, and its line,
   *  when the edge counts and its card lives. */
  function pay(title: EdgeTitle, amount: number, fork: number | null, text: (name: string) => string) {
    const id = edge(title);
    if (id === null) return;
    lootMultiplier += amount;
    fire({ fork, tone: amount >= 0 ? "good" : "bad", text: `${title}: ${text(nameOf(id))}`, ability: title });
  }

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
      // The rival edges move THIS run's bag, never the verdict: the other
      // squad's journal still says what it always said.
      const them = encounter.rivalName ? `${encounter.rivalName}'s squad` : "the rival squad";
      const gank = RIVAL_WIN_LOOT * (GANK_WIN_MULT - 1);
      if (encounter.won) pay(EDGE_TITLE.gank, gank, null, (name) => `${name} made ${them} pay for it — the win paid double. +${pctOf(gank)}%.`);
      else pay(EDGE_TITLE.bornWinner, RIVAL_LOSS_LOOT, null, (name) => `${name} would not hear of losing — the spot cost the squad nothing.`);
      pay(EDGE_TITLE.campThief, EDGE_BIG, null, (name) => `won or lost, ${name} came back with the rival's cache. +${pctOf(EDGE_BIG)}%.`);
    } else if (encounter.key === "ghost" && encounter.ghost?.stood) {
      lootMultiplier += CACHE_LOOT;
      events.push({ fork: null, tone: "good", text: `${encounter.ghost.name}'s ghost knew the squad's colours and stood aside; under the cairn where it stood, a cache.` });
    } else if (encounter.key === "ghost" && encounter.ghost) {
      ghosts.add(encounter.leg);
      const ghost = encounter.ghost.name;
      pay(EDGE_TITLE.counterJungler, EDGE_BIG, null, (name) => `${name} found where ${ghost}'s ghost kept its cache. +${pctOf(EDGE_BIG)}%, and it will not double the haunting.`);
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
      // Island King: a Top may hold twice, while the King lives.
      const spent = choice === "hold" && edge(EDGE_TITLE.islandKing) !== null ? holdsCalled >= ISLAND_HOLDS : callsSpent.has(choice);
      if (!roleCalls || fork.gamble || spent || inRole(alive(), call.role).length === 0) choice = "camp";
      else {
        callsSpent.add(choice);
        if (choice === "hold") holdsCalled += 1;
      }
    }
    if (choice === "favour") favourSpent = true;

    // What the last fork left behind, read once and spent here.
    const passage = tollPaid;
    const knowing = scouted;
    tollPaid = false;
    scouted = false;
    const place = fork.title.toLowerCase();

    if (choice === "hold") {
      streak = 0;
      // A Top on the checkpoint: the safe way with nothing that makes the
      // safe way unsafe — no wound, no haunting, no toll — and a little
      // more in the bag for the night's work. A Veteran Top holds for more.
      const top = caller(alive(), "Top");
      // The Veteran gives the shape, not the miles.
      const titled = top !== undefined && !isVeteran(top) && edge(EDGE_TITLE.veteran) === top.id;
      lootMultiplier += top && (isVeteran(top) || titled) ? VETERAN_HOLD_LOOT : HOLD_LOOT;
      events.push({ fork: index, tone: "good", text: `${fork.title}: ${top ? nameOf(top.id) : "the Top"} held the checkpoint alone all night, and the squad kept everything.` });
      if (titled && top) fire({ fork: index, tone: "good", text: `The Veteran: ${nameOf(top.id)} held it like a Veteran. +${pctOf(VETERAN_HOLD_LOOT - HOLD_LOOT)}% more.`, ability: EDGE_TITLE.veteran });
      pay(EDGE_TITLE.islandKing, ISLAND_HOLD, index, (name) => `${name} ruled the island at ${place}. +${pctOf(ISLAND_HOLD)}%.`);
      return;
    }

    if (choice === "camp") {
      streak = 0;
      // A scout at the last fork means the squad knows where not to camp
      // at this one: both camp risks are halved.
      const campScale = knowing ? SCOUTED_CAMP_RISK : 1;
      if (knowing && (fork.campRisk.wounded > 0 || fork.campRisk.haunted > 0)) {
        events.push({ fork: index, tone: "neutral", text: `${fork.title}: the Jungle's scouting held — the squad knew where not to sleep.` });
      }
      const ghostHere = ghosts.has(index);
      // Free Win Lane: on a road with no coin flip, the first night is free.
      const freeNight = index === 0 && !gambles && edge(EDGE_TITLE.freeWin) !== null;
      if (freeNight && (fork.campRisk.wounded > 0 || fork.campRisk.haunted > 0 || ghostHere)) {
        pay(EDGE_TITLE.freeWin, 0, index, (name) => `${name} knew this ground — nothing at ${place} could touch the squad.`);
      }
      const woundAt = fork.campRisk.wounded * campScale;
      const woundBy = freeNight ? null : edge(EDGE_TITLE.poke) !== null ? EDGE_TITLE.poke : edge(EDGE_TITLE.wave) !== null ? EDGE_TITLE.wave : null;
      const woundScale = freeNight ? 0 : woundBy === EDGE_TITLE.poke ? POKE_CAMP_WOUND : woundBy === EDGE_TITLE.wave ? WAVE_CAMP_WOUND : 1;
      const wound = roll(woundAt * woundScale, rand);
      if (wound.hit) {
        const victim = pick(alive(), rand);
        if (victim) {
          // The tent first, then the card's own shield: what the camp
          // absorbs, the card keeps for the road.
          const shield = takeTent() ? "tent" : shieldFor(victim.id, "wounded");
          if (shield === "tent") {
            events.push({ fork: index, tone: "good", text: `The tent held: ${place} came for ${nameOf(victim.id)} in the night, and the canvas took it.` });
          } else if (shield !== null) {
            fire({ fork: index, tone: "good", text: `${shield}: the wound meant for ${nameOf(victim.id)} at ${place} never landed.`, ability: shield });
          } else {
            harm(victim.id, "wounded");
            events.push({ fork: index, tone: "bad", text: `${fork.title}: the squad held back and ${nameOf(victim.id)} was hurt anyway.` });
          }
        }
      } else if (woundBy !== null && woundAt > 0 && (woundScale === 0 || edgeSpared(wound, woundAt))) {
        pay(woundBy, 0, index, (name) => (woundBy === EDGE_TITLE.poke ? `${name} kept everything at range — nobody could be hurt at ${place}.` : `${name} kept the camp at ${place} tidy, and the wound that was coming never came.`));
      }
      // A ghost walked the last leg: it is at the camp's edge tonight, and
      // doubles the haunting — unless a ghost edge keeps it there.
      const doubled = ghostHere ? Math.max(fork.campRisk.haunted * GHOST_HAUNT, GHOST_HAUNT_FLOOR) : fork.campRisk.haunted;
      const calm = !ghostHere ? null : edge(EDGE_TITLE.counterJungler) !== null ? EDGE_TITLE.counterJungler : edge(EDGE_TITLE.visionDenier) !== null ? EDGE_TITLE.visionDenier : null;
      const haunted = calm !== null ? fork.campRisk.haunted : doubled;
      const hauntAt = haunted * campScale;
      const spaced = edge(EDGE_TITLE.space) !== null;
      const haunt = roll(freeNight ? 0 : spaced ? hauntAt * SPACE_HAUNT : hauntAt, rand);
      if (calm !== null) pay(calm, 0, index, () => `the ghost came no closer than the edge of the camp at ${place} — the haunting did not double.`);
      if (haunt.hit) {
        const victim = pick(unmutated(), rand);
        if (victim && edge(EDGE_TITLE.silentCarry) === victim.id) {
          pay(EDGE_TITLE.silentCarry, 0, index, (name) => `something sat up with ${name} all night at ${place}, and got no answer.`);
        } else if (victim && takeTent()) {
          events.push({ fork: index, tone: "good", text: `The tent held: whatever sat up at ${place} could not get in, and ${nameOf(victim.id)} slept.` });
        } else if (victim && mutate(victim.id, "haunted")) {
          events.push({ fork: index, tone: "bad", text: ghostHere ? `${fork.title}: the ghost sat at the fire all night, and ${nameOf(victim.id)} listened to it.` : `${fork.title}: ${nameOf(victim.id)} sat up all night listening, and brought something back.` });
        }
      } else if (ghostHere) {
        events.push({ fork: index, tone: "neutral", text: `${fork.title}: the ghost walked the camp's edge all night and took nothing.` });
      }
      if (spaced && edgeSpared(haunt, hauntAt)) pay(EDGE_TITLE.space, 0, index, (name) => `${name} gave the night room at ${place}, and the haunting that was coming never came.`);
      let tolled = false;
      if (fork.toll && passage) {
        // The toll paid at the last fork bought this gate too.
        events.push({ fork: index, tone: "good", text: `${fork.title}: the toll they paid at the last gate was good for this one.` });
      } else if (fork.toll && decide(fork.toll, rand)) {
        tolled = true;
        tollPaid = true;
        const plate = edge(EDGE_TITLE.plate);
        if (edge(EDGE_TITLE.priorityMerchant) !== null) {
          pay(EDGE_TITLE.priorityMerchant, 0, index, (name) => `the keeper at ${place} knew ${name} and waved the squad through.`);
        } else if (tent >= 2 && !tentTolled) {
          tentTolled = true;
          events.push({ fork: index, tone: "good", text: `The tent held: at ${place} the keeper took a night under canvas for the toll.` });
        } else {
          lootMultiplier -= plate !== null ? tollCost(input.weather) * PLATE_TOLL : tollCost(input.weather);
          events.push({ fork: index, tone: "bad", text: `${fork.title}: the safe way had a price, and the squad paid it.` });
          pay(EDGE_TITLE.plate, 0, index, (name) => `${name} talked the price at ${place} down to half.`);
        }
      }
      if (fork.campReward) {
        const bearer = pick(unmutated(), rand);
        if (bearer) {
          const chance = fork.campReward.chance;
          const reel = edge(EDGE_TITLE.highlight) !== null;
          const reward = roll(reel ? Math.min(1, chance * HIGHLIGHT_REWARD) : chance, rand);
          if (reward.hit && mutate(bearer.id, fork.campReward.mutation)) {
            events.push({ fork: index, tone: "good", text: `${fork.title}: ${nameOf(bearer.id)} waited it out and came away ${fork.campReward.mutation}.` });
            if (reel && edgeLanded(reward, chance)) pay(EDGE_TITLE.highlight, 0, index, () => `${nameOf(bearer.id)}'s night at ${place} was one for the reel.`);
          }
        }
      }
      if (fork.campRisk.wounded === 0 && fork.campRisk.haunted === 0 && !tolled && !ghostHere) {
        events.push({ fork: index, tone: "neutral", text: `${fork.title}: ${answer === null ? "no word came, so the squad" : "the squad"} took the safe way.` });
      }
      // The camp edges pay for the night — a camp, never a hold.
      pay(EDGE_TITLE.farmDemon, EDGE_SMALL, index, (name) => `${name} farmed the camp at ${place}. +${pctOf(EDGE_SMALL)}%.`);
      pay(EDGE_TITLE.powerFarmer, POWER_FARMER_CAMP, index, (name) => `${name} farmed the camp at ${place}. +${pctOf(POWER_FARMER_CAMP)}%.`);
      return;
    }

    // Every other choice is a push of some kind. A role call in a Veteran's
    // hands takes the sharper shape; the caller is the squad's member in
    // that role with the most miles.
    pushes += 1;
    const veteran = isRoleCall(choice) ? caller(alive(), ROLE_CALL_BY_CHOICE[choice].role) : undefined;
    // The Veteran gives the shape, not the miles.
    const titled = veteran !== undefined && !isVeteran(veteran) && edge(EDGE_TITLE.veteran) === veteran.id;
    const shape = (isRoleCall(choice) && veteran && (isVeteran(veteran) || titled) && VETERAN_SHAPE[choice]) || PUSH_SHAPE[choice];
    if (titled && veteran && isRoleCall(choice) && VETERAN_SHAPE[choice]) {
      fire({ fork: index, tone: "good", text: `The Veteran: ${nameOf(veteran.id)} made the call at ${place} like a Veteran.`, ability: EDGE_TITLE.veteran });
    }
    if (choice === "scout") scouted = true;
    const bonus = fork.lootBonus * shape.bonus;
    // A shrine on the leg before this fork keeps its hand on the harm.
    const guard = shrines.has(index) ? SHRINE_RISK : 1;
    const riskScale = shape.risk * guard;
    const deepScale = shape.deepRisk * guard;
    const last = index === forks.length - 1;
    const unsafeCamp = fork.campRisk.wounded > 0 || fork.campRisk.haunted > 0 || Boolean(fork.toll);
    /** The loot edges a push pays whatever the harm. */
    const pushLoot = () => {
      pay(EDGE_TITLE.glassCannon, EDGE_SMALL, index, (name) => `${name} hit hard at ${place}. +${pctOf(EDGE_SMALL)}%.`);
      if (index === 0 && bonus > 0) pay(EDGE_TITLE.laneBully, bonus * (LANE_BULLY_BONUS - 1), index, (name) => `${name} bullied the first fork — its bonus ×${LANE_BULLY_BONUS}. +${pctOf(bonus * (LANE_BULLY_BONUS - 1))}%.`);
      if (last && bonus > 0) pay(EDGE_TITLE.hypercarry, bonus * (HYPERCARRY_LAST - 1), index, (name) => `${name} carried the last fork — its bonus ×${HYPERCARRY_LAST}. +${pctOf(bonus * (HYPERCARRY_LAST - 1))}%.`);
      if (fork.dark) pay(EDGE_TITLE.burstMage, EDGE, index, (name) => `${name} burst through the dark at ${place}. +${pctOf(EDGE)}%.`);
      if (unsafeCamp) pay(EDGE_TITLE.engage, EDGE, index, (name) => `${name} went in where nobody could camp safely. +${pctOf(EDGE)}%.`);
      if (isRoleCall(choice)) pay(EDGE_TITLE.playmaker, EDGE_SMALL, index, (name) => `${name} made the play. +${pctOf(EDGE_SMALL)}%.`);
      if (fork.warned) pay(EDGE_TITLE.duelist, EDGE, index, (name) => `${name} took the fight they were warned about. +${pctOf(EDGE)}%.`);
    };
    /** The loot edges a push pays when nobody was hurt on it. */
    const cleanLoot = () => {
      if (!cleanPaid && edge(EDGE_TITLE.pentakill) !== null) {
        cleanPaid = true;
        pay(EDGE_TITLE.pentakill, EDGE_BIG, index, (name) => `${name} came out of ${place} clean, the first time this run. +${pctOf(EDGE_BIG)}%.`);
      }
      pay(EDGE_TITLE.executioner, EDGE_SMALL, index, (name) => `nobody hurt at ${place}, and ${name} took the finish. +${pctOf(EDGE_SMALL)}%.`);
    };

    if (fork.gamble) {
      // Free Win Lane shades the coin; Coinflip Gamer doubles its swing
      // both ways. The loot edges ride the win: a lost flip pays none.
      const freeWin = edge(EDGE_TITLE.freeWin) !== null;
      const flip = roll(freeWin ? Math.max(0, fork.gamble.lose - FREE_WIN_LOSE) : fork.gamble.lose, rand);
      if (flip.hit) {
        lootMultiplier -= fork.gamble.down;
        events.push({ fork: index, tone: "bad", text: `${fork.title}: the camp was empty and the detour cost them.` });
        const doubled = fork.gamble.down * (COINFLIP_SWING - 1);
        pay(EDGE_TITLE.coinflip, -doubled, index, (name) => `${name} let it ride at ${place}, and the loss doubled. −${pctOf(doubled)}%.`);
      } else {
        lootMultiplier += bonus;
        events.push({ fork: index, tone: "good", text: `${fork.title}: the camp was real, and unguarded.` });
        if (freeWin && edgeSpared(flip, fork.gamble.lose)) pay(EDGE_TITLE.freeWin, 0, index, (name) => `${name} knew the odds at ${place} were better than they looked, and they were.`);
        pay(EDGE_TITLE.coinflip, bonus * (COINFLIP_SWING - 1), index, (name) => `${name} let it ride at ${place}, and the win doubled. +${pctOf(bonus * (COINFLIP_SWING - 1))}%.`);
        pushLoot();
        cleanLoot();
      }
      return;
    }

    // Momentum: on the Mythic route every consecutive push before this one
    // raises the bonus and the death roll — the death roll at half the rate
    // in Tempo Conductor's hands.
    const carried = input.tier === "mythic" ? streak : 0;
    lootMultiplier += bonus + MOMENTUM_BONUS * carried;
    const deathStep = edge(EDGE_TITLE.conductor) !== null ? MOMENTUM_DEATH * CONDUCTOR_DEATH : MOMENTUM_DEATH;
    const deadRisk = fork.pushRisk.dead + deathStep * carried;
    if (carried > 0) events.push({ fork: index, tone: "neutral", text: `${fork.title}: the momentum carried — ${carried} push${carried === 1 ? "" : "es"} behind them, +${Math.round(MOMENTUM_BONUS * carried * 100)}% to the bag and +${Math.round(deathStep * carried * 100)}% to the death roll.` });
    // The momentum edges carry on every route, up to STREAK_CAP pushes.
    const heat = Math.min(streak, STREAK_CAP);
    if (heat > 0) {
      const behind = `${heat} push${heat === 1 ? "" : "es"} in a row`;
      pay(EDGE_TITLE.heater, HEATER_STREAK * heat, index, (name) => `${name} is on a heater — ${behind}. +${pctOf(HEATER_STREAK * heat)}%.`);
      pay(EDGE_TITLE.conductor, CONDUCTOR_STREAK * heat, index, (name) => `${name} kept the tempo — ${behind}. +${pctOf(CONDUCTOR_STREAK * heat)}%${carried > 0 ? ", and the death roll climbs at half the rate" : ""}.`);
    }
    streak += 1;
    pushLoot();
    // Whose head it lands on. One card for most pushes; the Jungle for a
    // scout (they went in first — no draw when there is one of them); two
    // cards for a roam, or one in Roaming Threat's hands.
    const victims: CardCopy[] = [];
    let stepped: { id: number; for: number; title: EdgeTitle } | null = null;
    const threat = shape.victims === "two" ? edge(EDGE_TITLE.roamingThreat) : null;
    const spread = threat !== null ? "one" : shape.victims;
    if (riskScale > 0 || deepScale > 0) {
      if (spread === "jungle") {
        // The Jungle who went in first — the one who made the call. With
        // one Jungle there is nothing to draw; with two the road picks.
        // No front stands in front of a scout: going first is the call.
        const junglers = inRole(alive(), "Jungle") as CardCopy[];
        const first = junglers.length === 1 ? junglers[0] : pick(junglers.length > 0 ? junglers : alive(), rand);
        if (first) victims.push(first);
      } else {
        // Split Pusher is out of the pool while another living card can
        // take it — the same one draw, over the others.
        const splitter = edge(EDGE_TITLE.splitPusher);
        const pool = (from: CardCopy[]) => (splitter !== null && from.some((copy) => copy.id !== splitter) ? from.filter((copy) => copy.id !== splitter) : from);
        const first = pick(pool(alive()), rand);
        if (first) victims.push(first);
        if (spread === "two" && first) {
          const second = pick(pool(alive().filter((copy) => copy.id !== first.id)), rand);
          if (second) victims.push(second);
        }
        // A front takes the first hit for a squadmate: no draw, just a
        // card stepping in.
        for (const title of TAKERS) {
          const front = edge(title);
          if (front === null || victims.length === 0 || victims.some((victim) => victim.id === front)) continue;
          stepped = { id: front, for: victims[0].id, title };
          victims[0] = input.copies.find((copy) => copy.id === front)!;
          break;
        }
      }
      if (threat !== null) fire({ fork: index, tone: "good", text: `Roaming Threat: ${nameOf(threat)} roamed alone at ${place} — the harm was rolled on one card, not two.`, ability: EDGE_TITLE.roamingThreat });
    }
    let anyHarm = false;
    for (const victim of victims) {
      const scale = harmScale(victim.id, fork, last);
      const wound = roll(Math.min(1, fork.pushRisk.wounded * riskScale * scale.wound), rand);
      const lost = roll(Math.min(1, fork.pushRisk.lost * deepScale * scale.deep), rand);
      const dead = pushes >= DEAD_NEEDS_PUSHES ? roll(Math.min(1, deadRisk * deepScale * scale.deep), rand) : null;
      let worst: CardFateKind = dead?.hit ? "dead" : lost.hit ? "lost" : wound.hit ? "wounded" : "home";
      // The same rolls with no edge on this card: what the edges changed.
      const bareAt = (outcome: Roll | null, chance: number) => (outcome === null ? false : outcome.value !== null ? outcome.value < Math.min(1, chance) : outcome.hit);
      const bare: CardFateKind = bareAt(dead, deadRisk * deepScale) ? "dead" : bareAt(lost, fork.pushRisk.lost * deepScale) ? "lost" : bareAt(wound, fork.pushRisk.wounded * riskScale) ? "wounded" : "home";
      if (FATE_RANK[bare] > FATE_RANK[worst] && scale.by !== null) {
        fire({ fork: index, tone: "good", text: `${scale.by}: it should have been a ${FATE_WORD[bare]} for ${nameOf(victim.id)} at ${place}. It was not.`, ability: scale.by });
      } else if (FATE_RANK[worst] > FATE_RANK[bare] && edge(EDGE_TITLE.glassCannon) === victim.id) {
        fire({ fork: index, tone: "bad", text: `Glass Cannon: ${nameOf(victim.id)} cracked at ${place} where another card would have held.`, ability: EDGE_TITLE.glassCannon });
      }
      if (worst === "home") continue;
      const shield = shieldFor(victim.id, worst);
      if (shield !== null) {
        fire({
          fork: index,
          tone: "good",
          text: stepped?.id === victim.id
            ? `${shield}: ${nameOf(victim.id)} stepped in front of ${nameOf(stepped.for)} at ${place} and shrugged it off.`
            : `${shield}: the ${FATE_WORD[worst]} meant for ${nameOf(victim.id)} at ${place} never landed.`,
          ability: shield,
        });
        continue;
      }
      anyHarm = true;
      if (stepped?.id === victim.id) {
        const sacrifice = stepped.title === EDGE_TITLE.sacrificial;
        if (sacrifice) lootMultiplier += EDGE_BIG;
        fire({ fork: index, tone: sacrifice ? "good" : "neutral", text: `${stepped.title}: ${nameOf(victim.id)} stepped in front of ${nameOf(stepped.for)} at ${place} and took it.${sacrifice ? ` +${pctOf(EDGE_BIG)}%.` : ""}`, ability: stepped.title });
      }
      // The warned fork's price: go wrong here and the card is Cursed. A
      // wound becomes the curse; a loss or a death carries it too — unless
      // the card has ice in its veins, and then the harm stands, uncursed.
      if (fork.warned) {
        if (edge(EDGE_TITLE.ice) === victim.id) {
          fire({ fork: index, tone: "good", text: `Ice In The Veins: they were warned at ${place}, and ${nameOf(victim.id)} did not flinch — no curse.`, ability: EDGE_TITLE.ice });
        } else {
          const cursed = mutate(victim.id, "cursed");
          if (worst === "wounded") worst = "home";
          if (cursed) events.push({ fork: index, tone: "bad", text: `${fork.title}: they were warned. ${nameOf(victim.id)} comes home Cursed.` });
        }
      }
      if (worst !== "home") {
        harm(victim.id, worst);
        const verb = worst === "dead" ? "did not survive it" : worst === "lost" ? "did not come out" : "was carried out";
        events.push({ fork: index, tone: "bad", text: `${fork.title}: they pushed, and ${nameOf(victim.id)} ${verb}.` });
      }
    }
    if (!anyHarm) {
      events.push({ fork: index, tone: "good", text: `${fork.title}: ${PUSH_VERB[choice]}.` });
      cleanLoot();
    }
    if (fork.pushReward) {
      const bearer = pick(unmutated(), rand);
      if (bearer) {
        const chance = fork.pushReward.chance;
        const reel = edge(EDGE_TITLE.highlight) !== null;
        const reward = roll(reel ? Math.min(1, chance * HIGHLIGHT_REWARD) : chance, rand);
        if (reward.hit && mutate(bearer.id, fork.pushReward.mutation)) {
          events.push({ fork: index, tone: "good", text: `${fork.title}: ${nameOf(bearer.id)} came out of it ${fork.pushReward.mutation}.` });
          if (reel && edgeLanded(reward, chance)) pay(EDGE_TITLE.highlight, 0, index, () => `${nameOf(bearer.id)} came out of ${place} looking like a highlight.`);
        }
      }
    }
    if (fork.pushFind?.fragment && decide(fork.pushFind.fragment, rand)) {
      fragments += 1;
      events.push({ fork: index, tone: "good", text: `${fork.title}: in the haul, a fragment of a map that shows a place the map does not.` });
    }
    if (fork.pushFind?.comp) {
      const chance = fork.pushFind.comp;
      const melter = edge(EDGE_TITLE.turret) !== null;
      const find = roll(melter ? Math.min(1, chance * TURRET_FINDS) : chance, rand);
      if (find.hit) {
        comp = true;
        events.push({ fork: index, tone: "good", text: `${fork.title}: a sealed pack, unopened, in with the rest. It is yours.` });
        if (melter && edgeLanded(find, chance)) pay(EDGE_TITLE.turret, 0, index, (name) => `${name} broke open one more crate at ${place}, and the pack was in it.`);
      }
    }
    // Coinflip Gamer on a road with no coin flip: the run's first push is
    // one. Its draw is this fork's last, after the find.
    if (pushes === 1 && !gambles && bonus > 0 && edge(EDGE_TITLE.coinflip) !== null) {
      const heads = rand() < 0.5;
      pay(EDGE_TITLE.coinflip, heads ? bonus : -bonus, index, (name) =>
        heads ? `${name} called the first push on a coin — heads, and ${place} paid twice. +${pctOf(bonus)}%.` : `${name} called the first push on a coin — tails, and ${place} paid nothing. −${pctOf(bonus)}%.`,
      );
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

  if (input.tier === "mythic") {
    const survivors = alive();
    if (survivors.length === 0) {
      events.push({ fork: null, tone: "bad", text: "Nobody came home from past the rift." });
    } else {
      // The Voidtouched come home Voidborn; the rest come home Voidtouched,
      // the way the Legendary route sends them.
      for (const copy of survivors) {
        if (ascend(copy.id)) events.push({ fork: null, tone: "good", text: `${nameOf(copy.id)} went back through the rift and came home Voidborn.` });
      }
      const first = pick(unmutated(), rand);
      if (first && mutate(first.id, "voidtouched")) {
        events.push({ fork: null, tone: "good", text: `${nameOf(first.id)} came back through the rift Voidtouched.` });
      }
    }
  }

  if (input.tier === "rescue") {
    const pushed = !isCampChoice(input.choices[0] ?? "camp");
    // The Lifeline's hand on the rescue, inside RESCUE_CAP: a rescue is
    // never a certainty.
    const chance = rescueChance(input.copies, pushed);
    const lifeline = edge(EDGE_TITLE.lifeline) !== null;
    const verdict = roll(lifeline ? Math.min(RESCUE_CAP, chance + LIFELINE_RESCUE) : chance, rand);
    rescued = verdict.hit;
    if (rescued) {
      events.push({ fork: null, tone: "good", text: "They found the lost card and brought it home. It is wounded, and it is home." });
      if (lifeline && edgeLanded(verdict, chance)) pay(EDGE_TITLE.lifeline, 0, null, (name) => `${name} got them in — the rescue turned on it.`);
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
        benched(fate.id);
        events.push({ fork: null, tone: "neutral", text: `Insurance: ${nameOf(fate.id)} was carried home instead of left behind.` });
      }
    }
  }

  // The finale edges: after insurance, before the clamp. An exorcism has
  // no bag for them to fill.
  if (counted.size > 0 && input.tier !== "exorcism") {
    if ((input.shine ?? squadShine(input.copies)) <= EXPEDITION_TIERS[input.tier].minShine + UNDERDOG_MARGIN) {
      pay(EDGE_TITLE.underdog, EDGE_BIG, null, (name) => `nobody gave this squad a chance, and ${name} made them pay. +${pctOf(EDGE_BIG)}%.`);
    }
    pay(EDGE_TITLE.jack, EDGE_SMALL, null, (name) => `${name} did a bit of everything. +${pctOf(EDGE_SMALL)}%.`);
    if (Math.round(lootMultiplier * 100) < 100 && edge(EDGE_TITLE.lateGame) !== null) {
      const short = 1 - lootMultiplier;
      lootMultiplier = 1;
      pay(EDGE_TITLE.lateGame, 0, null, (name) => `${name} made sure the bag came home no lighter than it left. +${pctOf(short)}%.`);
    }
  }

  const fragmentChance = FRAGMENT_CHANCE[input.tier]?.[input.grade] ?? 0;
  if (decide(fragmentChance, rand)) {
    fragments += 1;
    events.push({ fork: null, tone: "good", text: "Among the haul: a fragment of a map that shows a place the map does not." });
  }

  const shortUntil = new Date(input.now.getTime() + LIFELINE_BENCH_HOURS * 3_600_000).toISOString();
  const eased: number[] = [];
  for (const fate of fates.values()) {
    if (fate.fate === "wounded") {
      fate.woundedUntil = shortBench.has(fate.id) ? shortUntil : woundedUntil;
      if (shortBench.has(fate.id)) eased.push(fate.id);
    }
    if (fate.fate === "dead") fate.mutation = null;
  }
  if (eased.length > 0) {
    const names = eased.map(nameOf);
    const who = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
    fire({ fork: null, tone: "good", text: `The Lifeline: ${who} ${eased.length === 1 ? "is" : "are"} benched ${LIFELINE_BENCH_HOURS}h, not ${WOUNDED_HOURS}h.`, ability: EDGE_TITLE.lifeline });
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
