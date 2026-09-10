// The trail journal: what a squad writes home between forks.
//
// A run used to be a countdown. Now it is a countdown with a story: two
// lines a leg from the trail, an arrival line as the squad reaches each
// checkpoint, and on some legs an ENCOUNTER — a beat with no decision in
// it that still changes the run. A merchant pays for what the squad has
// found so far. A stranded card from another player's lost run can be
// carried home for a bounty. A storm delays the run two hours. On a road
// (ROAD_RULES) there is more on the trail: a cache, a rival squad, a
// shrine, a relic hunter.
//
// Everything is DERIVED, nothing is stored: the lines and the encounters
// are seeded by the run's id and leg, so the page, the Discord ping and
// the claim all read the same journal from the same row without a write.
// The sweep applies a storm's delay when its hour arrives and records
// that it did (expedition_runs.encounters), and the claim applies the
// merchant's dollars, the stranded rescue and the road's beats; the
// journal itself never needs the database.
//
// Squad banter at a fork reads the same way: the fork's story line gains
// a sentence keyed on who is standing there — a Support wants to camp, a
// Jungle knows a way round, two teammates vouch for each other — so the
// same fork reads differently with a different squad.
//
// Two voices, by rulebook. A run stamped before ROAD_RULES keeps the
// pools it set out with (LEGACY_*): its journal is already half-written
// and half-quoted in Discord, and a rule change must not rewrite a story
// in progress. A run on the road draws from the wider pools, without
// repeating a line inside one run, and hears each role in its own voice.

import { mulberry32 } from "@/lib/gauntlet/sim";
import { TRAIL_RULES } from "./queries";
import { EXPEDITION_TIERS, HARVEST_MERCHANT, MERCHANT_DOLLARS, type CardCopy, type ExpeditionTierKey } from "./config";
import { DROUGHT_CACHES, WATCH_GHOSTS, WATCH_RIVALS, WEATHERS, WEATHER_RULES, type WeatherKey } from "./weather";
import { CACHE_LOOT, COMPANY_RULES, GHOST_HAUNT, RIVAL_LOSS_LOOT, RIVAL_WIN_LOOT, ROAD_RULES, forkWindows, forksFor, type RoadRef, type RouteEncounter } from "./routes";
import type { RoadCompany } from "./company";

export type EncounterKey = "merchant" | "stranded" | "storm" | "cache" | "rival" | "shrine" | "hunter" | "ghost";

/** How often a leg carries an encounter at all — and on a road, where
 *  there is more to meet. */
export const ENCOUNTER_CHANCE = 0.35;
export const ROAD_ENCOUNTER_CHANCE = 0.45;
/** Hours a storm holds the squad. Applied once per storm by the sweep. */
export const STORM_HOURS = 2;
/** What bringing a stranger's lost card home pays the rescuer. */
export const STRANDED_BOUNTY = 150;
/** How often a relic hunter actually has a fragment to trade. */
export const HUNTER_FRAGMENT_CHANCE = 0.3;
/** How often the squad beats a rival to the spot. */
export const RIVAL_WIN_CHANCE = 0.5;

export interface Encounter extends RouteEncounter {
  leg: number;
  key: EncounterKey;
  /** When it happens on the trail — the middle of its leg. */
  at: Date;
}

export interface JournalEntry {
  at: Date;
  leg: number;
  kind: "trail" | "arrive" | "encounter" | "home";
  text: string;
  encounter?: EncounterKey;
}

type Squad = Pick<CardCopy, "id" | "playerName" | "role" | "signed" | "foil" | "card">[];

type RunRef = {
  id: number;
  tier: ExpeditionTierKey;
  startedAt: string;
  resolvesAt: string;
  forks: number;
  claimedAt?: string | null;
  rules?: number;
  convoy?: number | null;
  /** The answers so far. A scout at one fork writes a line at the start
   *  of the next leg — the Jungle back from ahead, naming the place. */
  choices?: { index: number; choice: string }[];
  /** Who else was on the road (company.ts): the rivals met, the runs that
   *  met this one, the ghosts. Read by the server; a run handed over
   *  without it meets nobody by name. */
  company?: RoadCompany | null;
  /** The weather the run launched under (weather.ts), read by the server
   *  from its launch week. A run handed over without it walks in no
   *  weather. */
  weather?: WeatherKey | null;
};

const onRoad = (run: Pick<RunRef, "rules">): boolean => (run.rules ?? 1) >= ROAD_RULES;

const roadOf = (run: RunRef): RoadRef => ({ runId: run.id, rules: run.rules ?? 1, convoy: run.convoy ?? null, forks: run.forks });

// === the fixed road's voice ==================================================

/** The trail, by route, as it read before the road: what the squad sees
 *  between checkpoints. `{name}` is one squad member, `{role}` their role.
 *  Each route owns its own weather; a Scouting Run should never read like
 *  the Legendary route. */
