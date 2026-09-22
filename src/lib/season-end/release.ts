import { FOIL_CHANCE, FOIL_TYPE_WEIGHTS, SIGNED_CHANCE_CAP, type MintableFoilType } from "@/lib/packs/config";
import type { SeasonEndCatalog, SeasonEndKind, SeasonEndCollectible } from "./collectibles";

/** Pure release contract shared by the catalog builder, UI copy and tests. */
export const SEASON_END_RELEASE_PRODUCT = "season_end" as const;
export const SEASON_END_PACK_SIZE = 5 as const;
export const SEASON_END_PACK_PRICE = 500 as const;
export const SEASON_END_RULES_VERSION = "season-end-2026-09-v1" as const;
export const SEASON_END_ECONOMY_VERSION = "season-end-economy-2026-09-v1" as const;

export interface SeasonEndEconomyRules {
  version: typeof SEASON_END_ECONOMY_VERSION;
  patronMultiplier: number;
  signatureBonus: number;
  foilDustMultipliers: Record<MintableFoilType, number>;
  baseSalvageByKind: Record<SeasonEndKind, number>;
}

export interface SeasonEndReleaseRules {
  foilChance: number;
  slot34FamilyWeights: Record<"accolade" | "best_of", number>;
  slot5FamilyWeights: Record<SeasonEndKind, number>;
  guaranteedSlot: 5;
  signatureChanceCap: number;
  foilTypeWeights: Record<MintableFoilType, number>;
}

export const SEASON_END_RELEASE_RULES: SeasonEndReleaseRules = {
  foilChance: FOIL_CHANCE,
  slot34FamilyWeights: { accolade: 50, best_of: 50 },
  slot5FamilyWeights: { season: 50, accolade: 25, best_of: 25 },
  guaranteedSlot: 5,
  signatureChanceCap: SIGNED_CHANCE_CAP,
  foilTypeWeights: { ...FOIL_TYPE_WEIGHTS },
};

export const SEASON_END_ECONOMY: SeasonEndEconomyRules = {
  version: SEASON_END_ECONOMY_VERSION,
  patronMultiplier: 1.2,
  signatureBonus: 1200,
  foilDustMultipliers: { prisma: 2, aurora: 3, refractor: 4.5, ice: 6.5 },
  baseSalvageByKind: { season: 20, best_of: 30, accolade: 30 },
};

export interface SeasonEndSigningBookEntry {
  playerKey: string;
  autograph: string;
}

/**
 * A player may have both a Season Card and a Best Of design in one release.
 * The frozen book is keyed by player identity, not by design, so duplicate
 * design references are harmless while conflicting ink is a hard build error.
 */
export function buildSeasonEndSigningBook(
  catalog: Pick<SeasonEndCatalog, "designs">,
  signaturesByPlayerKey: ReadonlyMap<string, string>,
): { entries: SeasonEndSigningBookEntry[]; errors: string[] } {
  const byPlayer = new Map<string, string>();
  const errors: string[] = [];
  const signable = catalog.designs.filter(
    (design): design is Extract<SeasonEndCollectible, { kind: "season" | "best_of" }> =>
      design.kind === "season" || design.kind === "best_of",
  );
  for (const design of signable) {
    const playerKey = design.player.key;
    const autograph = signaturesByPlayerKey.get(playerKey);
    if (!autograph) continue;
    const previous = byPlayer.get(playerKey);
    if (previous && previous !== autograph) {
      errors.push(`Conflicting autograph choices for ${playerKey}`);
      continue;
    }
    byPlayer.set(playerKey, autograph);
  }
  return {
    entries: [...byPlayer.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([playerKey, autograph]) => ({ playerKey, autograph })),
    errors,
  };
}

export function validateSeasonEndSigningBook(value: unknown): string[] {
  if (!Array.isArray(value)) return ["Season's End signing book must be an array"];
  const errors: string[] = [];
  const keys = new Set<string>();
  for (const entry of value) {
    if (!entry || typeof entry !== "object") {
      errors.push("Season's End signing book contains a non-object entry");
      continue;
    }
    const candidate = entry as Partial<SeasonEndSigningBookEntry>;
    if (typeof candidate.playerKey !== "string" || !candidate.playerKey.trim() || typeof candidate.autograph !== "string" || !candidate.autograph.trim()) {
      errors.push("Season's End signing book contains an invalid entry");
    } else if (keys.has(candidate.playerKey)) {
      errors.push(`Season's End signing book repeats ${candidate.playerKey}`);
    } else {
      keys.add(candidate.playerKey);
    }
  }
  return errors;
}

