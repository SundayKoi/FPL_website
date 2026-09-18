import { FOIL_TYPE_DUST_MULT, SIGNED_DUST_BASE, type MintableFoilType } from "@/lib/packs/config";
import { rollSeasonEndPack, type SeasonEndPull, type SeasonEndRollRules } from "@/lib/packs/season-end";
import type { SeasonEndCatalog, SeasonEndKind } from "./collectibles";

export interface SeasonEndSimulationOptions {
  openings: number;
  seed?: number;
  rules: SeasonEndRollRules;
  signaturesByPlayerKey?: ReadonlyMap<string, string>;
  patron?: boolean;
}

export interface SupplyReport {
  openings: number;
  family: Record<SeasonEndKind, number>;
  perDesign: Record<string, number>;
}

export interface CompletionReport {
  packs: number;
  meanCompleted: number;
  p10Completed: number;
  medianCompleted: number;
  p90Completed: number;
  meanDuplicateCards: number;
}

export interface SeasonEndSimulationReport {
  supply: SupplyReport[];
  completion: CompletionReport[];
  signatureProbability: number;
  signedCopiesPerPack: number;
  signaturesByFamily: Record<SeasonEndKind, number>;
  finishProbability: Record<MintableFoilType, number>;
  guaranteedFoilProbability: number;
  expectedDust: number;
  expectedRefundRate: number;
  patron: boolean;
}

function percentile(values: readonly number[], fraction: number): number {
  const ordered = values.slice().sort((left, right) => left - right);
  return ordered[Math.min(ordered.length - 1, Math.floor((ordered.length - 1) * fraction))] ?? 0;
}

function dustValue(pull: SeasonEndPull, patron: boolean): number {
  const base = pull.design.baseSalvage;
  const multiplier = pull.foilType ? FOIL_TYPE_DUST_MULT[pull.foilType] : 1;
  const signedBonus = pull.signed ? SIGNED_DUST_BASE : 0;
  const value = Math.round(base * multiplier + signedBonus);
  return patron ? Math.round(value * 1.2) : value;
}

function freshCounts(catalog: SeasonEndCatalog): Record<string, number> {
  return Object.fromEntries(catalog.designs.map((design) => [design.designId, 0]));
}

export function simulateSeasonEnd(catalog: SeasonEndCatalog, options: SeasonEndSimulationOptions): SeasonEndSimulationReport {
  if (!Number.isInteger(options.openings) || options.openings < 1) throw new Error("openings must be a positive integer");
  let state = (options.seed ?? 0x51ea50) >>> 0;
  const rand = () => {
    state = Math.imul(1103515245, state) + 12345;
    return (state >>> 0) / 2 ** 32;
  };
  const signatures = options.signaturesByPlayerKey ?? new Map<string, string>();
  const family: Record<SeasonEndKind, number> = { season: 0, accolade: 0, best_of: 0 };
  const perDesign = freshCounts(catalog);
  const finishCounts: Record<MintableFoilType, number> = { prisma: 0, aurora: 0, refractor: 0, ice: 0 };
  const completionPacks = [5, 12, 24, 50];
  const completionSamples = new Map<number, number[][]>();
  for (const packs of completionPacks) completionSamples.set(packs, []);
  let signaturePacks = 0;
  let signedCopies = 0;
  let guaranteedFoils = 0;
  let dust = 0;
  const signaturesByFamily: Record<SeasonEndKind, number> = { season: 0, accolade: 0, best_of: 0 };
  const packDesigns: string[] = [];

  for (let opening = 0; opening < options.openings; opening += 1) {
    const pulls = rollSeasonEndPack(catalog, rand, signatures, options.rules);
    const seen = new Set<string>();
    for (const pull of pulls) {
      family[pull.design.kind] += 1;
      perDesign[pull.design.designId] += 1;
      seen.add(pull.design.designId);
      packDesigns.push(pull.design.designId);
      if (pull.signed) {
        signedCopies += 1;
        signaturesByFamily[pull.design.kind] += 1;
      }
      if (pull.signed) signaturePacks += 1;
      if (pull.guaranteedFoil) guaranteedFoils += 1;
      if (pull.foilType) finishCounts[pull.foilType] += 1;
      dust += dustValue(pull, options.patron ?? false);
    }
    if (opening < completionPacks[completionPacks.length - 1]) {
      for (const packs of completionPacks) {
        if (opening + 1 !== packs) continue;
        const counts = new Map<string, number>();
        for (const designId of packDesigns) counts.set(designId, (counts.get(designId) ?? 0) + 1);
        const completed = [...counts.values()].filter((count) => count > 0).length;
        const duplicateCards = packs * 5 - completed;
        completionSamples.get(packs)!.push([completed, duplicateCards]);
      }
    }
    // Completion outcomes are also sampled in 5-pack windows after the first
    // run, so the report remains useful when a simulation is run for 1,000 packs.
    if ((opening + 1) % 5 === 0) {
      const counts = new Map<string, number>();
      for (const designId of packDesigns.slice(-25)) counts.set(designId, (counts.get(designId) ?? 0) + 1);
      const completed = [...counts.values()].filter((count) => count > 0).length;
      const bucket = completionSamples.get(5) ?? [];
      bucket.push([completed, 25 - completed]);
      completionSamples.set(5, bucket);
    }
  }

  const completion: CompletionReport[] = completionPacks.map((packs) => {
    const rows = completionSamples.get(packs) ?? [];
    const completed = rows.map(([value]) => value);
    const duplicates = rows.map(([, value]) => value);
    return {
      packs,
      meanCompleted: completed.length ? completed.reduce((sum, value) => sum + value, 0) / completed.length : 0,
      p10Completed: percentile(completed, 0.1),
      medianCompleted: percentile(completed, 0.5),
      p90Completed: percentile(completed, 0.9),
      meanDuplicateCards: duplicates.length ? duplicates.reduce((sum, value) => sum + value, 0) / duplicates.length : 0,
    };
  });
  const supplyOpenings = [100, 500, 1000].map((openings) => ({
    openings,
    family: Object.fromEntries(Object.entries(family).map(([kind, count]) => [kind, count * openings / options.openings])) as Record<SeasonEndKind, number>,
    perDesign: Object.fromEntries(Object.entries(perDesign).map(([designId, count]) => [designId, count * openings / options.openings])),
  }));
  return {
    supply: supplyOpenings,
    completion,
    signatureProbability: signaturePacks / options.openings,
    signedCopiesPerPack: signedCopies / options.openings,
    signaturesByFamily,
    finishProbability: Object.fromEntries(Object.entries(finishCounts).map(([type, count]) => [type, count / (options.openings * 5)])) as Record<MintableFoilType, number>,
    guaranteedFoilProbability: guaranteedFoils / (options.openings * 5),
    expectedDust: dust / options.openings,
    expectedRefundRate: dust / options.openings / 500,
    patron: options.patron ?? false,
  };
}
