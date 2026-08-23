// The art roll: which skin of the signature champion a pulled copy is
// printed in.
//
// Kept out of rng.ts and signatures.ts for the same reason those are kept
// apart — this stage needs a network read (Riot's skin catalog), so it can't
// live inside the pure roll. The roll itself is pure and takes the same
// injected rand, so a print is as unguessable as the pull.

import { DDRAGON_VERSION, championByName } from "@/lib/match-draft/champions";

/** Champion id -> that champion's skin nums. Module-level and unbounded on
 *  purpose: the catalog only moves on a patch, and a pack of five pulls of
 *  the same player must not hit the CDN five times. Failures are NOT cached
 *  — a hiccup shouldn't print base splashes for the rest of the process. */
const skinNumsById = new Map<string, number[]>();

/**
 * The skin numbers Riot publishes for a champion, base (0) included.
 *
 * Any failure — an unknown champion, a dead CDN, a payload that doesn't
 * match — yields `[0]`, the base splash every champion has. A pack open
 * charges the wallet before it rolls, so this must never be the thing that
 * throws.
 */
export async function fetchChampionSkinNums(championName: string): Promise<number[]> {
  const champion = championByName(championName);
  if (!champion) return [0];

  const cached = skinNumsById.get(champion.id);
  if (cached) return cached;

  try {
    const response = await fetch(
      `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/data/en_US/champion/${champion.id}.json`,
    );
    if (!response.ok) return [0];
    const body = (await response.json()) as {
      data?: Record<string, { skins?: { num?: number }[] } | undefined>;
    };
    const nums = (body.data?.[champion.id]?.skins ?? [])
      .map((skin) => skin?.num)
      .filter((num): num is number => typeof num === "number");
    if (nums.length === 0) return [0];

    skinNumsById.set(champion.id, nums);
    return nums;
  } catch {
    return [0];
  }
}

/** Uniform pick over a champion's skin nums — one rand per print. An empty
 *  list can't come out of fetchChampionSkinNums (it floors at `[0]`), but
 *  it answers base splash rather than NaN if one ever reaches here. */
export function rollSkinNum(skinNums: number[], rand: () => number): number {
  if (skinNums.length === 0) return 0;
  const index = Math.min(skinNums.length - 1, Math.floor(rand() * skinNums.length));
  return skinNums[index];
}