const LEGACY_TRAIL: Record<ExpeditionTierKey, string[]> = {
  scout: [
    "{name} found tracks at the riverbed. Fresh, and heading upstream.",
    "A quiet morning. {name} is complaining about the {role} rotations again.",
    "The squad shared the last of the rations. Nobody said anything about it.",
    "{name} spotted a camp on the ridge and argued for an hour about whose it was.",
    "Light rain. {name} is keeping the map dry under a jacket.",
    "They passed a marker from a run that came this way last week.",
  ],
  gilded: [
    "The road is paved, which nobody expected. {name} is walking in the middle of it.",
    "A waystation with the lamps lit and the door open. {name} left a coin on the counter anyway.",
    "{name} traded stories with a carter going the other way and came back with a better one.",
    "Dusk on the gilded road. {name} says the {role} should carry the lantern and nobody argues.",
    "The squad ate well tonight. {name} is suspicious of it.",
    "Rain, and a roof for once. {name} slept through the whole watch.",
  ],
  raid: [
    "{name} says the humming from the valley is louder than the map suggested.",
    "The squad is arguing about the reactor. {name} wants to go in; nobody else does.",
    "A geiger counter somebody packed started ticking, then stopped.",
    "{name} found salvage worth carrying and carried it, complaining the whole way.",
    "The ridge road is held. The squad can see the lights from here.",
    "{name} has not slept. Says the glow keeps them up.",
  ],
  legend: [
    "The mine shaft breathes warm air. {name} dropped a stone in and never heard it land.",
    "A checkpoint nobody built. {name} does not want to camp here and says so, twice.",
    "{name} swears something is walking alongside the squad just past the torchlight.",
    "They found the old expedition's marks on a wall. The last one is unfinished.",
    "The squad shared a fire. {name} told the story of the vault, badly.",
    "Cold. {name} is rationing the light.",
  ],
  rescue: [
    "{name} found the trail the lost card was dragged along. It is still fresh.",
    "The holding camp has two sentries. {name} counted three times to be sure.",
    "They waited for dark. {name} kept watch and kept quiet.",
    "A signal from inside the camp, or {name} imagining one.",
  ],
  exorcism: [
    "The squad set the circle. {name} read the words twice and got them right the second time.",
    "Something in the card answered. {name} says it sounded tired.",
    "Salt, chalk, and a long wait. {name} is holding the candle.",
  ],
  legendary: [
    "The fragments fit together and the map shows a door where there is no door.",
    "The ground is wrong past the threshold. {name} is walking carefully and slowly.",
    "Something is singing under the floor. {name} asked the squad to stop humming along.",
    "Stars on the other side of the rift, and none of them are ours. {name} has stopped talking.",
    "The door behind them is closing an inch an hour. {name} measured it.",
    "{name} looked into the last chamber and came back with nothing to say.",
  ],
  // Never drawn: a Mythic run is always on a road. Here so the table is total.
  mythic: [
    "The road past the rift. {name} has been here before, and it remembers.",
    "Nothing here casts a shadow but the squad.",
  ],
};

const LEGACY_ENCOUNTER_LINES: Record<EncounterKey, string> = {
  merchant: `A merchant on the trail paid ${MERCHANT_DOLLARS} for what the squad had found so far. {name} did the haggling.`,
  stranded: "A stranded card from somebody else's lost run, half-buried by the trail. {name} is carrying it home.",
  storm: `A storm came in off the ridge. The squad is sheltering; the run is ${STORM_HOURS} hours behind.`,
  // The four below never fall on a legacy run; they are here so the table
  // is total and the type stays honest.
  cache: "An old expedition's cache, still packed. {name} is carrying what was worth carrying.",
  rival: "Another squad on the same trail, going the same way.",
  shrine: "A wayside shrine. {name} left something on it.",
  hunter: "A relic hunter on the road, trading.",
  ghost: "Something is walking beside the squad, just past the torchlight.",
};

const LEGACY_ROLE_BANTER: Record<string, string> = {
  Top: "{name} says take the long way; a Top never trusts a shortcut.",
  Jungle: "{name} knows a way round and will not shut up about it.",
  Mid: "{name} wants to push. {name} always wants to push.",
  Bot: "{name} is not going first, and says so.",
  Support: "{name} wants to camp, light a fire and wait for daylight.",
};

// === the road's voice =========================================================

/** The trail on a road: a bigger pool per route, drawn without repeats
 *  inside one run, so a 72-hour Legendary route with ten legs of journal
 *  never says the same thing twice. `{name}` is any member. */
