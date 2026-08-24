// The art roll: which skin of the signature champion a pulled copy is
// printed in.
//
// Kept out of rng.ts and signatures.ts for the same reason those are kept
// apart — this stage needs a network read (Riot's skin catalog), so it can't
// live inside the pure roll. The roll itself is pure and takes the same
// injected rand, so a print is as unguessable as the pull.

import {
  DDRAGON_VERSION,
  championByName,
  championCenteredUrl,
  championSplashUrl,
} from "@/lib/match-draft/champions";
import { ALT_SKIN_CHANCE } from "./config";

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

/** url -> whether the CDN actually serves that piece of art. Successes and
 *  403s are both facts about the catalog and cache forever; transient
 *  network failures are not cached, mirroring fetchChampionSkinNums. */
const printValidity = new Map<string, boolean>();

async function artUrlServed(url: string): Promise<boolean> {
  const cached = printValidity.get(url);
  if (cached !== undefined) return cached;
  try {
    const response = await fetch(url, { method: "HEAD" });
    printValidity.set(url, response.ok);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * The art a print of `num` actually renders at, or null when Riot serves
 * neither variant for that skin.
 *
 * Riot publishes two splash directories and they do NOT hold the same set:
 * `centered` (the crop the cards want) is missing for a great many valid
 * skins, while `splash` covers nearly all of them. So the resolution is
 * centered-first, regular splash second — a skin whose only art is the
 * uncropped splash is still a usable print, it just sits differently in the
 * frame. Both verdicts cache per-URL above, so a pack of five pulls of the
 * same champion probes each url once.
 */
export async function resolvePrintArtUrl(championName: string, num: number): Promise<string | null> {
  const centered = championCenteredUrl(championName, num);
  if (centered && (await artUrlServed(centered))) return centered;
  const splash = championSplashUrl(championName, num);
  if (splash && (await artUrlServed(splash))) return splash;
  return null;
}

/** Whether a print of `num` has art at all, in either directory — the
 *  default validator behind rollPrint. */
export async function printArtExists(championName: string, num: number): Promise<boolean> {
  return (await resolvePrintArtUrl(championName, num)) !== null;
}

/**
 * The print roll the pack actually uses. Two stages, both off the injected
 * rand: first a chance gate — ALT_SKIN_CHANCE of printing an alternate at
 * all, base splash otherwise, so base is the expected look and an alternate
 * reads as a pull in its own right — then a uniform pick among the
 * champion's alternates, VALIDATED against the CDN before it's frozen.
 *
 * The skin catalog lists nums Riot never uploaded art for (they 403) —
 * without the validation those prints render broken and the card's
 * client-side fallback silently swaps them to base art. "Art" here means
 * either splash directory (see resolvePrintArtUrl): a skin that only has
 * the regular splash is rollable, which is most of the ones the old
 * centered-only check threw away. An invalid roll is removed from the
 * candidates and re-rolled, a few attempts at most; base (0) always exists
 * and is the floor.
 */
export async function rollPrint(
  championName: string,
  skinNums: number[],
  rand: () => number,
  artExists: (championName: string, num: number) => Promise<boolean> = printArtExists,
): Promise<number> {
  const alternates = [...new Set(skinNums)].filter((num) => num !== 0);
  if (alternates.length === 0) return 0;
  if (rand() >= ALT_SKIN_CHANCE) return 0;

  for (let attempt = 0; attempt < 6 && alternates.length > 0; attempt++) {
    const index = Math.min(alternates.length - 1, Math.floor(rand() * alternates.length));
    const num = alternates[index];
    if (await artExists(championName, num)) return num;
    alternates.splice(index, 1);
  }
  return 0;
}
