import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { WeeklyRawStatRow } from "../src/lib/stats/weekly";

const { fetchAllCardSeasons } = vi.hoisted(() => ({ fetchAllCardSeasons: vi.fn() }));

// Only the season lookup is faked. The aggregation and the percentiles are
// the real ones — the script is only worth running if it ranks exactly as
// the cards did.
vi.mock("../src/lib/cards/queries", () => ({ fetchAllCardSeasons }));

import { buildSeasonCards } from "../src/lib/cards/build";
import { aggregateWeeklyPlayerRows } from "../src/lib/stats/weekly";
import { inspectCohort } from "./inspect-card-cohort";

/** Monday 2026-09-14, Eastern. */
const WEEK = "2026-09-14";

const raw = (over: Partial<WeeklyRawStatRow>): WeeklyRawStatRow => ({
  // 8:30 PM ET on the Monday — inside the week on the Eastern calendar.
  game_date: "2026-09-15T00:30:00Z",
  assists: 6,
  cs: 220,
  cs_at_10: 70,
  cs_per_min: 7.3,
  damage_per_min: 600,
  damage_share_pct: 25,
  damage_taken_per_min: 700,
  deaths: 3,
  double_kills: 0,
  first_blood_assist: false,
  first_blood_kill: false,
  game_duration_min: 30,
  gold_at_10: 3200,
  gold_earned: 11000,
  gold_per_min: 366,
  kda_challenges: 3,
  kill_participation_pct: 55,
  kills: 4,
  penta_kills: 0,
  quadra_kills: 0,
  role: "MIDDLE",
  season: "S5",
  season_phase: "Regular",
  solo_kills: 0,
  summoner_name: "Player",
  tag: "NA1",
  total_damage_to_champions: 18000,
  triple_kills: 0,
  turret_plates_destroyed: 1,
  vision_score: 25,
  vision_score_per_min: 0.8,
  win: true,
  xp_at_10: 4500,
  ...over,
});

const WEEK_ROWS = [
  raw({ summoner_name: "Farmer", cs_at_10: 90, gold_at_10: 3600, solo_kills: 2, first_blood_kill: true, assists: 9 }),
  raw({ summoner_name: "Starver", cs_at_10: 50, gold_at_10: 2800, win: false, deaths: 6, kill_participation_pct: 40 }),
  raw({ summoner_name: "Island", role: "TOP", cs_at_10: 75, kills: 7, damage_share_pct: 31, total_damage_to_champions: 24000 }),
  // Sunday evening ET: inside the padded UTC window, but the week before.
  raw({ summoner_name: "LastWeek", game_date: "2026-09-14T02:00:00Z" }),
];

function createSupabase(rows: WeeklyRawStatRow[]): SupabaseClient {
  const from = vi.fn(() => {
    const builder: Record<string, unknown> = {};
    for (const method of ["select", "eq", "gte", "lt", "order", "range"]) {
      builder[method] = vi.fn(() => builder);
    }
    builder.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve({ data: rows, error: null }).then(resolve, reject);
    return builder;
  });
  return { from } as unknown as SupabaseClient;
}

function printed(): string {
  return vi.mocked(console.log).mock.calls.map((call) => call.join(" ")).join("\n");
}

/** One player's block — the script logs each as a single call. */
function blockOf(name: string): string {
  const calls = vi.mocked(console.log).mock.calls.map((call) => String(call[0]));
  return calls.find((block) => block.startsWith(`  ${name}#`)) ?? "";
}

beforeEach(() => {
  fetchAllCardSeasons.mockReset();
  fetchAllCardSeasons.mockResolvedValue([{ league: "premier", season: "S5" }]);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("inspect-card-cohort", () => {
  it("prints each mid with the numbers behind Laning and the rank each got", async () => {
    await inspectCohort(createSupabase(WEEK_ROWS), WEEK, "");
    const output = printed();

    // Two mids is under the role threshold, so the header has to say they
    // were ranked against the whole week — which is what the percentiles did.
    expect(output).toContain("MIDDLE (2 in cohort; fewer than 4, ranked against the whole week)");
    for (const name of ["Farmer", "Starver"]) {
      expect(blockOf(name)).toMatch(/Laning p\d+: cs@10 \d+ \(p\d+\)/);
    }
    // Farmer tops all three players' CS at 10; Starver trails them.
    expect(blockOf("Farmer")).toContain("cs@10 90 (p100)");
    expect(blockOf("Starver")).toContain("cs@10 50 (p0)");
    // The lone top laner sits in the middle of the whole week, which is the
    // fallback the header promises — alone in the role, they would be p0.
    expect(output).toContain("TOP (1 in cohort; fewer than 4, ranked against the whole week)");
    expect(blockOf("Island")).toContain("cs@10 75 (p50)");
    expect(output).toContain("Weights: win 30 · Combat 18 · Damage 18 · Laning 14");
    // The Sunday game belongs to the previous week and must not be ranked.
    expect(output).not.toContain("LastWeek");
  });

  it("prints the bar the card actually wears", async () => {
    // Which percentiles make up a bar is restated in the script, not
    // imported, so this is what notices when measureValues changes and
    // the script does not. Off by at most one: the script prints the
    // percentile rounded, and the card rounds it again onto 20-99.
    await inspectCohort(createSupabase(WEEK_ROWS), WEEK, "");
    const cohort = aggregateWeeklyPlayerRows(WEEK_ROWS.slice(0, 3));
    const cards = buildSeasonCards({ cohort, gamesByPlayer: new Map(), gameLog: new Map() });

    let compared = 0;
    for (const card of cards) {
      for (const [, label, printedPct] of blockOf(card.name).matchAll(/(\w+) p(\d+):/g)) {
        const bar = card.subStats.find((stat) => stat.label === label);
        expect(bar, `${card.name} ${label}`).toBeDefined();
        expect(Math.abs(Math.round(20 + Number(printedPct) * 0.79) - bar!.value)).toBeLessThanOrEqual(1);
        compared += 1;
      }
    }
    expect(compared).toBeGreaterThan(10);
  });

  it("prints only the requested role, by the card's label too", async () => {
    await inspectCohort(createSupabase(WEEK_ROWS), WEEK, "Mid");
    const output = printed();

    expect(output).toContain("MIDDLE (2 in cohort;");
    expect(output).not.toContain("TOP (");
    expect(output).not.toContain("Island");
  });

  it("says so when the week has no games", async () => {
    await inspectCohort(createSupabase([]), WEEK, "");

    expect(printed()).toBe(`[premier] Season S5: no games in the week of ${WEEK}.`);
  });

  it("refuses a week that is not a Monday", async () => {
    await expect(inspectCohort(createSupabase(WEEK_ROWS), "2026-09-15", "")).rejects.toThrow("must be a Monday");
  });
});