const TRAIL: Record<ExpeditionTierKey, string[]> = {
  scout: [
    "{name} found tracks at the riverbed. Fresh, and heading upstream.",
    "A quiet morning. {name} is complaining about the walk, which is the point of a walk.",
    "The squad shared the last of the rations. Nobody said anything about it.",
    "{name} spotted a camp on the ridge and argued for an hour about whose it was.",
    "Light rain. {name} is keeping the map dry under a jacket.",
    "They passed a marker from a run that came this way last week.",
    "A farm dog followed them for a mile and then thought better of it.",
    "{name} found a coin in the road and has been flipping it since.",
    "The squad stopped at a well. The water was fine. {name} said it was the best water they had ever had.",
    "Somebody's washing on a line across the road. The squad went under it.",
    "A milestone with the distance scratched out. {name} scratched a new one in.",
    "Sun. The first for days. The squad walked slower on purpose.",
    "{name} is telling the story of a scouting run that went wrong, to a squad on a scouting run.",
    "They found a cart with one wheel and spent longer than they should have trying to fix it.",
  ],
  gilded: [
    "The road is paved, which nobody expected. {name} is walking in the middle of it.",
    "A waystation with the lamps lit and the door open. {name} left a coin on the counter anyway.",
    "{name} traded stories with a carter going the other way and came back with a better one.",
    "Dusk on the gilded road. Somebody has to carry the lantern and {name} volunteered.",
    "The squad ate well tonight. {name} is suspicious of it.",
    "Rain, and a roof for once. {name} slept through the whole watch.",
    "Every gate on this road opens for a story. {name} is running out of true ones.",
    "A coach passed, curtains drawn, and somebody inside knew {name}'s name.",
    "Gold leaf on the milestones. {name} tried to peel one and was told, politely, not to.",
    "The innkeeper would not take payment. {name} paid anyway, in a story about a signed card.",
    "A procession on the road ahead, going the same way, slower. The squad joined the back of it.",
    "Two roads, both paved, both gold. {name} picked the one with the fewer footprints.",
    "The squad slept in beds. {name} did not sleep at all, out of principle.",
    "Somebody on the road asked to see the signatures. {name} showed them, and did not let go.",
  ],
  raid: [
    "{name} says the humming from the valley is louder than the map suggested.",
    "The squad is arguing about the way in. {name} wants to go; nobody else does.",
    "A geiger counter somebody packed started ticking, then stopped.",
    "{name} found salvage worth carrying and carried it, complaining the whole way.",
    "The road ahead is held. The squad can see the lights from here.",
    "{name} has not slept. Says the glow keeps them up.",
    "Rust on everything. {name} says it is the good kind.",
    "A door with a warning painted on it in three languages. {name} read all three and went in anyway.",
    "The valley floor is warm underfoot. Nobody wants to say why.",
    "{name} found a pair of boots by the road, in good condition, with nobody in them.",
    "The lights on the ridge went out for a minute and the squad held its breath. Then they came back.",
    "Somebody's supper, still warm, in an empty hut. {name} finished it.",
    "{name} climbed something to get a look and came down faster than they went up.",
    "The squad crossed a pipe over a drop. {name} went last and did not look down, and said so.",
  ],
  legend: [
    "The mine shaft breathes warm air. {name} dropped a stone in and never heard it land.",
    "A checkpoint nobody built. {name} does not want to camp here and says so, twice.",
    "{name} swears something is walking alongside the squad just past the torchlight.",
    "They found the old expedition's marks on a wall. The last one is unfinished.",
    "The squad shared a fire. {name} told the story of the vault, badly.",
    "Cold. {name} is rationing the light.",
    "A door in the hillside with no handle on this side. {name} knocked. Nobody answered, which was the good outcome.",
    "The squad's own footprints, going the other way, on a path they have not walked yet.",
    "{name} woke the squad at three to say they had heard the name of the legend spoken. Nobody else had.",
    "Bones by the path, old ones, arranged. {name} rearranged them and then put them back.",
    "The torches burn blue down here. {name} says that is fine. {name} does not sound fine.",
    "A ledger in the old camp with the last expedition's names in it. {name} did not read to the end.",
    "The squad passed a place where the map is blank on purpose. Nobody stopped.",
    "Something took the bread from the packs in the night and left the coins.",
  ],
  rescue: [
    "{name} found the trail the lost card was dragged along. It is still fresh.",
    "The holding camp has two sentries. {name} counted three times to be sure.",
    "They waited for dark. {name} kept watch and kept quiet.",
    "A signal from inside the camp, or {name} imagining one.",
    "{name} found the lost card's mark scratched on a post at the crossing. Still out there, then.",
    "Voices from the camp carried on the wind. {name} says one of them said a price.",
    "The squad went the long way round to stay out of sight. It cost an hour. {name} says it was cheap.",
    "{name} has the ransom worked out to the dollar and is hoping nobody has to pay it.",
  ],
  exorcism: [
    "The squad set the circle. {name} read the words twice and got them right the second time.",
    "Something in the card answered. {name} says it sounded tired.",
    "Salt, chalk, and a long wait. {name} is holding the candle.",
    "The candle went out twice. {name} relit it twice and did not comment.",
    "{name} asked the card, politely, to let go. It is thinking about it.",
  ],
  legendary: [
    "The fragments fit together and the map shows a door where there is no door.",
    "The ground is wrong past the threshold. {name} is walking carefully and slowly.",
    "Something is singing under the floor. {name} asked the squad to stop humming along.",
    "Stars on the other side of the rift, and none of them are ours. {name} has stopped talking.",
    "The door behind them is closing an inch an hour. {name} measured it.",
    "{name} looked into the last chamber and came back with nothing to say.",
    "The squad's shadows are a step behind them. {name} tried to lose theirs and could not.",
    "Water running upward in a channel by the path. {name} filled a flask from it and did not drink.",
    "The map fragments are warm. {name} is holding them and does not want to.",
    "{name} counted the squad and got four. Counted again and got three. Did not count a third time.",
    "There is a wind here with no source. It smells of home.",
    "Something said {name}'s name in {name}'s own voice. They kept walking.",
    "The floor remembers footsteps. The squad walked on the ones already there.",
    "{name} found a coin from their own pocket lying on the path ahead of them.",
  ],
  mythic: [
    "The road past the rift. {name} has been here before, and it remembers them.",
    "Nothing here casts a shadow but the squad. {name} checked twice.",
    "The Voidtouched one is walking ahead without being asked. The road bends to follow.",
    "Stairs going down that arrive higher up. {name} stopped counting the turns.",
    "A sky made of one star, close enough to touch. Nobody tried.",
    "The squad's own voices, a few seconds ahead of them, saying what they were about to say.",
    "{name} found the last camp's fire still warm. The last camp was theirs.",
    "The map fragments are singing now. {name} put them away and the singing did not stop.",
    "Every door here opens onto the road they just left. {name} stopped opening them.",
    "The Voidtouched one is not blinking. {name} is not sure they ever did.",
    "Light with no source, warm as a hand. The squad walked in it for an hour and came out cold.",
    "Something very large is asleep under the road. The squad walked softly.",
    "{name} wrote their own name on a wall and it was already there.",
    "The way home is behind them and ahead of them at once. They chose ahead.",
  ],
};

/**
 * Each role's own trail: one line a leg in the voice of the position the
 * card actually plays. A Top takes the island and holds it; a Jungle
 * walks the perimeter, keeps timers and knows the way round; a Mid wants
 * tempo and is bored of standing still; a Bot stays at the back, farms
 * what the squad walks past and scales; a Support has the fire lit, the
 * wards down and everyone counted. `{name}` is the member of that role.
 */
