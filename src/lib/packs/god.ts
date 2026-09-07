import type { PlayerCardData } from "@/lib/cards/build";
import { PACK_SIZE, RARITY_ORDER, rarityOf, rarityRank, type FoilType, type RarityClass } from "./config";

export interface GodPackPull {
  card: PlayerCardData;
  foil: true;
  foilType: FoilType;
  signed: boolean;
  autograph: string | null;
}

const TARGET_WEIGHTS: Record<"epic" | "legendary", number> = { epic: 80, legendary: 20 };

function distinctSlugCount(cards: PlayerCardData[]): number {
  return new Set(cards.map((card) => card.slug)).size;
}

function unusedOrAll(cards: PlayerCardData[], used: ReadonlySet<string>, allowDuplicates: boolean): PlayerCardData[] {
  const unused = cards.filter((card) => !used.has(card.slug));
  return unused.length > 0 || !allowDuplicates ? unused : cards;
}

function pick<T>(items: T[], rand: () => number): T {
  return items[Math.min(items.length - 1, Math.max(0, Math.floor(rand() * items.length)))];
}

function pickWeightedClass(classes: RarityClass[], rand: () => number): RarityClass {
  const total = classes.reduce((sum, rarity) => sum + TARGET_WEIGHTS[rarity as "epic" | "legendary"], 0);
  let ticket = rand() * total;
  for (const rarity of classes) {
    ticket -= TARGET_WEIGHTS[rarity as "epic" | "legendary"];
    if (ticket < 0) return rarity;
  }
  return classes[classes.length - 1];
}

function candidatesForClass(
  cards: PlayerCardData[],
  rarity: RarityClass,
  used: ReadonlySet<string>,
  allowDuplicates: boolean,
): PlayerCardData[] {
  return unusedOrAll(cards.filter((card) => rarityOf(card.tier.key) === rarity), used, allowDuplicates);
}

/**
 * Selects the best available fallback below `floor`, preserving the rule that
 * a small edition changes the player choice, never the player's real rating.
 */
function fallbackBelow(
  cards: PlayerCardData[],
  floor: RarityClass,
  used: ReadonlySet<string>,
  allowDuplicates: boolean,
): PlayerCardData[] {
  const available = unusedOrAll(cards, used, allowDuplicates);
  for (let rank = rarityRank(floor) - 1; rank >= 0; rank -= 1) {
    const found = available.filter((card) => rarityOf(card.tier.key) === RARITY_ORDER[rank]);
    if (found.length > 0) return found;
  }
  return available;
}

function chooseTarget(
  cards: PlayerCardData[],
  used: Set<string>,
  allowDuplicates: boolean,
  rand: () => number,
): PlayerCardData {
  const classes = (["epic", "legendary"] as const).filter(
    (rarity) => candidatesForClass(cards, rarity, used, allowDuplicates).length > 0,
  );
  const candidates = classes.length > 0
    ? candidatesForClass(cards, pickWeightedClass([...classes], rand), used, allowDuplicates)
    : fallbackBelow(cards, "epic", used, allowDuplicates);
  return pick(candidates, rand);
}

function chooseHighest(
  cards: PlayerCardData[],
  used: Set<string>,
  allowDuplicates: boolean,
  rand: () => number,
): PlayerCardData {
  const available = unusedOrAll(cards, used, allowDuplicates);
  const highestRank = Math.max(...available.map((card) => rarityRank(rarityOf(card.tier.key))));
  return pick(available.filter((card) => rarityRank(rarityOf(card.tier.key)) === highestRank), rand);
}

function reserveFinale(
  cards: PlayerCardData[],
  signaturesBySlug: ReadonlyMap<string, string>,
  used: Set<string>,
  allowDuplicates: boolean,
  rand: () => number,
): { card: PlayerCardData; signed: boolean; autograph: string | null } {
  const signable = cards.filter((card) => signaturesBySlug.has(card.slug));
  const candidates = signable.length > 0 ? signable : cards;
  const card = chooseHighest(candidates, used, allowDuplicates, rand);
  const autograph = signaturesBySlug.get(card.slug) ?? null;
  return { card: autograph ? { ...card, autograph } : card, signed: autograph !== null, autograph };
}

function chooseLegendaryIce(
  cards: PlayerCardData[],
  used: Set<string>,
  allowDuplicates: boolean,
  rand: () => number,
): PlayerCardData {
  const legendaries = candidatesForClass(cards, "legendary", used, allowDuplicates);
  return legendaries.length > 0 ? pick(legendaries, rand) : pick(fallbackBelow(cards, "legendary", used, allowDuplicates), rand);
}

/**
 * Pure God Pack roller. It deliberately owns all five slots and never calls
 * the ordinary pack roller or autograph pass. `cards` must already be the
 * requested archived edition and league pool; every card is otherwise kept
 * byte-for-byte intact.
 *
 * Selection precedence is explicit: reserve the signed finale first, reserve
 * the Cracked Ice slot second, fill the three 80/20 Epic/Legendary slots last.
 * Unused players win over duplicates; duplicates are allowed only when the
 * edition contains fewer than five distinct eligible players.
 */
export function rollGodPack(
  cards: PlayerCardData[],
  signaturesBySlug: ReadonlyMap<string, string>,
  rand: () => number,
): GodPackPull[] {
  if (cards.length === 0) return [];
  const allowDuplicates = distinctSlugCount(cards) < PACK_SIZE;
  const used = new Set<string>();
  const pulls: GodPackPull[] = [];

  const finale = reserveFinale(cards, signaturesBySlug, used, allowDuplicates, rand);
  used.add(finale.card.slug);

  const ice = chooseLegendaryIce(cards, used, allowDuplicates, rand);
  used.add(ice.slug);
  pulls.push({ card: ice, foil: true, foilType: "ice", signed: false, autograph: null });

  for (let position = 0; position < 3; position += 1) {
    const card = chooseTarget(cards, used, allowDuplicates, rand);
    used.add(card.slug);
    pulls.push({
      card,
      foil: true,
      foilType: (["prisma", "aurora", "refractor"] as const)[position],
      signed: false,
      autograph: null,
    });
  }

  // A signature row outside this edition cannot make the finale a real
  // refractor/ice split. If nobody in this pool can sign, Cracked Ice is
  // guaranteed even when the account has ink elsewhere.
  const editionHasSignature = cards.some((card) => signaturesBySlug.has(card.slug));
  const finaleType: FoilType = finale.signed || editionHasSignature
    ? (rand() < 0.5 ? "refractor" : "ice")
    : "ice";
  pulls.push({ ...finale, foil: true, foilType: finaleType });

  // Return the intended reveal order: positions 1–3, Cracked Ice position 4,
  // then the finale. The constrained reservations above are implementation
  // order only and must never leak into the presentation order.
  const reservedIce = pulls[0];
  const targets = pulls.slice(1, 4);
  return [...targets, reservedIce, pulls[pulls.length - 1]];
}
