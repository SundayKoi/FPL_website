// The trail journal's words: every pool of lines journal.ts draws from.
// The fixed road's voice (LEGACY_*) is what a run stamped before
// ROAD_RULES keeps; the road's voice is the wider pools every later run
// draws from. Prose only — which line falls where, and when, is
// journal.ts' machinery.
//
// Server-only, like journal.ts (expeditionImports.test.ts): the board is
// handed the lines a squad has written, never the pools.

import { MERCHANT_DOLLARS, type ExpeditionTierKey } from "./config";
import { CACHE_LOOT, GHOST_HAUNT, RIVAL_LOSS_LOOT, RIVAL_WIN_LOOT, STORM_HOURS } from "./forks";

export type EncounterKey = "merchant" | "stranded" | "storm" | "cache" | "rival" | "shrine" | "hunter" | "ghost";

// === the fixed road's voice ==================================================

/** The trail, by route, as it read before the road: what the squad sees
 *  between checkpoints. `{name}` is one squad member, `{role}` their role.
 *  Each route owns its own weather; a Scouting Run should never read like
 *  the Legendary route. */
export const LEGACY_TRAIL: Record<ExpeditionTierKey, string[]> = {
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

export const LEGACY_ENCOUNTER_LINES: Record<EncounterKey, string> = {
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

export const LEGACY_ROLE_BANTER: Record<string, string> = {
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
export const TRAIL: Record<ExpeditionTierKey, string[]> = {
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
export const ROLE_TRAIL: Record<string, string[]> = {
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
export const SCOUTED_LINES = [
  "{name} came back from scouting ahead: it is {title}, and they know where not to sleep.",
  "{name} was gone an hour and returned with a sketch of the next stop — {title} — and a list of places not to camp.",
];

/** Reaching a checkpoint, in a few voices. `{title}` is the fork's. */
export const ARRIVAL_LINES = [
  "The squad reached {title}. {name} is waiting on word.",
  "{title}, ahead, and the squad has stopped. {name} is looking back down the trail for an answer.",
  "The squad is at {title}. Nobody moves until you say.",
  "{name} was first to {title} and is the first to ask what happens now.",
];

export const HOME_LINES = [
  "The squad is home and waiting to be collected.",
  "Home. The squad is at the door with the bag, waiting on you.",
  "The squad made it back and has not put the bag down yet.",
];

/** What the trail's beats read like on a road: a couple of ways each,
 *  and the rival and the hunter say how it went. */
export const ENCOUNTER_LINES: Record<EncounterKey, string[]> = {
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
export const RIVAL_NAMED_LINES = {
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

export const ALONE_LINES = [
  `The trail was the squad's alone tonight — no other fires on the road. An old cairn where a rival might have stood, and a cache under it: ${Math.round(CACHE_LOOT * 100)}% more in the bag.`,
  `Nobody else out this way. {name} found a cache somebody meant to come back for, and nobody was racing for it: ${Math.round(CACHE_LOOT * 100)}% more loot.`,
];

/** The other side of a meet: another run's rival encounter that picked
 *  this squad. `won` is this squad's. */
export const CROSSING_LINES = {
  won: [
    "{rival}'s squad came up the same road behind yours and found the spot picked over. {name} left them a note.",
    "{rival}'s squad was on the road today, going the same way. They got to the spot after yours had been and gone.",
  ],
  lost: [
    "{rival}'s squad passed yours in the night and got to the spot first. {name} heard them laughing.",
    "{rival}'s squad was ahead of yours on the road today, and stayed ahead. {name} says their Bot cheats.",
  ],
};

export const GHOST_LINES = [
  `Something is walking beside the squad, just past the torchlight, and it is wearing {ghost}'s face. {owner}'s, once. It fell on this road. {name} will not camp easily tonight — a haunting at the next fork is ${GHOST_HAUNT} times as likely.`,
  `{ghost} is on the road again. {owner} never got it home, and it has been walking since. It keeps pace with the squad and says nothing. The next camp is a bad one: the haunting is ${GHOST_HAUNT} times as likely.`,
  `Footsteps in step with the squad's all afternoon, and {name} finally looked: {ghost}, that fell here on {owner}'s run. It is heading for the same fork. Camp there and the haunting is ${GHOST_HAUNT} times as likely; push through and it cannot follow.`,
];

export const GHOST_STOOD_LINES = [
  `Something was walking beside the squad — {ghost}, {owner}'s, that fell on this road. It knew {mate}'s colours and stood aside. Under the cairn where it stood, a cache: ${Math.round(CACHE_LOOT * 100)}% more in the bag.`,
  `{ghost}'s ghost stepped out of the torchlight, saw {mate} in the old colours, and stepped back. It left the squad the cache it had been keeping: ${Math.round(CACHE_LOOT * 100)}% more loot.`,
];

export const ROLE_BANTER: Record<string, string[]> = {
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

export const MATES_LINES = {
  three: [
    "{a}, {b} and {c} move like a roster. They have already decided, and they are waiting for you to catch up.",
    "{a}, {b} and {c} are talking in the shorthand of people who have played a season together. Whatever it is, it is unanimous.",
  ],
  two: [
    "{a} and {b} vouch for each other. Whatever they pick, they pick together.",
    "{a} and {b} have a plan and are not sharing it with the third.",
  ],
};

export const SIGNED_LINES = [
  "{name} mentions, not for the first time, that a signed card could call in a favour here.",
  "{name} taps the signature on their own card and raises an eyebrow. A favour is a favour.",
];

export const FOIL_LINES = [
  "{name} is shining hard enough to light the way, if it comes to that.",
  "It is dark here, and {name} is not. A foil could light this.",
];

export const WARNED_LINES = [
  "{name} says, quietly, that this is the one they were warned about.",
  "{name} does not want to be here and is being polite about it.",
];