const ROLE_TRAIL: Record<string, string[]> = {
  Top: [
    "{name} took the far side of the road alone and did not rejoin the squad until dark. A Top likes an island.",
    "{name} has carried the heaviest pack since the first hour and will not hand it off.",
    "Two of them wanted to go around. {name} walked straight through it. The wall lost.",
    "{name} says they will hold the rear if it comes to that. Nobody argued; nobody thinks it will.",
    "A fallen tree across the path. {name} moved it. Alone. Slowly. Without being asked.",
    "{name} keeps checking the way back, counting the steps. Says a Top always knows the way home.",
    "{name} picked a fight with the weather and, for now, is winning it.",
    "{name} found a spot with one way in and sat with their back to it until morning.",
  ],
  Jungle: [
    "{name} was gone for an hour and came back with a route nobody else had seen.",
    "{name} keeps a count of everything that moves in the trees, and says something is on a timer.",
    "The squad stopped to rest. {name} did not — they walked the perimeter twice.",
    "{name} found the camp before the camp found them. Old habit.",
    "{name} says the far side is clear, and that they will know the moment it is not.",
    "Nobody asked, but {name} has already planned the next three stops and the time at each.",
    "{name} went ahead to check the crossing and cut a mark in a tree so the others could follow.",
    "{name} slept an hour and woke up knowing which way the wind had changed.",
  ],
  Mid: [
    "{name} wants to push on tonight and has said so four times.",
    "{name} wandered off to have a look at the next ridge and came back with an opinion.",
    "The squad argued about pace. {name} settled it by walking faster.",
    "{name} keeps saying the timing is right. The timing for what is never quite clear.",
    "{name} traded a story with a stranger on the road and came out ahead on it.",
    "{name} is not carrying much. Says they need to move fast when it matters, and it always matters.",
    "{name} took the middle of the road and left everyone else the edges.",
    "{name} is bored. A bored Mid is how runs get interesting.",
  ],
  Bot: [
    "{name} is at the back, where the shots are worth more, and is not going first.",
    "{name} spent the quiet hour picking up everything the squad walked past. It adds up.",
    "{name} asked twice who was watching the flank. Nobody had a good answer.",
    "{name} is happy to wait. Says the run pays more the longer it goes.",
    "{name} counted the rations and rationed them. Nobody else had thought to.",
    "{name} says they will be worth twice as much in an hour. The squad is used to hearing it.",
    "The squad crossed a stream. {name} went last, and dry.",
    "{name} will not stand anywhere without knowing who is standing in front.",
  ],
  Support: [
    "{name} had the fire lit before anyone else had their boots off.",
    "{name} walked ahead and left a marker at every turn. Nobody on this run is getting lost.",
    "{name} noticed one of them limping before they said anything, and saw to it.",
    "{name} made the call to stop for the night and the squad, for once, listened.",
    "{name} kept watch all night so the others could sleep. Says it is the job.",
    "{name} counted heads at every stop. Three, every time.",
    "{name} is carrying a lantern nobody remembers packing.",
    "{name} has been talking the whole way, and the squad has been walking better for it.",
  ],
};

/** The Jungle back from scouting the last fork, naming the next one. */
const SCOUTED_LINES = [
  "{name} came back from scouting ahead: it is {title}, and they know where not to sleep.",
  "{name} was gone an hour and returned with a sketch of the next stop — {title} — and a list of places not to camp.",
];

/** Reaching a checkpoint, in a few voices. `{title}` is the fork's. */
const ARRIVAL_LINES = [
  "The squad reached {title}. {name} is waiting on word.",
  "{title}, ahead, and the squad has stopped. {name} is looking back down the trail for an answer.",
  "The squad is at {title}. Nobody moves until you say.",
  "{name} was first to {title} and is the first to ask what happens now.",
];

const HOME_LINES = [
  "The squad is home and waiting to be collected.",
  "Home. The squad is at the door with the bag, waiting on you.",
  "The squad made it back and has not put the bag down yet.",
];

/** What the trail's beats read like on a road: a couple of ways each,
 *  and the rival and the hunter say how it went. */
const ENCOUNTER_LINES: Record<EncounterKey, string[]> = {
  merchant: [
    `A merchant on the trail paid ${MERCHANT_DOLLARS} for what the squad had found so far. {name} did the haggling.`,
    `A merchant with a cart and no hurry. ${MERCHANT_DOLLARS} for what the squad had found so far, and {name} made them count it twice.`,
  ],
  stranded: [
    "A stranded card from somebody else's lost run, half-buried by the trail. {name} is carrying it home.",
    "Somebody else's lost card, alone on the trail and glad to see anyone. {name} picked it up without a word.",
  ],
  storm: [
    `A storm came in off the ridge. The squad is sheltering; the run is ${STORM_HOURS} hours behind.`,
    `Weather, all at once. The squad found a wall to stand behind and lost ${STORM_HOURS} hours to it.`,
  ],
  cache: [
    `An old expedition's cache, still packed, under a cairn. {name} took what was worth carrying: ${Math.round(CACHE_LOOT * 100)}% more in the bag.`,
    `A cache somebody meant to come back for and never did. ${Math.round(CACHE_LOOT * 100)}% more loot, and {name} left the cairn as it was.`,
  ],
  rival: [
    // won
    `A rival squad on the same trail, going the same way. Yours got there first: ${Math.round(RIVAL_WIN_LOOT * 100)}% more in the bag, and {name} waved.`,
    `Another squad, on your road, wanting your spot. {name} out-walked them to it. ${Math.round(RIVAL_WIN_LOOT * 100)}% more loot.`,
    // lost
    `A rival squad on the same trail, and they got there first. ${Math.round(RIVAL_LOSS_LOOT * 100)}% less in the bag. {name} is not talking about it.`,
    `Another squad beat yours to the spot and left it picked over. ${Math.round(RIVAL_LOSS_LOOT * 100)}% less loot, and {name} has opinions about their route.`,
  ],
  shrine: [
    "A wayside shrine with fresh flowers on it. {name} left something too. The squad walked easier after it — the next fork will be kinder.",
    "A shrine at the roadside, older than the road. {name} stopped at it. Whatever is at the next fork will find the squad harder to hurt.",
  ],
  hunter: [
    // found
    "A relic hunter on the road with a pack full of maps. {name} traded for a fragment of one that shows a place the map does not.",
    "A relic hunter, going the other way, sold {name} a piece of a map. It is warm to the touch.",
    // not found
    "A relic hunter on the road, all talk and an empty pack. {name} traded stories and nothing else.",
    "A relic hunter who had sold their last fragment yesterday, to somebody {name} would like a word with.",
  ],
  // A ghost with no name: a run read without its company. The named
  // lines are GHOST_LINES.
  ghost: [
    "Something is walking beside the squad, just past the torchlight. It has a face {name} half remembers.",
    "Footsteps keeping pace with the squad all afternoon, and nobody making them. {name} stopped looking.",
  ],
};

