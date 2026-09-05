import { describe, expect, it } from "vitest";
import type { CardCopy } from "./config";
import { MERCHANT_DOLLARS } from "./config";
import { banterFor, encountersFor, journalFor, latestJournalLine, STORM_HOURS } from "./journal";

const copy = (id: number, over: Partial<Record<keyof CardCopy, unknown>> = {}) =>
  ({ id, playerName: `Card ${id}`, role: "Mid", signed: false, foil: false, card: {}, ...over }) as unknown as CardCopy;
const squad = [copy(1, { role: "Top" }), copy(2, { role: "Support" }), copy(3, { role: "Jungle" })];

// A 24h raid with two forks: legs at 0-8h, 8-16h, 16-24h.
const raid = { id: 42, tier: "raid" as const, startedAt: "2026-09-04T00:00:00Z", resolvesAt: "2026-09-05T00:00:00Z", forks: 2 };

describe("the trail journal", () => {
  it("is the same journal every time it is read", () => {
    const now = new Date("2026-09-04T20:00:00Z");
    expect(journalFor(raid, squad, now)).toEqual(journalFor(raid, squad, now));
    expect(encountersFor(raid)).toEqual(encountersFor(raid));
  });

  it("writes lines as the squad reaches them, and nothing from the future", () => {
    const early = journalFor(raid, squad, new Date("2026-09-04T01:00:00Z"));
    expect(early).toEqual([]);
    const afterFirst = journalFor(raid, squad, new Date("2026-09-04T03:00:00Z"));
    expect(afterFirst).toHaveLength(1);
    expect(afterFirst[0]).toMatchObject({ leg: 0, kind: "trail" });
    const arrived = journalFor(raid, squad, new Date("2026-09-04T08:00:00Z"));
    expect(arrived[arrived.length - 1]).toMatchObject({ kind: "arrive", text: expect.stringMatching(/reached the reactor/) });
    for (const entry of arrived) expect(entry.at.getTime()).toBeLessThanOrEqual(Date.parse("2026-09-04T08:00:00Z"));
  });

  it("names a squad member, never a placeholder", () => {
    const entries = journalFor(raid, squad, new Date("2026-09-06T00:00:00Z"));
    expect(entries.length).toBeGreaterThan(6);
    for (const entry of entries) {
      expect(entry.text).not.toMatch(/\{name\}|\{role\}/);
    }
    expect(entries.some((entry) => /Card [123]/.test(entry.text))).toBe(true);
    expect(entries[entries.length - 1]).toMatchObject({ kind: "home" });
  });

  it("shows every line once the run is claimed, whatever the clock says", () => {
    const claimed = journalFor({ ...raid, claimedAt: "2026-09-05T01:00:00Z" }, squad, new Date("2026-09-04T00:30:00Z"));
    expect(claimed[claimed.length - 1].kind).toBe("home");
  });

  it("quotes the newest line for the ping", () => {
    expect(latestJournalLine(raid, squad, new Date("2026-09-04T00:30:00Z"))).toBeNull();
    const line = latestJournalLine(raid, squad, new Date("2026-09-04T08:00:00Z"));
    expect(line).toMatch(/reached the reactor/);
  });

  it("carries encounters on some legs, never on an exorcism or a run without forks", () => {
    // Over many runs the chance lands: some carry one, not all.
    const runs = Array.from({ length: 60 }, (_, index) => ({ ...raid, id: index + 1 }));
    const counts = runs.map((run) => encountersFor(run).length);
    expect(counts.some((count) => count > 0)).toBe(true);
    expect(counts.some((count) => count === 0)).toBe(true);
    expect(encountersFor({ ...raid, tier: "exorcism", forks: 0 })).toEqual([]);
    expect(encountersFor({ ...raid, forks: 0 })).toEqual([]);
    // A stranded card only turns up on a route that can lose one.
    const raidKeys = new Set(runs.flatMap((run) => encountersFor(run).map((entry) => entry.key)));
    expect(raidKeys.has("stranded")).toBe(false);
    const legendKeys = new Set(
      Array.from({ length: 200 }, (_, index) => ({ ...raid, id: index + 1, tier: "legend" as const, forks: 3 })).flatMap((run) =>
        encountersFor(run).map((entry) => entry.key),
      ),
    );
    expect(legendKeys.has("stranded")).toBe(true);
  });

  it("puts an encounter in the journal at the middle of its leg, in words that quote the numbers", () => {
    const withOne = Array.from({ length: 80 }, (_, index) => ({ ...raid, id: index + 1 })).find((run) => encountersFor(run).length > 0)!;
    const encounter = encountersFor(withOne)[0];
    const entries = journalFor(withOne, squad, new Date("2026-09-06T00:00:00Z"));
    const entry = entries.find((line) => line.kind === "encounter")!;
    expect(entry.encounter).toBe(encounter.key);
    expect(entry.at).toEqual(encounter.at);
    if (encounter.key === "merchant") expect(entry.text).toContain(String(MERCHANT_DOLLARS));
    if (encounter.key === "storm") expect(entry.text).toContain(`${STORM_HOURS} hours`);
  });
});

describe("squad banter", () => {
  it("lets teammates speak first", () => {
    const mates = [copy(1, { card: { teamName: "OMH" } }), copy(2, { card: { teamName: "OMH" } }), copy(3)];
    const lines = Array.from({ length: 20 }, (_, index) => banterFor("legend", 1, mates, index));
    expect(lines.some((line) => /vouch for each other/.test(line ?? ""))).toBe(true);
  });

  it("speaks in a role's voice for a plain squad, and says nothing for nobody", () => {
    const line = banterFor("raid", 0, squad, 7);
    expect(line).toMatch(/Card [123]/);
    expect(banterFor("raid", 0, [], 7)).toBeNull();
  });

  it("mentions the light only at a dark fork", () => {
    const foil = [copy(1, { foil: true })];
    const dark = Array.from({ length: 30 }, (_, index) => banterFor("raid", 1, foil, index));
    const bright = Array.from({ length: 30 }, (_, index) => banterFor("raid", 0, foil, index));
    expect(dark.some((line) => /light the way/.test(line ?? ""))).toBe(true);
    expect(bright.some((line) => /light the way/.test(line ?? ""))).toBe(false);
  });
});
