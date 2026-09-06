// Auto-dust: the rule, and the pure selection that applies it.
//
// A collector says "anything at or below this rarity and this overall,
// once I already hold N copies of the player, and not my foils or signed
// copies" — and the shelf, or the pack as it opens, melts the rest without
// asking. Everything here is pure so the collection page can preview
// exactly what a rule would take before it is saved, from the same code
// the server runs.
//
// What is never auto-dusted, whatever the rule: an Eclipse (the database
// refuses it anyway), a moment, a champions relic, a team plate, or a copy
// wearing an expedition mutation.

import type { CardTier } from "@/lib/cards/build";
import type { InventoryRow } from "@/lib/packs/queries";
import { ECLIPSE_FOIL_TYPE } from "@/lib/packs/config";

export type CardTierKey = CardTier["key"];

/** Lowest first. */
export const TIER_ORDER: CardTierKey[] = ["bronze", "silver", "gold", "platinum", "emerald", "diamond", "master", "challenger"];

export const TIER_LABELS: Record<CardTierKey, string> = {
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold",
  platinum: "Platinum",
  emerald: "Emerald",
  diamond: "Diamond",
  master: "Master",
  challenger: "Challenger",
};

export interface AutoDustRule {
  enabled: boolean;
  /** The highest rarity the rule touches. */
  maxTier: CardTierKey;
  /** The highest overall the rule touches. */
  maxOverall: number;
  /** Copies of a player kept before extras go. 0 dusts every eligible copy. */
  keepCopies: number;
  /** Count the keep per (player, edition week) rather than per player, so
   *  last week's print of a player survives this week's. */
  perEdition: boolean;
  /** Apply to a pack's pulls as it opens. */
  onRip: boolean;
  skipFoil: boolean;
  skipSigned: boolean;
}

export const DEFAULT_AUTO_DUST: AutoDustRule = {
  enabled: false,
  maxTier: "silver",
  maxOverall: 60,
  keepCopies: 1,
  perEdition: false,
  onRip: true,
  skipFoil: true,
  skipSigned: true,
};

export const MAX_KEEP_COPIES = 10;

/** A copy as the rule reads it. */
export interface AutoDustCandidate {
  id: number;
  slug: string;
  tier: string;
  overall: number;
  foil: boolean;
  foilType: string | null;
  signed: boolean;
  /** A moment, a champions relic or a team plate: never dusted by rule. */
  relic: boolean;
  /** A copy that came home from an expedition changed: never dusted by
   *  rule either. A mutation is the one thing that makes a copy unlike
   *  every other copy of its print, which is exactly what a keep-N-copies
   *  rule cannot see. */
  mutation?: string | null;
  /** A print numbered past the checklist (packs/rarities.ts): never
   *  dusted by rule, for the same reason as a mutation — it is unlike
   *  every other copy of its print. */
  secret?: boolean;
  /** A Shiny counts as a foil for the skip-foil rule: it is the same kind
   *  of thing, a print you would not want swept up for being a duplicate. */
  shiny?: boolean;
  /** Older copies are kept ahead of newer ones. */
  acquiredAt?: string;
  /** The Monday of the print's week — what a per-edition keep groups on.
   *  Absent, every copy of a player counts as one edition. */
  editionWeek?: string;
}

/** The group a copy's keep count is measured in: the player, or the
 *  player's print in one week. Exported so the shelf-behind-the-pack
 *  count in autoDustServer keys its map the same way. */
export function keepGroupOf(copy: { slug: string; editionWeek?: string | null }, rule: Pick<AutoDustRule, "perEdition">): string {
  return rule.perEdition ? `${copy.slug}|${copy.editionWeek ?? ""}` : copy.slug;
}

export function candidateFromInventory(row: InventoryRow): AutoDustCandidate {
  const card = row.card as { moment?: unknown; champWin?: unknown; team?: unknown; secret?: unknown; shiny?: unknown };
  return {
    id: row.id,
    slug: row.slug,
    tier: row.tier,
    overall: row.overall,
    foil: row.foil,
    foilType: row.foilType,
    signed: row.signed,
    relic: Boolean(card.moment || card.champWin || card.team),
    mutation: row.mutation ?? null,
    secret: Boolean(card.secret),
    shiny: Boolean(card.shiny),
    acquiredAt: row.acquiredAt,
    editionWeek: row.editionWeek,
  };
}

const tierRank = (tier: string) => TIER_ORDER.indexOf(tier as CardTierKey);

/** Whether the rule would touch this copy at all, before the keep count. */
export function eligibleForAutoDust(copy: AutoDustCandidate, rule: AutoDustRule): boolean {
  if (copy.relic) return false;
  if (copy.mutation) return false;
  if (copy.secret) return false;
  if (copy.foilType === ECLIPSE_FOIL_TYPE) return false;
  if (rule.skipFoil && (copy.foil || copy.shiny)) return false;
  if (rule.skipSigned && copy.signed) return false;
  const rank = tierRank(copy.tier);
  if (rank === -1 || rank > tierRank(rule.maxTier)) return false;
  return copy.overall <= rule.maxOverall;
}

/** Which copy of a player to keep first: signed, then foil, then the
 *  higher overall, then the older print. */
function keepOrder(a: AutoDustCandidate, b: AutoDustCandidate): number {
  if (a.signed !== b.signed) return a.signed ? -1 : 1;
  if (a.foil !== b.foil) return a.foil ? -1 : 1;
  if (a.overall !== b.overall) return b.overall - a.overall;
  return (a.acquiredAt ?? "").localeCompare(b.acquiredAt ?? "");
}

/**
 * The copies a rule would dust out of `copies`. `alreadyHeld` is how many
 * copies of each keep group (keepGroupOf — the player, or the player's
 * print in one week) the collector holds that are NOT in `copies` — on a
 * rip, the shelf behind the pack — and those count toward the keep first,
 * so a new pull of a player you already keep is an extra.
 */
export function selectAutoDust(copies: AutoDustCandidate[], rule: AutoDustRule, alreadyHeld: ReadonlyMap<string, number> = new Map()): number[] {
  if (!rule.enabled) return [];
  const bySlug = new Map<string, AutoDustCandidate[]>();
  for (const copy of copies) {
    const key = keepGroupOf(copy, rule);
    const group = bySlug.get(key);
    if (group) group.push(copy);
    else bySlug.set(key, [copy]);
  }
  const out: number[] = [];
  for (const [key, group] of bySlug) {
    const held = alreadyHeld.get(key) ?? 0;
    const toKeep = Math.max(0, rule.keepCopies - held);
    const ordered = [...group].sort(keepOrder);
    for (const copy of ordered.slice(toKeep)) {
      if (eligibleForAutoDust(copy, rule)) out.push(copy.id);
    }
  }
  return out;
}

/** Whatever came from the database, as a rule with every field present. */
export function normalizeRule(raw: Partial<AutoDustRule> | null | undefined): AutoDustRule {
  const rule = { ...DEFAULT_AUTO_DUST, ...(raw ?? {}) };
  if (!TIER_ORDER.includes(rule.maxTier)) rule.maxTier = DEFAULT_AUTO_DUST.maxTier;
  rule.maxOverall = Math.max(0, Math.min(99, Math.round(Number(rule.maxOverall) || 0)));
  rule.keepCopies = Math.max(0, Math.min(MAX_KEEP_COPIES, Math.round(Number(rule.keepCopies) || 0)));
  return rule;
}