/** The road's company, by name (COMPANY_RULES). `{rival}` is the other
 *  collector, `{ghost}` the dead card, `{owner}` whose it was, `{mate}`
 *  the squad member in its colours; `{name}` is still one of the squad. */
const RIVAL_NAMED_LINES = {
  won: [
    `{rival}'s squad on the same trail, going the same way. Yours got there first: ${Math.round(RIVAL_WIN_LOOT * 100)}% more in the bag, and {name} waved.`,
    `{rival} sent a squad down this road too. {name} saw their fire from the ridge; by morning yours was ahead and stayed there. ${Math.round(RIVAL_WIN_LOOT * 100)}% more loot.`,
    `{rival}'s squad, on your road, wanting your spot. More shine on your side of it: {name} out-walked them, and the bag is ${Math.round(RIVAL_WIN_LOOT * 100)}% heavier.`,
  ],
  lost: [
    `{rival}'s squad was already at the spot when {name} got there. ${Math.round(RIVAL_LOSS_LOOT * 100)}% less in the bag, and {name} is not talking about it.`,
    `{rival} beat the squad to it. {name} counted their shine from a distance and said nothing. ${Math.round(RIVAL_LOSS_LOOT * 100)}% less loot.`,
    `{rival}'s squad passed yours in the night and left the spot picked over. ${Math.round(RIVAL_LOSS_LOOT * 100)}% less, and {name} has opinions about their route.`,
  ],
};

const ALONE_LINES = [
  `The trail was the squad's alone tonight — no other fires on the road. An old cairn where a rival might have stood, and a cache under it: ${Math.round(CACHE_LOOT * 100)}% more in the bag.`,
  `Nobody else out this way. {name} found a cache somebody meant to come back for, and nobody was racing for it: ${Math.round(CACHE_LOOT * 100)}% more loot.`,
];

/** The other side of a meet: another run's rival encounter that picked
 *  this squad. `won` is this squad's. */
const CROSSING_LINES = {
  won: [
    "{rival}'s squad came up the same road behind yours and found the spot picked over. {name} left them a note.",
    "{rival}'s squad was on the road today, going the same way. They got to the spot after yours had been and gone.",
  ],
  lost: [
    "{rival}'s squad passed yours in the night and got to the spot first. {name} heard them laughing.",
    "{rival}'s squad was ahead of yours on the road today, and stayed ahead. {name} says their Bot cheats.",
  ],
};

const GHOST_LINES = [
  `Something is walking beside the squad, just past the torchlight, and it is wearing {ghost}'s face. {owner}'s, once. It fell on this road. {name} will not camp easily tonight — a haunting at the next fork is ${GHOST_HAUNT} times as likely.`,
  `{ghost} is on the road again. {owner} never got it home, and it has been walking since. It keeps pace with the squad and says nothing. The next camp is a bad one: the haunting is ${GHOST_HAUNT} times as likely.`,
  `Footsteps in step with the squad's all afternoon, and {name} finally looked: {ghost}, that fell here on {owner}'s run. It is heading for the same fork. Camp there and the haunting is ${GHOST_HAUNT} times as likely; push through and it cannot follow.`,
];

const GHOST_STOOD_LINES = [
  `Something was walking beside the squad — {ghost}, {owner}'s, that fell on this road. It knew {mate}'s colours and stood aside. Under the cairn where it stood, a cache: ${Math.round(CACHE_LOOT * 100)}% more in the bag.`,
  `{ghost}'s ghost stepped out of the torchlight, saw {mate} in the old colours, and stepped back. It left the squad the cache it had been keeping: ${Math.round(CACHE_LOOT * 100)}% more loot.`,
];

const ROLE_BANTER: Record<string, string[]> = {
  Top: [
    "{name} says take the long way; a Top never trusts a shortcut.",
    "{name} offers to hold the checkpoint alone and let the rest go on. Sounds like a Top.",
    "{name} has already picked a spot to stand and is standing in it.",
    "{name} says whatever you pick, pick it and stop talking.",
    "{name} would rather hold the line than cross it. Says the line is the point.",
  ],
  Jungle: [
    "{name} knows a way round and will not shut up about it.",
    "{name} wants to scout it first. Ten minutes, alone, no light.",
    "{name} says the timers are wrong here and nobody should trust the dark.",
    "{name} has counted the ways in, and there are two.",
    "{name} is already halfway up the ridge to have a look.",
  ],
  Mid: [
    "{name} wants to push. {name} always wants to push.",
    "{name} says roam for it: go wide, go fast, be gone before it notices.",
    "{name} says the tempo is theirs if the squad moves now.",
    "{name} is bored of the standing around and says so.",
    "{name} thinks the safe way is how you lose, slowly.",
  ],
  Bot: [
    "{name} is not going first, and says so.",
    "{name} wants to kite it: take what you can from range and never get close.",
    "{name} asks who is peeling. Nobody answers.",
    "{name} would rather be paid for waiting than hurt for hurrying.",
    "{name} says a full bag home beats a fuller bag lost.",
  ],
  Support: [
    "{name} wants to camp, light a fire and wait for daylight.",
    "{name} wants to ward the approach first. Then, and only then, go.",
    "{name} has a lantern, a plan and a strong opinion about the plan.",
    "{name} counted heads. Three. Wants it to stay three.",
    "{name} says whatever is decided, everyone comes home. That is the only rule.",
  ],
};

const MATES_LINES = {
  three: [
    "{a}, {b} and {c} move like a roster. They have already decided, and they are waiting for you to catch up.",
    "{a}, {b} and {c} are talking in the shorthand of people who have played a season together. Whatever it is, it is unanimous.",
  ],
  two: [
    "{a} and {b} vouch for each other. Whatever they pick, they pick together.",
    "{a} and {b} have a plan and are not sharing it with the third.",
  ],
};

