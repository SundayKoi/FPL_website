// Every rarity a card can pull, as one list the site can print.
//
// The odds live in a dozen config files, each next to the code that
// enforces it, which is right for the code and useless for a reader who
// wants to know what a Cracked Ice is and how often one comes. This module
// reads those files and lays them out as sections — the tiers, the
// parallels, the finishes, the inserts, the stamps — with every number
// computed from the constant that actually rolls it, so the page can never
// say a rate the shop does not pay. /cards/rarities renders it; the
// Discord announcement reads the same list.

import { CHAMPION_DUST, CHAMPION_FOIL_CHANCE, CHAMPION_SIGNED_CHANCE, CHAMPIONS_PACK_COST } from "./champions";
import { MOMENT_DUST, MOMENT_PULL_CHANCE } from "./moments";
import { MUTATION_EFFECTS, MUTATIONS } from "./mutations";
import { LINE_TIERS, lineTierLabel, seasonLineOf } from "./skinLines";
import { TEAM_DUST, TEAM_PULL_CHANCE } from "./teamCards";
import { tierLabel } from "./tier";
import { WEAR_GRADES } from "./wear";
import {
  ALT_SKIN_CHANCE,
  DUST_VALUES,
  ECLIPSE_CHANCE,
  FOIL_CHANCE,
  FOIL_TYPE_DUST_MULT,
  FOIL_TYPE_LABELS,
  FOIL_TYPE_WEIGHTS,
  FOIL_TYPES,
  GUARANTEED_CLASS,
  LIVE_FOIL_CHANCE,
  PACK_SIZE,
  RARITY_BY_TIER,
  RARITY_ORDER,
  RARITY_WEIGHTS,
  SECRET_CHANCE,
  SECRET_DUST_MULT,
  SHINY_CHANCE,
  SHINY_DUST_MULT,
  SIGNED_ALT_SKIN_CHANCE,
  SIGNED_CHANCE,
  SIGNED_DUST_BASE,
  STATTRAK_CHANCE,
  type CardTierKey,
  type RarityClass,
} from "@/lib/packs/config";

export interface RarityEntry {
  key: string;
  name: string;
  /** What it is and what it looks like, in a sentence or two. */
  look: string;
  /** How it comes — the gate, in words. */
  how: string;
  /** "1 in 64 cards" or "Every card" — the per-card odds, printed. */
  odds: string;
  /** Per-pack odds, when a per-card rate has one. */
  perPack?: string;
  /** What it does to dust, or to anything else that prices it. */
  value: string;
  /** Marks an entry that is new with this release. */
  fresh?: boolean;
}

export interface RaritySection {
  key: "tiers" | "parallels" | "finishes" | "inserts" | "stamps" | "wear";
  title: string;
  intro: string;
  entries: RarityEntry[];
}

/** "1 in 64" from a probability. Rounded to the nearest whole, because a
 *  reader remembers "one in sixty-four" and not "1.5625%". */
export function oneIn(chance: number): string {
  if (chance <= 0) return "never";
  if (chance >= 1) return "every card";
  return `1 in ${Math.round(1 / chance).toLocaleString("en-US")}`;
}

/** "7.6%" — the chance at least one of a pack's cards hits a per-card gate. */
export function perPackPct(chance: number, size = PACK_SIZE): string {
  const pct = (1 - (1 - chance) ** size) * 100;
  return `${pct >= 10 ? Math.round(pct) : pct.toFixed(1)}% of packs`;
}

const RARITY_LABELS: Record<RarityClass, string> = {
  common: "Common",
  rare: "Rare",
  epic: "Epic",
  legendary: "Legendary",
};

function tiersOf(rarity: RarityClass): string {
  return (Object.keys(RARITY_BY_TIER) as CardTierKey[])
    .filter((tier) => RARITY_BY_TIER[tier] === rarity)
    .map(tierLabel)
    .join(", ");
}

