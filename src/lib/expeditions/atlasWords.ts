// The atlas's sentences (spec §5), apart from the atlas itself so the
// browser can print them. atlas.ts reads the road to title the places a
// collector has seen, and none of that may reach a client bundle
// (expeditionImports.test.ts); these only turn titles the server already
// handed over, a route key and a reward into words. atlas.ts re-exports
// every one of them, so the claim and the Discord news read the same.
//
// Pure: no road, no clock, no database.

import { EXPEDITION_TIERS, type ExpeditionTierKey, type RoadReward } from "./config";

/** "the Legend Hunt", "the Gilded Road": a route's name mid-sentence. */
export function routeName(tier: ExpeditionTierKey): string {
  const label = EXPEDITION_TIERS[tier]?.label ?? tier;
  return label.startsWith("The ") ? `the ${label.slice(4)}` : `the ${label}`;
}

/** "a place's title, mid-sentence": "The drowned chapel" → "the drowned chapel". */
function midSentence(title: string): string {
  return title.startsWith("The ") ? `the ${title.slice(4)}` : title;
}

/** "the drowned chapel", "the shaft, the chapel and the vault door". */
function placeList(titles: string[]): string {
  const places = titles.map(midSentence);
  return places.length <= 1 ? (places[0] ?? "a new place") : `${places.slice(0, -1).join(", ")} and ${places[places.length - 1]}`;
}

/**
 * The news when a claim names a landmark: "Ann was first to the drowned
 * chapel on the Legend Hunt." Several at once read as one sentence.
 */
export function firstNamedLine(name: string, titles: string[], tier?: ExpeditionTierKey): string {
  return `${name} was first to ${placeList(titles)}${tier ? ` on ${routeName(tier)}` : ""}.`;
}

/**
 * The same news told to the collector who made it, at the claim: "You're
 * the first in the league to reach the flooded works — it's named after
 * you this season." What a landmark is, said in the sentence that gives
 * one, so the word itself never needs explaining.
 */
export function firstReachedLine(titles: string[]): string {
  const named = titles.length > 1 ? "they're named after you this season" : "it's named after you this season";
  return `You're the first in the league to reach ${placeList(titles)} — ${named}.`;
}

/** What a road pays when it is walked, in words: "2 map fragments and a
 *  free pack". Nothing for a rite. */
export function rewardWords(reward: RoadReward): string {
  const parts: string[] = [];
  if (reward.fragments > 0) parts.push(`${reward.fragments} map fragment${reward.fragments === 1 ? "" : "s"}`);
  if (reward.comp) parts.push("a free pack");
  return parts.length === 0 ? "nothing" : parts.join(" and ");
}

/** The claim that finished a road: "You've walked every place on the Deep
 *  Raid: +1 map fragment." */
export function roadWalkedLine(tier: ExpeditionTierKey, reward: RoadReward): string {
  const pays = rewardWords(reward);
  return `You've walked every place on ${routeName(tier)} this season${pays === "nothing" ? "." : `: +${pays}.`}`;
}