const SIGNED_LINES = [
  "{name} mentions, not for the first time, that a signed card could call in a favour here.",
  "{name} taps the signature on their own card and raises an eyebrow. A favour is a favour.",
];

const FOIL_LINES = [
  "{name} is shining hard enough to light the way, if it comes to that.",
  "It is dark here, and {name} is not. A foil could light this.",
];

const WARNED_LINES = [
  "{name} says, quietly, that this is the one they were warned about.",
  "{name} does not want to be here and is being polite about it.",
];

// === the machinery ===========================================================

/** What arriving at a checkpoint reads like: the fork's own title. */
function legacyArrivalLine(tier: ExpeditionTierKey, leg: number, name: string, road: RoadRef): string {
  const fork = forksFor(tier, road)[leg];
  if (!fork) return `${name} can see the way home from here.`;
  return `The squad reached ${fork.title.toLowerCase()}. ${name} is waiting on word.`;
}

/** The legs of a run: leg i runs from the end of fork i-1 to the end of
 *  fork i, the last one to the run's end. */
function legs(run: { startedAt: string; resolvesAt: string; forks: number }): { start: Date; end: Date }[] {
  const start = new Date(run.startedAt).getTime();
  const end = new Date(run.resolvesAt).getTime();
  const windows = forkWindows(run.startedAt, run.resolvesAt, run.forks);
  const bounds = [start, ...windows.map((window) => window.opensAt.getTime()), end];
  const out: { start: Date; end: Date }[] = [];
  for (let i = 0; i + 1 < bounds.length; i += 1) out.push({ start: new Date(bounds[i]), end: new Date(bounds[i + 1]) });
  return out;
}

function at(leg: { start: Date; end: Date }, fraction: number): Date {
  return new Date(leg.start.getTime() + (leg.end.getTime() - leg.start.getTime()) * fraction);
}

/** A run's seed: the id, which nothing else shares. */
function seedOf(runId: number, leg: number, salt: number): () => number {
  return mulberry32((runId * 7919 + leg * 131 + salt) >>> 0);
}

function pick<T>(items: T[], rand: () => number): T {
  return items[Math.min(items.length - 1, Math.floor(rand() * items.length))];
}

/** A pool in a run's own order: shuffled once from the run's seed, so
 *  taking lines off the front never repeats one until the pool is spent. */
