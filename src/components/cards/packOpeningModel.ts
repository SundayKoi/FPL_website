// The pack opening's model: what a pull is, the order the line deals them
// in, which ones earn a walkout, and the arithmetic of the fan. A plain
// module (no "use client") — everything here is data or a pure function,
// shared by the stage (PackOpening) and its pieces.

import type { ReactNode } from "react";
import type { PlayerCardData } from "@/lib/cards/build";
import { patronDustValue, rarityOf, rarityRank } from "@/lib/packs/config";
import type { PackVariant, RarityClass } from "@/lib/packs/config";

/** One card out of a pack, exactly as openPackAction hands it over. */
export interface Pull {
  /** Standard packs carry a player card; collectible packs render their own face. */
  card: PlayerCardData | null;
  foil: boolean;
  /** Which parallel — null on a matte pull. */
  foilType: string | null;
  /** This copy pulled autographed — rarer than foil, and stung louder. */
  signed: boolean;
  inventoryId: number;
  /** Metadata used by non-player collectible packs. */
  displayName?: string;
  newKey?: string;
  backRarity?: RarityClass;
  renderFace?: ReactNode;
}

/** What the collector's auto-dust rule took out of a pack as it opened —
 *  those copies are already gone when the stage mounts. */
export interface AutoDusted {
  ids: number[];
  dusted: number;
  value: number;
}

/** openPackAction's return, structurally. The overlay never calls the action
 *  itself — PackShop owns that, and hands the result back through
 *  `onOpenAnother` — so a failed re-open lands in the summary bar rather than
 *  tearing the stage down. */
export type OpenResult =
  | {
      ok: true;
      cards: Pull[];
      balance: number;
      autoDusted?: AutoDusted | null;
      autoDustProtected?: boolean;
      variant?: PackVariant;
      openingId?: string | null;
      revealOrder?: number[];
      preserveOrder?: boolean;
    }
  | { ok: false; error: string };

/** The stage's rarity class, which colours the aura, the room, a card back
 *  and a walkout alike. Full literals, so Tailwind emits every one. */
export const PACK_RARITY_CLASS: Record<RarityClass, string> = {
  common: "pack-rarity-common",
  rare: "pack-rarity-rare",
  epic: "pack-rarity-epic",
  legendary: "pack-rarity-legendary",
};

export function pullRarity(pull: Pull): RarityClass {
  return pull.backRarity ?? (pull.card ? rarityOf(pull.card.tier.key) : "common");
}

/** Worst → best, so the chase card is the last back in the line. Rarity is
 *  the headline; overall breaks ties inside a class. */
function byRarityAscending(a: Pull, b: Pull): number {
  const gap = rarityRank(pullRarity(a)) - rarityRank(pullRarity(b));
  return gap !== 0 ? gap : (a.card?.overall ?? 0) - (b.card?.overall ?? 0);
}

/** God Packs carry a server-owned order. Ordinary packs keep the familiar
 *  worst-to-best contact sheet, but an event pack must reveal in its persisted
 *  1–3 / Cracked Ice / finale sequence. */
export function orderPulls(pulls: Pull[], variant: PackVariant | undefined, revealOrder: number[] | undefined, preserveOrder = false): Pull[] {
  if (preserveOrder) return [...pulls];
  if (variant === "god" && revealOrder && revealOrder.length === pulls.length) {
    const byId = new Map(pulls.map((pull) => [pull.inventoryId, pull]));
    const ordered = revealOrder.map((id) => byId.get(id)).filter((pull): pull is Pull => Boolean(pull));
    if (ordered.length === pulls.length) return ordered;
  }
  return [...pulls].sort(byRarityAscending);
}

/** This copy printed in something other than the player's base splash. */
export function isAltArt(pull: Pull): boolean {
  return Boolean(pull.card && (pull.card.artSkin ?? 0) > 0);
}

/**
 * Why this pull deserves the whole screen, in the order the labels stack.
 * Empty means it doesn't — the walkout has to stay rare enough to mean
 * something, so a lone foil or a lone alternate print is a badge in the line
 * and nothing more. A foil alternate print is two independent low rolls on
 * the same card, which is why that pair qualifies and neither half does.
 */
export function walkoutLabels(pull: Pull): string[] {
  if (!pull.card) return [];
  const rarity = rarityOf(pull.card.tier.key);
  const labels: string[] = [];
  if (rarity === "legendary") labels.push("👑 LEGENDARY");
  else if (rarityRank(rarity) >= rarityRank("epic")) labels.push("💎 DIAMOND PULL");
  if (pull.signed) labels.push("✍ SIGNED");
  if (pull.foil && isAltArt(pull)) labels.push("✦ FOIL ALT ART");
  // The finishes (src/lib/packs/rarities.ts). A Secret is the rarest thing
  // an ordinary pull can be and a Shiny is rarer than a foil; both earn
  // the walkout. StatTrak is one pack in ten — a badge in the line.
  if (pull.card.secret) labels.push("🔒 SECRET");
  if (pull.card.shiny) labels.push("★ SHINY");
  return labels;
}

/**
 * Which of these pulls the user hasn't got a copy of yet, walking the pack in
 * order so a pack containing the same player twice marks the first one NEW
 * and the second one a duplicate. Pure: it returns the grown set rather than
 * mutating the one it was handed, so it's safe inside a state initializer.
 */
export function markNew(pulls: Pull[], owned: Set<string>): { flags: boolean[]; seen: Set<string> } {
  const seen = new Set(owned);
  const flags = pulls.map((pull) => {
    const key = pull.newKey ?? pull.card?.slug;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { flags, seen };
}

/** What one pull dusts for. The flags matter: without them a pulled
 *  moment or champions relic would price as the placeholder gold tier
 *  its wrapper carries, and the button would offer $10 for a $150
 *  relic. Priced on the client only to LABEL the button — the action
 *  re-derives every value server-side from the row's own columns. */
export function pullDustValue(pull: Pull, patron: boolean): number {
  return pull.card
    ? patronDustValue(
        {
          tier: pull.card.tier.key,
          foil: pull.foil,
          foilType: pull.foilType,
          signed: pull.signed,
          moment: Boolean(pull.card.moment),
          champWin: Boolean(pull.card.champWin),
          shiny: Boolean(pull.card.shiny),
          secret: Boolean(pull.card.secret),
        },
        patron,
      )
    : 0;
}

/** The shallow fan: −6° on the left through +6° on the right. */
export function arcAngle(index: number, count: number): number {
  return count <= 1 ? 0 : -6 + (12 * index) / (count - 1);
}

/** Edges of the fan sit lower than the middle, the way a held hand does. */
export function arcLift(index: number, count: number): number {
  return Math.abs(index - (count - 1) / 2) * 7;
}

/** A short buzz on the burst. Phones only, and never a reason to throw. */
export function buzz(pattern: number[]): void {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(pattern);
    }
  } catch {
    /* a silent burst is still a burst */
  }
}
