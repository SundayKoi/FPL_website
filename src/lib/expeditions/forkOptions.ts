// The choices at a fork: what the squad's own cards unlock
// (squadAbilities), the options the page lists and what the squad's edges
// do to each (forkOptions), whether a choice is one the squad can make
// (choiceAllowed), and how each kind of push shapes the fork's numbers
// (PUSH_SHAPE, and VETERAN_SHAPE in a Veteran's hands) — read here for the
// page and in resolveRoute.ts for the claim.
//
// Part of routes.ts, which re-exports it; see the rules there.

import { isVeteran } from "./trail";
import type { WeatherKey } from "./weather";
import {
  ARCHETYPE_ABILITIES,
  ASSASSIN_DEEP,
  CLUTCH_HARM,
  COINFLIP_SWING,
  CONDUCTOR_STREAK,
  EDGE,
  EDGE_BIG,
  EDGE_SMALL,
  FREE_WIN_LOSE,
  FRONTLINE_DEEP,
  GLASS_CANNON_HARM,
  HEATER_STREAK,
  HIGHLIGHT_REWARD,
  HYPERCARRY_LAST,
  ISLAND_HOLD,
  ISLAND_HOLDS,
  JUGGERNAUT_WOUND,
  LANE_BULLY_BONUS,
  PLATE_TOLL,
  POSITIONING_HARM,
  POWER_FARMER_CAMP,
  SKIRMISH_HARM,
  SPACE_HAUNT,
  STREAK_CAP,
  SURGEON_WOUND,
  TURRET_FINDS,
  WAVE_CAMP_WOUND,
  WEAKSIDE_HARM,
} from "./archetypes";
import type { CardCopy, ExpeditionTierKey } from "./config";
import {
  DEAD_NEEDS_PUSHES,
  ROAD_RULES,
  ROLE_CALLS,
  ROLE_CALL_BY_CHOICE,
  VETERAN_TEASE,
  isCampChoice,
  isRoleCall,
  type ForkChoice,
  type ForkEdge,
  type ForkOption,
  type RoadRef,
  type RoleCall,
} from "./forks";
import { pct } from "./format";
import { forksFor, tollCost, underWeather, type ForkDef } from "./roads";
import { EDGE_TITLE, SHIELDS, caller, countedEdges, inRole, pctOf, type EdgeTitle } from "./routeEdges";

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

// === the shape of a push ======================================================

/** How each kind of push shapes the fork's numbers: what it multiplies
 *  the loot bonus by, what it scales the wound roll by, what it scales the
 *  lost and dead rolls by, and whose head the harm lands on. */
export type PushShape = { bonus: number; risk: number; deepRisk: number; victims: "one" | "two" | "jungle" };

export const PUSH_SHAPE: Record<Exclude<ForkChoice, "camp" | "hold">, PushShape> = {
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