export function validateSeasonEndReleaseRules(rules: SeasonEndReleaseRules): string[] {
  const errors: string[] = [];
  if (!rules || typeof rules !== "object") return ["Season's End rules must be an object"];
  const candidate = rules as Partial<SeasonEndReleaseRules>;
  const foilChance = candidate.foilChance;
  const signatureChanceCap = candidate.signatureChanceCap;
  const familyWeights = candidate.slot5FamilyWeights && typeof candidate.slot5FamilyWeights === "object" ? Object.values(candidate.slot5FamilyWeights) : [];
  const awardWeights = candidate.slot34FamilyWeights && typeof candidate.slot34FamilyWeights === "object" ? Object.values(candidate.slot34FamilyWeights) : [];
  const foilWeights = candidate.foilTypeWeights && typeof candidate.foilTypeWeights === "object" ? Object.values(candidate.foilTypeWeights) : [];
  const slot5Keys = candidate.slot5FamilyWeights && typeof candidate.slot5FamilyWeights === "object" ? Object.keys(candidate.slot5FamilyWeights).sort().join(",") : "";
  const slot34Keys = candidate.slot34FamilyWeights && typeof candidate.slot34FamilyWeights === "object" ? Object.keys(candidate.slot34FamilyWeights).sort().join(",") : "";
  const foilKeys = candidate.foilTypeWeights && typeof candidate.foilTypeWeights === "object" ? Object.keys(candidate.foilTypeWeights).sort().join(",") : "";
  if (candidate.guaranteedSlot !== 5) errors.push("the guaranteed Season's End slot must be 5");
  if (typeof foilChance !== "number" || !Number.isFinite(foilChance) || foilChance < 0 || foilChance > 1) errors.push("foil chance must be between 0 and 1");
  if (typeof signatureChanceCap !== "number" || !Number.isFinite(signatureChanceCap) || signatureChanceCap < 0 || signatureChanceCap > 0.05) errors.push("signature cap must be between 0 and 5%");
  if (familyWeights.some((weight) => !Number.isFinite(weight) || weight < 0) || familyWeights.every((weight) => weight === 0)) errors.push("slot 5 family weights must be finite and non-zero");
  if (awardWeights.some((weight) => !Number.isFinite(weight) || weight < 0) || awardWeights.every((weight) => weight === 0)) errors.push("award-family weights must be finite and non-zero");
  if (foilWeights.some((weight) => !Number.isFinite(weight) || weight < 0) || foilWeights.every((weight) => weight === 0)) errors.push("foil weights must be finite and non-zero");
  if (slot5Keys !== "accolade,best_of,season") errors.push("slot 5 family weights must contain exactly season, accolade, and best_of");
  if (slot34Keys !== "accolade,best_of") errors.push("award-family weights must contain exactly accolade and best_of");
  if (foilKeys !== "aurora,ice,prisma,refractor") errors.push("foil weights must contain exactly the four supported finishes");
  return errors;
}

export function validateSeasonEndEconomy(economy: SeasonEndEconomyRules): string[] {
  const errors: string[] = [];
  if (!economy || typeof economy !== "object") return ["Season's End economy must be an object"];
  const candidate = economy as Partial<SeasonEndEconomyRules>;
  const patronMultiplier = candidate.patronMultiplier;
  const signatureBonus = candidate.signatureBonus;
  if (candidate.version !== SEASON_END_ECONOMY_VERSION) errors.push("unsupported Season's End economy version");
  if (typeof patronMultiplier !== "number" || !Number.isFinite(patronMultiplier) || patronMultiplier < 1) errors.push("patron multiplier must be finite and at least 1");
  if (typeof signatureBonus !== "number" || !Number.isFinite(signatureBonus) || signatureBonus < 0) errors.push("signature bonus must be finite and non-negative");
  const foilMultipliers = candidate.foilDustMultipliers && typeof candidate.foilDustMultipliers === "object" ? Object.values(candidate.foilDustMultipliers) : [];
  const salvage = candidate.baseSalvageByKind && typeof candidate.baseSalvageByKind === "object" ? Object.values(candidate.baseSalvageByKind) : [];
  const foilKeys = candidate.foilDustMultipliers && typeof candidate.foilDustMultipliers === "object" ? Object.keys(candidate.foilDustMultipliers).sort().join(",") : "";
  const salvageKeys = candidate.baseSalvageByKind && typeof candidate.baseSalvageByKind === "object" ? Object.keys(candidate.baseSalvageByKind).sort().join(",") : "";
  if (foilMultipliers.length !== 4 || foilMultipliers.some((value) => !Number.isFinite(value) || value < 1)) errors.push("foil dust multipliers are invalid");
  if (salvage.length !== 3 || salvage.some((value) => !Number.isInteger(value) || value <= 0)) errors.push("base salvage values are invalid");
  if (foilKeys !== "aurora,ice,prisma,refractor") errors.push("foil dust multipliers must contain exactly the four supported finishes");
  if (salvageKeys !== "accolade,best_of,season") errors.push("base salvage values must contain exactly the three collectible families");
  return errors;
}

export const SEASON_END_SLOT_CONTRACT = [
  { slot: 1, label: "Season Card", family: "season" as const },
  { slot: 2, label: "Season Card", family: "season" as const },
  { slot: 3, label: "Accolade or Best Of", family: "award" as const },
  { slot: 4, label: "Accolade or Best Of", family: "award" as const },
  { slot: 5, label: "Guaranteed foil", family: "any" as const },
] as const;
