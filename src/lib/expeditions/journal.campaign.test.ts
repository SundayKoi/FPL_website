import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { RoadCompany } from "./company";
import { TIER_ORDER, type CardCopy, type ExpeditionTierKey } from "./config";
import { journalFor, type JournalEntry } from "./journal";
import { forksFor } from "./routes";
import type { WeatherKey } from "./weather";

// The journal names the places a campaign handed down (run.road), the way
// the resolver, the fork prompt and the map already did — and for every
// run NOT on a campaign it writes exactly what it wrote before that
// change, byte for byte. A journal is half-quoted in Discord by the time a
// squad is home, so a line that moved under a run in the field is a story
// rewritten mid-telling.

const copy = (id: number, role: string, over: Record<string, unknown> = {}) =>
  ({
    id,
    playerName: `Card ${id}`,
    role,
    signed: false,
    foil: false,
    card: { archetype: "Jack of All Trades", teamName: null },
    ...over,
  }) as unknown as CardCopy;

const SQUADS: CardCopy[][] = [
  [copy(1, "Top"), copy(2, "Support"), copy(3, "Jungle")],
  [
    copy(4, "Mid", { signed: true, card: { archetype: "Unkillable", teamName: "Solari Sun" } }),
    copy(5, "Bot", { foil: true, card: { archetype: "Gold Hoarder", teamName: "Solari Sun" } }),
    copy(6, "Jungle", { card: { archetype: "Camp Thief", teamName: "Lunar Tide" } }),
  ],
];

const COMPANY: RoadCompany = {
  rivals: [{ leg: 1, runId: 900, who: "ana", name: "Ana", shine: 20, theirShine: 14, won: true }],
  crossings: [{ at: "2026-09-04T11:00:00.000Z", runId: 901, who: "bo", name: "Bo", won: false }],
  ghosts: [{ leg: 2, graveId: 7, cardName: "Hal", who: "cy", name: "Cy", team: "Solari Sun", stood: false }],
};

const FORKS: Record<ExpeditionTierKey, number> = { scout: 1, gilded: 2, raid: 2, legend: 3, rescue: 1, exorcism: 0, legendary: 4, mythic: 4 };

/** Every journal line of a matrix of runs that walk no campaign's road:
 *  each route, rulebooks 1 to 6, several seeds, convoys, answers (a scout
 *  names the place ahead), weather, company, two squads. Claimed, so the
 *  whole journal is written. */
function nonCampaignJournals(road: (id: number) => string[] | null | undefined): string {
  const out: { id: number; entries: (Omit<JournalEntry, "at"> & { at: string })[] }[] = [];
  const weathers: (WeatherKey | null)[] = [null, "fog", "watch"];
  for (const tier of TIER_ORDER) {
    for (const rules of [1, 2, 3, 4, 5, 6]) {
      for (const id of [1, 41, 301, 4242]) {
        for (const [variant, weather] of weathers.entries()) {
          const forks = FORKS[tier];
          const run = {
            id: id + variant,
            tier,
            startedAt: "2026-09-04T00:00:00.000Z",
            resolvesAt: "2026-09-06T00:00:00.000Z",
            forks,
            claimedAt: "2026-09-06T01:00:00.000Z",
            rules,
            convoy: variant === 1 ? 77 : null,
            choices: forks > 1 ? [{ index: 0, choice: variant === 2 ? "push" : "scout" }] : [],
            company: variant === 2 ? COMPANY : null,
            weather,
            road: road(id),
          };
          const squad = SQUADS[(id + variant) % SQUADS.length];
          const entries = journalFor(run, squad, new Date("2026-09-04T00:00:00.000Z"));
          out.push({ id: run.id, entries: entries.map((entry) => ({ ...entry, at: entry.at.toISOString() })) });
        }
      }
    }
  }
  return JSON.stringify(out);
}

const fingerprint = (text: string) => createHash("sha256").update(text).digest("hex");

/**
 * The matrix above, fingerprinted on the code as it stood BEFORE the
 * journal learned campaign roads (the journal.ts of 5bc7705). Do not
 * update it to make a failure pass: a different fingerprint means a line
 * changed for a run that is not on a campaign, which rewrites a story
 * already in progress. A deliberate change behind a new rulebook adds
 * runs to a matrix of its own instead.
 */
const BEFORE = "8c7cf226ee1dd44d6e4bf38013694bddd5a6661ad2a2496c9e3b7c2d81fc7657";

describe("the journal and a campaign's road", () => {
  it("writes every non-campaign journal byte for byte as before", () => {
    const text = nonCampaignJournals(() => undefined);
    expect(text.length).toBeGreaterThan(100_000);
    expect(fingerprint(text)).toBe(BEFORE);
  });

  it("reads no road, a null road and an empty road the same way", () => {
    const none = nonCampaignJournals(() => undefined);
    expect(nonCampaignJournals(() => null)).toBe(none);
    expect(nonCampaignJournals(() => [])).toBe(none);
  });

  it("names the campaign's places on a campaign run, where the map and the fork prompt name them", () => {
    // A Deep Raid the Broken Map sent to the flooded works and the dog
    // pits, whichever places its own seed would have drawn.
    const places = ["waterworks", "pits"];
    const base = { id: 5, tier: "raid" as const, startedAt: "2026-09-04T00:00:00.000Z", resolvesAt: "2026-09-05T00:00:00.000Z", forks: 2, rules: 5, convoy: null, claimedAt: "2026-09-05T01:00:00.000Z", choices: [{ index: 0, choice: "scout" }] };
    const campaign = forksFor("raid", { runId: 5, rules: 5, forks: 2, places });
    const drawn = forksFor("raid", { runId: 5, rules: 5, forks: 2 });
    expect(campaign.map((fork) => fork.key)).toEqual(places);
    // The seed alone would draw somewhere else at one checkpoint at least,
    // or this case proves nothing.
    expect(drawn.map((fork) => fork.key)).not.toEqual(places);

    const squad = SQUADS[0];
    const walked = journalFor({ ...base, road: places }, squad, new Date(0));
    const text = walked.map((entry) => entry.text).join("\n");
    for (const fork of campaign) expect(text).toContain(fork.title.toLowerCase());
    for (const fork of drawn.filter((fork) => !places.includes(fork.key))) expect(text).not.toContain(fork.title.toLowerCase());

    // Only the place names move: the same lines, at the same hours, from
    // the same draws.
    const seeded = journalFor(base, squad, new Date(0));
    expect(walked.map((entry) => [entry.at.getTime(), entry.leg, entry.kind])).toEqual(seeded.map((entry) => [entry.at.getTime(), entry.leg, entry.kind]));
    const unnamed = (entries: JournalEntry[], forks: { title: string }[]) =>
      entries.map((entry) => forks.reduce((line, fork) => line.replaceAll(fork.title.toLowerCase(), "{place}"), entry.text));
    expect(unnamed(walked, campaign)).toEqual(unnamed(seeded, drawn));
  });
});