function times(mult: number): string {
  return `×${Number.isInteger(mult) ? mult : mult.toFixed(1).replace(/\.0$/, "")}`;
}

/**
 * The whole guide, for a season (which decides what the parallels are
 * called) and a league (the Faceless Drop is premier only).
 */
export function rarityGuide(season: string | null, league: "premier" | "academy" = "premier"): RaritySection[] {
  const weightTotal = RARITY_ORDER.reduce((sum, rarity) => sum + RARITY_WEIGHTS[rarity], 0);
  const tiers: RarityEntry[] = RARITY_ORDER.map((rarity) => {
    const chance = RARITY_WEIGHTS[rarity] / weightTotal;
    return {
      key: rarity,
      name: RARITY_LABELS[rarity],
      look: `${tiersOf(rarity)}.`,
      how:
        rarity === GUARANTEED_CLASS
          ? "Rolled per card by weight — and every pack's last slot is re-rolled to at least this class, so no pack is five commons."
          : "Rolled per card by weight.",
      odds: `${Math.round(chance * 100)}% of cards`,
      value: `Dusts for $${DUST_VALUES[rarity]}.`,
    };
  });

  const line = seasonLineOf(season);
  const foilTotal = FOIL_TYPES.reduce((sum, type) => sum + FOIL_TYPE_WEIGHTS[type], 0);
  const parallels: RarityEntry[] = FOIL_TYPES.map((type) => {
    const tier = LINE_TIERS.find((entry) => entry.replaces === type);
    const name = line && tier ? lineTierLabel(line, tier) : FOIL_TYPE_LABELS[type];
    const chance = FOIL_CHANCE * (FOIL_TYPE_WEIGHTS[type] / foilTotal);
    return {
      key: type,
      name,
      look: line && tier ? (tier.does || `${line.look}`) : `The ${FOIL_TYPE_LABELS[type]} light over the art.`,
      how: `A foil (${Math.round(FOIL_CHANCE * 100)}% per card, ${Math.round(LIVE_FOIL_CHANCE * 100)}% during Live Drops), then this rung of the ladder.`,
      odds: `${oneIn(chance)} cards`,
      perPack: perPackPct(chance),
      value: `Dust ${times(FOIL_TYPE_DUST_MULT[type])}.`,
    };
  });
  parallels.push({
    key: "eclipse",
    name: "Eclipse",
    look: "The one-of-one: a black card lit from behind, the art drained and the frame burning. Its serial reads 1 of 1.",
    how: "Only a Card of the Week can go Eclipse, and only one Eclipse of each print will ever exist. Once it is found, that print's week can never drop another.",
    odds: `${oneIn(ECLIPSE_CHANCE)} Cards of the Week`,
    value: "Cannot be dusted. Listed in the Vault with everyone who has ever held it.",
  });

  const finishes: RarityEntry[] = [
    {
      key: "shiny",
      name: "Shiny",
      look: "The same card in the wrong colours — the art hue-shifted, a sparkle bursting over it, a pink ★ SHINY pill in the badge row.",
      how: "Rolled on every player card after its parallel and its ink, independently of both. A Shiny can be foil; a Shiny can be signed.",
      odds: `${oneIn(SHINY_CHANCE)} cards`,
      perPack: perPackPct(SHINY_CHANCE),
      value: `Dust ${times(SHINY_DUST_MULT)}, over the parallel. Worth +2 shine on an expedition.`,
      fresh: true,
    },
    {
      key: "stattrak",
      name: "StatTrak™",
      look: "An orange counter on the back and a pill on the front, counting the fantasy points this copy scores while you own it. Trade it and it resets to zero for the new owner.",
      how: "Rolled on every player card. The count starts at zero the moment it is pulled and climbs with every Fantasy week the copy is fielded.",
      odds: `${oneIn(STATTRAK_CHANCE)} cards`,
      perPack: perPackPct(STATTRAK_CHANCE),
      value: "No change to dust: the number is the value.",
      fresh: true,
    },
    {
      key: "secret",
      name: "Secret",
      look: "A print numbered past the checklist — in a 120-card season the first Secret found is #121/120 — with a gold line just inside the frame and a SECRET pill. It was never on the list.",
      how: "Rolled on every player card, at most one per pack. Announced to the cards channel when it lands, like an Eclipse.",
      odds: `${oneIn(SECRET_CHANCE)} cards`,
      perPack: perPackPct(SECRET_CHANCE),
      value: `Dust ${times(SECRET_DUST_MULT)}, over the parallel. +3 shine on an expedition. Auto-dust will never touch one.`,
      fresh: true,
    },
  ];

  const inserts: RarityEntry[] = [
    {
      key: "signed",
      name: "Autograph",
      look: "The player's own drawn signature inked across the front, with a ✍ SIGNED pill.",
      how: `Rolled on every card whose player has drawn a signature. Gold or crimson ink on a patron's card.`,
      odds: `${oneIn(SIGNED_CHANCE)} cards`,
      perPack: perPackPct(SIGNED_CHANCE),
      value: `+$${SIGNED_DUST_BASE.toLocaleString("en-US")} to dust, on any tier.`,
    },
    {
      key: "alt",
      name: "Alternate print",
      look: "The card in a different skin of the player's signature champion, rather than the base splash.",
      how: `${Math.round(ALT_SKIN_CHANCE * 100)}% of cards; ${Math.round(SIGNED_ALT_SKIN_CHANCE * 100)}% of signed cards, so a signed foil alternate is the chase.`,
      odds: `${oneIn(ALT_SKIN_CHANCE)} cards`,
      value: "No change to dust.",
    },
    {
      key: "moment",
      name: "Moment",
      look: "One single game, as a card: the line, the stats, the date. The rarest games of the season, one print each week they happen.",
      how: `Takes a slot in a pack from a week that has one.`,
      odds: `${oneIn(MOMENT_PULL_CHANCE)} packs`,
      value: `Dusts flat for $${MOMENT_DUST.toLocaleString("en-US")}.`,
    },
    {
      key: "plate",
      name: "Roster plate",
      look: "A whole team on one card — the five, the badge, the colours.",
      how: "Takes a slot in a pack from its own edition week.",
      odds: `${oneIn(TEAM_PULL_CHANCE)} packs`,
      value: `Dusts flat for $${TEAM_DUST}.`,
    },
    ...(league === "premier"
      ? [
          {
            key: "relic",
            name: "Champions relic",
            look: "The Faceless Drop: last season's champions as the Dealer's Hand — K, A, Q, 7 and the Joker.",
            how: `One card per Faceless Pack ($${CHAMPIONS_PACK_COST}), while the vault is open. Foil ${Math.round(CHAMPION_FOIL_CHANCE * 100)}%; signed ${Math.round(CHAMPION_SIGNED_CHANCE * 100)}% where the champion has drawn a signature.`,
            odds: "every Faceless Pack",
            value: `Dusts flat for $${CHAMPION_DUST}; the foil does not multiply.`,
          },
        ]
      : []),
  ];

  const stamps: RarityEntry[] = [
    {
      key: "live",
      name: "● Live",
      look: "A red stamp in the badge row.",
      how: "Opened while a Live Drops window was open — foil odds were boosted, and every card in the pack is stamped.",
      odds: "every card in the window",
      value: "Provenance only.",
    },
    {
      key: "chase",
      name: "★ Chase",
      look: "A gold stamp in the badge row.",
      how: "The first copy in the league to match the week's chase. One a week, and it pays the bounty.",
      odds: "one a week",
      value: "Provenance only — the bounty was the prize.",
    },
    {
      key: "draw",
      name: "Weekly Draw laurel",
      look: "A laurel on the left edge of the card.",
      how: "The copy that won a Weekly Draw.",
      odds: "one a week",
      value: "Provenance only.",
    },
    {
      key: "mark",
      name: "Expedition marks",
      look: "Trail, Sigil, Legend — a mark at the foot of the card, replaceable only upward.",
      how: "Come home from an expedition. The better the route and the result, the better the mark.",
      odds: "earned",
      value: "Provenance only.",
    },
    {
      key: "mutation",
      name: "Mutations",
      look: `${MUTATIONS.map((mutation) => mutation.label).join(", ")} — a permanent change the card wears, one per copy, until an Exorcism.`,
      how: "A chance on every expedition that goes badly, or strangely. Read by Fantasy, the Gauntlet and dust.",
      odds: "earned",
      value: MUTATIONS.map((mutation) => `${mutation.label} ${times(MUTATION_EFFECTS[mutation.key].dustMult)}`).join(" · "),
    },
    {
      key: "echo",
      name: "Echo",
      look: "A card an expedition found rather than a pack: a moment on the squad echoed, and the route dropped a card from that moment's game.",
      how: "A chance on any expedition carrying a moment.",
      odds: "earned",
      value: "Provenance only.",
    },
  ];

  const gradeWords = WEAR_GRADES.map((grade, index) => {
    const next = WEAR_GRADES[index + 1];
    const range = next ? (grade.min === next.min - 1 ? `${grade.min}` : `${grade.min}–${next.min - 1}`) : `${grade.min}+`;
    return `${grade.label} (${range})`;
  }).join(", ");
  const wear: RarityEntry[] = [
    {
      key: "wear",
      name: "Wear grades",
      look: `${gradeWords} — a pill in the badge row from the first fielding, scuffs on the face from Well-Worn on. The back keeps the count.`,
      how: "Every copy, from its own record: an expedition launch, a Gauntlet run and a scored Fantasy week each count one. A copy that stays on the shelf stays Factory New.",
      odds: "every copy",
      value: "Cosmetic. Nothing prices wear.",
      fresh: true,
    },
    {
      key: "slab",
      name: "Slabbing",
      look: "An acrylic case around the card with the grade it was sealed at. The wear under it never moves again.",
      how: "Your call, once, from the copy's drawer on your collection. A slabbed copy can never be fielded again — not on an expedition, not in the Gauntlet, not in Fantasy — and the seal can never be taken off. It can still be sold, traded or dusted.",
      odds: "your choice",
      value: "Cosmetic — and permanent.",
      fresh: true,
    },
  ];

  return [
    {
      key: "tiers",
      title: "Tiers",
      intro: `Every card has a tier from its rating. Packs roll ${PACK_SIZE} cards by class weight, and the tier is what everything else multiplies.`,
      entries: tiers,
    },
    {
      key: "parallels",
      title: line ? `Parallels — the ${line.label} line` : "Parallels",
      intro: line
        ? `Every foil this season is drawn in the ${line.skinLine} skin line, in four tiers. A foil is ${Math.round(FOIL_CHANCE * 100)}% per card; inside that the ladder decides which tier. Eclipse sits above the ladder and is not a tier of anything.`
        : `A foil is ${Math.round(FOIL_CHANCE * 100)}% per card; inside that the ladder decides which parallel. Eclipse sits above the ladder.`,
      entries: parallels,
    },
    {
      key: "finishes",
      title: "Finishes",
      intro: "Three more things a player card can come out as, each on its own gate, rolled after the parallel and the ink and independent of both. A moment, a plate, a relic or an Eclipse never takes one.",
      entries: finishes,
    },
    {
      key: "inserts",
      title: "Inserts and ink",
      intro: "Pulls that are not a player card's tier or finish: the signature, the print, and the cards that take a slot of their own.",
      entries: inserts,
    },
    {
      key: "stamps",
      title: "Provenance",
      intro: "Stamps a copy earns from how it entered the world and what it has been through. Frozen on the copy, so they survive trades.",
      entries: stamps,
    },
    {
      key: "wear",
      title: "Wear and slabbing",
      intro: "A copy's history, worn on the card — and the one way to freeze it.",
      entries: wear,
    },
  ];
}
