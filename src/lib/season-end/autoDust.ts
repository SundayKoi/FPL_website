import type { SeasonEndOwnedCopy } from "./release-queries";

/** Exact variants only: a different foil finish or signature is collectible. */
export function seasonEndDuplicateIds(copies: SeasonEndOwnedCopy[]): number[] {
  const seen = new Set<string>();
  const duplicates: number[] = [];
  for (const copy of [...copies].sort((a, b) => a.inventoryId - b.inventoryId)) {
    const key = JSON.stringify([copy.releaseId, copy.designId, copy.foilType, copy.signed]);
    if (seen.has(key)) duplicates.push(copy.inventoryId);
    else seen.add(key);
  }
  return duplicates;
}
