// Turning the site's cards into the thin ShowdownCard the engine reads,
// and dealing a house stack. Pure; tested.

import type { PlayerCardData } from "@/lib/cards/build";
import type { InventoryRow } from "@/lib/packs/queries";
import { STACK_SIZE, type Bracket } from "./config";
import { ROLES, TIER_ORDER, type Role, type ShowdownCard, type TierKey } from "./hands";

function roleOf(label: string): Role {
  const found = ROLES.find((role) => role.toLowerCase() === label.toLowerCase());
  if (found) return found;
  // card_inventory.role stores the raw mode on older rows.
  const raw: Record<string, Role> = { TOP: "Top", JUNGLE: "Jungle", MIDDLE: "Mid", BOTTOM: "Bot", UTILITY: "Support" };
  return raw[label.toUpperCase()] ?? "Mid";
}

function tierOf(key: string): TierKey {
  return (TIER_ORDER as readonly string[]).includes(key) ? (key as TierKey) : "bronze";
}

/** A copy you own, as the engine sees it. The id is the inventory id, so
 *  two copies of one player are two cards. */
export function cardFromInventory(row: InventoryRow): ShowdownCard {
  return {
    id: String(row.id),
    art: `/copy/${row.id}/card.png`,
    name: row.card.name ?? row.playerName,
    role: roleOf(row.card.role ?? row.role),
    team: row.card.teamName ?? "—",
    tier: tierOf(row.card.tier?.key ?? row.tier),
    overall: row.overall,
    foil: row.foil,
  };
}

/** A card from an edition (the board, or a house stack). The id carries
 *  the week so the same player from two weeks stays two cards. */
export function cardFromEdition(card: PlayerCardData, week: string): ShowdownCard {
  return {
    id: `${card.slug}@${week}`,
    art: `/card/${card.slug}/card.png?w=${week}`,
    name: card.name,
    role: roleOf(card.role),
    team: card.teamName ?? "—",
    tier: tierOf(card.tier.key),
    overall: card.overall,
    foil: false,
  };
}

/**
 * A house stack: STACK_SIZE cards drawn from the edition that fit the
 * bracket's cap. Draw at random; while the total is over the cap, swap
 * the heaviest card in for the lightest one left out. Returns null when
 * even the lightest ten cannot fit, which no real edition produces.
 */
export function dealHouseStack(edition: ShowdownCard[], bracket: Bracket, rand: () => number): ShowdownCard[] | null {
  if (edition.length < STACK_SIZE) return null;
  const pool = [...edition];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const stack = pool.slice(0, STACK_SIZE);
  const rest = pool.slice(STACK_SIZE).sort((a, b) => a.overall - b.overall);
  const total = () => stack.reduce((sum, card) => sum + card.overall, 0);
  while (total() > bracket.stackCap) {
    const lightest = rest.shift();
    if (!lightest) return null;
    let heaviest = 0;
    for (let i = 1; i < stack.length; i += 1) if (stack[i].overall > stack[heaviest].overall) heaviest = i;
    if (lightest.overall >= stack[heaviest].overall) return null;
    stack[heaviest] = lightest;
  }
  return stack;
}

export function stackTotal(cards: { overall: number }[]): number {
  return cards.reduce((sum, card) => sum + card.overall, 0);
}