function shuffled<T>(items: T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function fill(template: string, squad: Squad, rand: () => number): string {
  const member = squad.length > 0 ? pick(squad, rand) : null;
  return fillFor(template, member);
}

function fillFor(template: string, member: Squad[number] | null): string {
  return template
    .replaceAll("{name}", member?.playerName ?? "The squad")
    .replaceAll("{role}", member?.role ?? "lane");
}

const roleWord = (member: Pick<CardCopy, "role">): string => {
  const raw = (member.role ?? "").trim().toLowerCase();
  return Object.keys(ROLE_TRAIL).find((role) => role.toLowerCase() === raw) ?? "";
};

/**
 * The encounters a run carries, decided once from its id. An Exorcism
 * has none — nothing on the trail interrupts a rite — and a run from
 * before forks existed has no legs to carry them.
 */
export function encountersFor(
  run: { id: number; tier: ExpeditionTierKey; startedAt: string; resolvesAt: string; forks: number; rules?: number; convoy?: number | null },
  company?: RoadCompany | null,
  weather?: WeatherKey | null,
): Encounter[] {
  // A run that launched before the trail existed meets nothing on it: its
  // clock, its payout and its squad are exactly what it set out with.
  if (run.rules !== undefined && run.rules < TRAIL_RULES) return [];
  if (run.tier === "exorcism" || run.forks === 0) return [];
  const road = onRoad(run);
  const withCompany = (run.rules ?? 1) >= COMPANY_RULES;
  // The weather weights the draw (WEATHER_RULES): more caches in a
  // Drought, rivals on every road and ghosts in daylight under the Watch.
  const sky = (run.rules ?? 1) >= WEATHER_RULES ? weather ?? null : null;
  const out: Encounter[] = [];
  legs(run).forEach((leg, index) => {
    const rand = seedOf(run.id, index, 1);
    if (rand() >= (road ? ROAD_ENCOUNTER_CHANCE : ENCOUNTER_CHANCE)) return;
    // Stranded cards only turn up on routes that can lose one — that is
    // where the lost are.
    // A convoy rides one clock for two squads: a storm on one run would
    // pull the forks apart, so convoys meet everything but weather.
    const keys: EncounterKey[] = run.convoy ? ["merchant"] : ["merchant", "storm"];
    if (road) keys.push("cache", "rival", "shrine", "hunter");
    if (EXPEDITION_TIERS[run.tier].risk === "lost" || EXPEDITION_TIERS[run.tier].risk === "dead") keys.push("stranded");
    // The dead walk the Legend and Legendary roads — from COMPANY_RULES,
    // so a run already out keeps the beats its journal has shown.
    if (withCompany && (run.tier === "legend" || run.tier === "legendary" || run.tier === "mythic")) keys.push("ghost");
    if (sky === "drought" && road) for (let extra = 1; extra < DROUGHT_CACHES; extra += 1) keys.push("cache");
    if (sky === "watch" && road) {
      for (let extra = 1; extra < WATCH_RIVALS; extra += 1) keys.push("rival");
      if (keys.includes("ghost")) for (let extra = 1; extra < WATCH_GHOSTS; extra += 1) keys.push("ghost");
    }
    const key = pick(keys, rand);
    const encounter: Encounter = { leg: index, key, at: at(leg, 0.5) };
    // The coin is tossed here, once, so the journal can say how it landed
    // hours before the claim reads it.
    if (key === "rival") encounter.won = rand() < RIVAL_WIN_CHANCE;
    if (key === "hunter") encounter.found = rand() < HUNTER_FRAGMENT_CHANCE;
    out.push(encounter);
  });
  // The company, read over the coins: a real rival's verdict is shine's,
  // a road with nobody on it holds a cache, a ghost has a name — and a
  // ghost draw with nobody in the graveyard yet is a cache too.
  if (withCompany && company) {
    for (const encounter of out) {
      if (encounter.key === "rival") {
        const rival = company.rivals.find((meet) => meet.leg === encounter.leg);
        if (rival) {
          encounter.won = rival.won;
          encounter.rivalName = rival.name;
        } else {
          encounter.alone = true;
        }
      } else if (encounter.key === "ghost") {
        const ghost = company.ghosts.find((meet) => meet.leg === encounter.leg);
        if (ghost) encounter.ghost = { name: ghost.cardName, owner: ghost.name, team: ghost.team, stood: ghost.stood };
        else encounter.key = "cache";
      }
    }
  }
  return out;
}

/**
 * Every journal line written so far, oldest first. `now` gates them: a
 * line the squad has not reached yet is not written yet, which is what
 * makes the page worth coming back to.
 */
export function journalFor(run: RunRef, squad: Squad, now: Date): JournalEntry[] {
  const entries = onRoad(run) ? roadJournal(run, squad) : legacyJournal(run, squad);
  const cutoff = run.claimedAt ? Number.POSITIVE_INFINITY : now.getTime();
  return entries.filter((entry) => entry.at.getTime() <= cutoff).sort((a, b) => a.at.getTime() - b.at.getTime());
}

function legacyJournal(run: RunRef, squad: Squad): JournalEntry[] {
  const entries: JournalEntry[] = [];
  const encounters = encountersFor(run);
  const road = roadOf(run);
  legs(run).forEach((leg, index) => {
    const rand = seedOf(run.id, index, 2);
    const pool = LEGACY_TRAIL[run.tier];
    const first = pick(pool, rand);
    let second = pick(pool, rand);
    if (second === first && pool.length > 1) second = pool[(pool.indexOf(first) + 1) % pool.length];
    entries.push({ at: at(leg, 0.3), leg: index, kind: "trail", text: fill(first, squad, rand) });
    const encounter = encounters.find((entry) => entry.leg === index);
    if (encounter) {
      entries.push({ at: encounter.at, leg: index, kind: "encounter", encounter: encounter.key, text: fill(LEGACY_ENCOUNTER_LINES[encounter.key], squad, rand) });
    }
    entries.push({ at: at(leg, 0.7), leg: index, kind: "trail", text: fill(second, squad, rand) });
    const last = index === run.forks;
    entries.push({
      at: leg.end,
      leg: index,
      kind: last ? "home" : "arrive",
      text: last ? "The squad is home and waiting to be collected." : legacyArrivalLine(run.tier, index, fill("{name}", squad, rand), road),
    });
  });
  return entries;
}

/**
 * The road's journal. One line a leg from the route's own pool and one
 * from a squad member's role, each pool shuffled once for the run and
 * taken in order, so nothing repeats until a pool runs dry — and a
 * different squad on the same road hears different voices, because the
 * role lines are the roles it actually fielded.
 */
function roadJournal(run: RunRef, squad: Squad): JournalEntry[] {
  const entries: JournalEntry[] = [];
  const encounters = encountersFor(run, run.company, run.weather);
  // The sky, first: the week's weather is the first thing the squad sees.
  const sky = (run.rules ?? 1) >= WEATHER_RULES && run.weather ? WEATHERS[run.weather] : null;
  const firstLeg = legs(run)[0];
  if (sky && firstLeg) entries.push({ at: at(firstLeg, 0.05), leg: 0, kind: "trail", text: sky.sky });
  const road = roadOf(run);
  const forks = forksFor(run.tier, road);
  const trail = shuffled(TRAIL[run.tier], seedOf(run.id, 0, 4));
  const byRole = new Map<string, string[]>();
  const spoken = new Set<string>();
  const roled = squad.filter((member) => roleWord(member) !== "");
  let trailAt = 0;
  legs(run).forEach((leg, index) => {
    const rand = seedOf(run.id, index, 2);
    // The route's line first, then a role's. On an odd leg the order
    // flips, so the journal does not read as a metronome.
    const route = trail.length > 0 ? trail[trailAt++ % trail.length] : "";
    const member = roled.length > 0 ? pick(roled, rand) : squad.length > 0 ? pick(squad, rand) : null;
    const role = member ? roleWord(member) : "";
    let voice = "";
    if (member && role) {
      if (!byRole.has(role)) byRole.set(role, shuffled(ROLE_TRAIL[role], seedOf(run.id, Object.keys(ROLE_TRAIL).indexOf(role), 6)));
      const pool = byRole.get(role)!;
      const line = pool.find((candidate) => !spoken.has(candidate)) ?? pool[index % pool.length];
      spoken.add(line);
      voice = fillFor(line, member);
    }
    const routeLine = fill(route, squad, rand);
    const [firstLine, secondLine] = index % 2 === 0 ? [routeLine, voice || routeLine] : [voice || routeLine, routeLine];
    // A scout at the fork just behind: the Jungle names the place ahead
    // at the start of the leg, hours before the squad reaches it.
    const scoutedBehind = index > 0 && (run.choices ?? []).some((entry) => entry.index === index - 1 && entry.choice === "scout");
    const ahead = forks[index];
    if (scoutedBehind && ahead) {
      const jungle = squad.find((member) => roleWord(member) === "Jungle") ?? null;
      entries.push({ at: at(leg, 0.12), leg: index, kind: "trail", text: fillFor(pick(SCOUTED_LINES, rand).replaceAll("{title}", ahead.title.toLowerCase()), jungle) });
    }
    entries.push({ at: at(leg, 0.3), leg: index, kind: "trail", text: firstLine });
    const encounter = encounters.find((entry) => entry.leg === index);
    if (encounter) {
      const lines = ENCOUNTER_LINES[encounter.key];
      // The rival's and the hunter's lines come in pairs: the first two
      // for a win or a find, the last two otherwise. A named rival, an
      // empty road and a named ghost have pools of their own.
      const options =
        encounter.key === "rival" && encounter.alone ? ALONE_LINES
        : encounter.key === "rival" && encounter.rivalName ? (encounter.won ? RIVAL_NAMED_LINES.won : RIVAL_NAMED_LINES.lost)
        : encounter.key === "rival" ? (encounter.won ? lines.slice(0, 2) : lines.slice(2))
        : encounter.key === "hunter" ? (encounter.found ? lines.slice(0, 2) : lines.slice(2))
        : encounter.key === "ghost" && encounter.ghost ? (encounter.ghost.stood ? GHOST_STOOD_LINES : GHOST_LINES)
        : lines;
      const mate = encounter.ghost?.team ? squad.find((member) => member.card?.teamName === encounter.ghost!.team) ?? null : null;
      const named = (sky?.key === "harvest" && encounter.key === "merchant"
        ? `${pick(options, rand).replace(String(MERCHANT_DOLLARS), String(MERCHANT_DOLLARS * HARVEST_MERCHANT))} Harvest prices.`
        : pick(options, rand))
        .replaceAll("{rival}", encounter.rivalName ?? "Another collector")
        .replaceAll("{ghost}", encounter.ghost?.name ?? "something")
        .replaceAll("{owner}", encounter.ghost?.owner ?? "Somebody")
        .replaceAll("{mate}", mate?.playerName ?? "the squad");
      entries.push({ at: encounter.at, leg: index, kind: "encounter", encounter: encounter.key, text: fill(named, squad, rand) });
    }
    entries.push({ at: at(leg, 0.7), leg: index, kind: "trail", text: secondLine });
    const last = index === run.forks;
    const fork = forks[index];
    entries.push({
      at: leg.end,
      leg: index,
      kind: last ? "home" : "arrive",
      text: last
        ? pick(HOME_LINES, rand)
        : fork
          ? fill(pick(ARRIVAL_LINES, rand).replaceAll("{title}", fork.title.toLowerCase()), squad, rand)
          : fill("{name} can see the way home from here.", squad, rand),
    });
  });
  // The other side of every meet: a run that picked this squad as its
  // rival writes the crossing here too, at the hour it happened.
  const runLegs = legs(run);
  for (const crossing of run.company?.crossings ?? []) {
    const when = new Date(crossing.at);
    const legIndex = Math.max(0, runLegs.findIndex((leg) => when.getTime() >= leg.start.getTime() && when.getTime() < leg.end.getTime()));
    const rand = seedOf(run.id, legIndex, 8 + crossing.runId % 97);
    const line = pick(crossing.won ? CROSSING_LINES.won : CROSSING_LINES.lost, rand).replaceAll("{rival}", crossing.name);
    entries.push({ at: when, leg: legIndex, kind: "encounter", encounter: "rival", text: fill(line, squad, rand) });
  }
  return entries;
}

/** The newest line, for the ping. */
export function latestJournalLine(
  run: Parameters<typeof journalFor>[0],
  squad: Squad,
  now: Date,
): string | null {
  const entries = journalFor(run, squad, now);
  return entries.length > 0 ? entries[entries.length - 1].text : null;
}

// === banter ==================================================================

/**
 * One sentence about who is standing at this fork, or null for a squad
 * the tables have nothing to say about. Teammates first (it is the rarest
 * and the one the rally rule turns on), then ink, then a role picked from
 * the squad by the fork's seed so the same squad hears a different voice
 * at each fork. On a road the pools are wider, the fork's own mood gets a
 * word (a warned fork is dreaded out loud), and each role speaks in its
 * own voice — from several lines, not one.
 */
export function banterFor(tier: ExpeditionTierKey, index: number, squad: Squad, runId = 0, road?: RoadRef | null): string | null {
  if (squad.length === 0) return null;
  const rand = seedOf(runId, index, 3);
  const wide = Boolean(road && road.rules >= ROAD_RULES);
  const fork = forksFor(tier, road)[index];
  const byTeam = new Map<string, Squad>();
  for (const copy of squad) {
    const team = (copy.card?.teamName ?? "").trim();
    if (!team) continue;
    byTeam.set(team, [...(byTeam.get(team) ?? []), copy]);
  }
  const mates = [...byTeam.values()].find((group) => group.length >= 2);
  const roll = rand();
  if (mates && roll < 0.5) {
    if (mates.length === 3) {
      const line = wide ? pick(MATES_LINES.three, rand) : MATES_LINES.three[0];
      return line.replaceAll("{a}", mates[0].playerName).replaceAll("{b}", mates[1].playerName).replaceAll("{c}", mates[2].playerName);
    }
    const line = wide ? pick(MATES_LINES.two, rand) : MATES_LINES.two[0];
    return line.replaceAll("{a}", mates[0].playerName).replaceAll("{b}", mates[1].playerName);
  }
  const signed = squad.find((copy) => copy.signed);
  if (signed && roll < 0.65) return fillFor(wide ? pick(SIGNED_LINES, rand) : SIGNED_LINES[0], signed);
  const foil = squad.find((copy) => copy.foil);
  if (foil && fork?.dark && roll < 0.8) return fillFor(wide ? pick(FOIL_LINES, rand) : FOIL_LINES[0], foil);
  const member = pick(squad, rand);
  if (!wide) {
    const line = LEGACY_ROLE_BANTER[member.role ?? ""];
    return line ? line.replaceAll("{name}", member.playerName) : null;
  }
  // The fork's own mood, sometimes: a warned fork is dreaded out loud by
  // whoever is nearest.
  if (fork?.warned && rand() < 0.35) return fillFor(pick(WARNED_LINES, rand), member);
  const role = roleWord(member);
  const lines = role ? ROLE_BANTER[role] : null;
  return lines ? fillFor(pick(lines, rand), member) : null;
}
