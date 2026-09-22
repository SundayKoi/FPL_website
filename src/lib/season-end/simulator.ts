import type { MintableFoilType } from "@/lib/packs/config";
import { rollSeasonEndPack, type SeasonEndPull, type SeasonEndRollRules } from "@/lib/packs/season-end";
import type { SeasonEndCatalog, SeasonEndKind } from "./collectibles";
import { SEASON_END_ECONOMY, type SeasonEndEconomyRules } from "./release";

export interface SeasonEndSimulationOptions {
  openings: number;
  seed?: number;
  rules: SeasonEndRollRules;
  signaturesByPlayerKey?: ReadonlyMap<string, string>;
  patron?: boolean;
  packPrice?: number;
  economy?: SeasonEndEconomyRules;
  collectorTrajectories?: number;
}

export interface SupplyReport {
  openings: number;
  family: Record<SeasonEndKind, number>;
  perDesign: Record<string, number>;
}

export interface CompletionReport {
  packs: number;
  trajectories: number;
  meanCompleted: number;
  p10Completed: number;
  medianCompleted: number;
  p90Completed: number;
  meanDuplicateCards: number;
}

export interface SeasonEndSimulationReport {
  simulatorVersion: "season-end-simulator-v2";
  openings: number;
  packPrice: number;
  supply: SupplyReport[];
  completion: CompletionReport[];
  signatureProbability: number;
  signatureProbabilityStandardError: number;
  signedCopiesPerPack: number;
  signaturesByFamily: Record<SeasonEndKind, number>;
  finishProbability: Record<MintableFoilType, number>;
  /** Historical field retained as overall foil-slot prevalence. */
  guaranteedFoilProbability: number;
  guaranteedSlotFoilRate: number;
  expectedDust: number;
  expectedDustStandardError: number;
  conservativeSalvageUpperBound: number;
  expectedRefundRate: number;
  patron: boolean;
  seed: number;
  economyVersion: string;
}

function percentile(values: readonly number[], fraction: number): number {
  const ordered = values.slice().sort((left, right) => left - right);
  return ordered[Math.min(ordered.length - 1, Math.floor((ordered.length - 1) * fraction))] ?? 0;
}

function randomFor(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = Math.imul(1103515245, state) + 12345;
    return (state >>> 0) / 2 ** 32;
  };
}

function dustValue(pull: SeasonEndPull, patron: boolean, economy: SeasonEndEconomyRules): number {
  const base = pull.design.baseSalvage;
  const multiplier = pull.foilType ? economy.foilDustMultipliers[pull.foilType] ?? 1 : 1;
  const signedBonus = pull.signed ? economy.signatureBonus : 0;
  const value = base * multiplier + signedBonus;
  return Math.round(value * (patron ? economy.patronMultiplier : 1));
}

function freshCounts(catalog: SeasonEndCatalog): Record<string, number> {
  return Object.fromEntries(catalog.designs.map((design) => [design.designId, 0]));
}

export function simulateSeasonEnd(catalog: SeasonEndCatalog, options: SeasonEndSimulationOptions): SeasonEndSimulationReport {
  if (!Number.isInteger(options.openings) || options.openings < 1) throw new Error("openings must be a positive integer");
  const seed = (options.seed ?? 0x51ea50) >>> 0;
  const packPrice = options.packPrice ?? 500;
  if (!Number.isFinite(packPrice) || packPrice <= 0) throw new Error("packPrice must be positive");
  const economy = options.economy ?? SEASON_END_ECONOMY;
  const signatures = options.signaturesByPlayerKey ?? new Map<string, string>();
  const family: Record<SeasonEndKind, number> = { season: 0, accolade: 0, best_of: 0 };
  const perDesign = freshCounts(catalog);
  const finishCounts: Record<MintableFoilType, number> = { prisma: 0, aurora: 0, refractor: 0, ice: 0 };
  let signaturePacks = 0;
  let signedCopies = 0;
  let guaranteedFoils = 0;
  let dust = 0;
  let dustSquared = 0;
  const signaturesByFamily: Record<SeasonEndKind, number> = { season: 0, accolade: 0, best_of: 0 };

  for (let opening = 0; opening < options.openings; opening += 1) {
    const pulls = rollSeasonEndPack(catalog, randomFor(seed + opening * 0x9e3779b9), signatures, options.rules);
    let signedHere = 0;
    let openingDust = 0;
    for (const pull of pulls) {
      family[pull.design.kind] += 1;
      perDesign[pull.design.designId] += 1;
      if (pull.signed) {
        signedHere += 1;
        signedCopies += 1;
        signaturesByFamily[pull.design.kind] += 1;
      }
      if (pull.guaranteedFoil) guaranteedFoils += 1;
      if (pull.foilType) finishCounts[pull.foilType] += 1;
      const pullDust = dustValue(pull, options.patron ?? false, economy);
      dust += pullDust;
      openingDust += pullDust;
    }
    if (signedHere > 0) signaturePacks += 1;
    dustSquared += openingDust * openingDust;
  }

  const trajectories = options.collectorTrajectories ?? 10_000;
  if (!Number.isInteger(trajectories) || trajectories < 1) throw new Error("collectorTrajectories must be positive");
  const completionPacks = [5, 12, 24, 50];
  const completion: CompletionReport[] = completionPacks.map((packs, budgetIndex) => {
    const completed: number[] = [];
    const duplicates: number[] = [];
    for (let trajectory = 0; trajectory < trajectories; trajectory += 1) {
      const rand = randomFor(seed ^ Math.imul(trajectory + 1, 0x45d9f3b) ^ Math.imul(budgetIndex + 1, 0x27d4eb2d));
      const seen = new Set<string>();
      for (let pack = 0; pack < packs; pack += 1) {
        for (const pull of rollSeasonEndPack(catalog, rand, signatures, options.rules)) seen.add(pull.design.designId);
      }
      completed.push(seen.size);
      duplicates.push(packs * 5 - seen.size);
    }
    return {
      packs,
      trajectories,
      meanCompleted: completed.reduce((sum, value) => sum + value, 0) / trajectories,
      p10Completed: percentile(completed, 0.1),
      medianCompleted: percentile(completed, 0.5),
      p90Completed: percentile(completed, 0.9),
      meanDuplicateCards: duplicates.reduce((sum, value) => sum + value, 0) / trajectories,
    };
  });

  const signatureProbability = signaturePacks / options.openings;
  const supplyOpenings = [100, 500, 1000].map((estimatedOpenings) => ({
    openings: estimatedOpenings,
    family: Object.fromEntries(Object.entries(family).map(([kind, count]) => [kind, count * estimatedOpenings / options.openings])) as Record<SeasonEndKind, number>,
    perDesign: Object.fromEntries(Object.entries(perDesign).map(([designId, count]) => [designId, count * estimatedOpenings / options.openings])),
  }));
  return {
    simulatorVersion: "season-end-simulator-v2",
    openings: options.openings,
    packPrice,
    supply: supplyOpenings,
    completion,
    signatureProbability,
    signatureProbabilityStandardError: Math.sqrt((signatureProbability * (1 - signatureProbability)) / options.openings),
    signedCopiesPerPack: signedCopies / options.openings,
    signaturesByFamily,
    finishProbability: Object.fromEntries(Object.entries(finishCounts).map(([type, count]) => [type, count / (options.openings * 5)])) as Record<MintableFoilType, number>,
    guaranteedFoilProbability: guaranteedFoils / (options.openings * 5),
    guaranteedSlotFoilRate: guaranteedFoils / options.openings,
    expectedDust: dust / options.openings,
    expectedDustStandardError: Math.sqrt(Math.max(0, dustSquared / options.openings - (dust / options.openings) ** 2) / options.openings),
    conservativeSalvageUpperBound: dust / options.openings + 2 * Math.sqrt(Math.max(0, dustSquared / options.openings - (dust / options.openings) ** 2) / options.openings),
    expectedRefundRate: dust / options.openings / packPrice,
    patron: options.patron ?? false,
    seed,
    economyVersion: economy.version,
  };
}
