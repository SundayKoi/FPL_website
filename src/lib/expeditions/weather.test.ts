import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { HARVEST_MERCHANT, MERCHANT_DOLLARS, maxExpeditionPayout } from "./config";
import {
  DROUGHT_GAMBLE,
  PLAYOFF_STAGES,
  WEATHERS,
  WEATHER_RULES,
  watchWeeksOf,
  weatherForWeek,
  weatherLine,
  weatherNow,
  weatherOfRun,
} from "./weather";

describe("the week's weather", () => {
  it("is the same weather every time the week is read", () => {
    expect(weatherForWeek("2026-08-24")).toEqual(weatherForWeek("2026-08-24"));
    expect(weatherForWeek("2026-08-24").key).not.toBe("watch");
  });

  it("draws every ordinary sky over a season, and Clear most often", () => {
    const seen = new Map<string, number>();
    for (let week = 0; week < 60; week += 1) {
      const monday = new Date(Date.UTC(2026, 0, 5 + week * 7)).toISOString().slice(0, 10);
      const sky = weatherForWeek(monday).key;
      seen.set(sky, (seen.get(sky) ?? 0) + 1);
    }
    for (const key of ["clear", "fog", "drought", "harvest"]) expect(seen.get(key) ?? 0, key).toBeGreaterThan(0);
    expect(seen.has("watch")).toBe(false);
    expect(seen.get("clear")!).toBeGreaterThanOrEqual(seen.get("fog")!);
  });

  it("is the Watch in a playoff week, and only then", () => {
    expect(weatherForWeek("2026-08-24", true).key).toBe("watch");
    const fixtures = [
      { scheduled_at: "2026-08-25T00:00:00Z", stage: "week_3" },
      { scheduled_at: "2026-09-08T00:00:00Z", stage: "quarterfinals" },
      { scheduled_at: "2026-09-15T00:00:00Z", stage: "finals" },
      { scheduled_at: null, stage: "semifinals" },
    ];
    const weeks = watchWeeksOf(fixtures);
    // A Monday 8pm Eastern fixture is Tuesday 00:00 UTC; the week is its Monday.
    expect([...weeks].sort()).toEqual(["2026-09-07", "2026-09-14"]);
    expect(PLAYOFF_STAGES.has("gauntlet_r2")).toBe(false);
    expect(weatherNow(new Date("2026-09-09T12:00:00Z"), weeks).key).toBe("watch");
    expect(weatherNow(new Date("2026-08-26T12:00:00Z"), weeks).key).not.toBe("watch");
  });

  it("a run keeps the weather it launched under, and a run from before the rule has none", () => {
    const run = { startedAt: "2026-08-27T16:00:00Z", rules: WEATHER_RULES };
    expect(weatherOfRun(run)).toEqual(weatherForWeek("2026-08-24"));
    expect(weatherOfRun({ ...run, rules: WEATHER_RULES - 1 })).toBeNull();
    expect(weatherOfRun(run, new Set(["2026-08-24"]))?.key).toBe("watch");
    expect(WEATHER_RULES).toBe(5);
  });

  it("says what each sky does, in one line for Discord", () => {
    for (const sky of Object.values(WEATHERS)) {
      expect(sky.does.length).toBeGreaterThan(0);
      expect(weatherLine(sky)).toContain(sky.label);
    }
    expect(WEATHERS.harvest.does[0]).toContain(String(MERCHANT_DOLLARS * HARVEST_MERCHANT));
    expect(DROUGHT_GAMBLE).toBe(0.5);
  });

  it("the Harvest merchant is inside the claim's ceiling", () => {
    // The ceiling in 20261012000001 is maxExpeditionPayout(), which now
    // carries the doubled merchant; config.test.ts holds the newest
    // declaration to it, this holds the migration that introduced it.
    const sql = readFileSync(join(process.cwd(), "supabase/migrations/20261012000001_expedition_weather.sql"), "utf8");
    expect(Number(sql.match(/v_dollars not between 0 and (\d+)/)![1])).toBe(maxExpeditionPayout());
    expect(HARVEST_MERCHANT).toBe(2);
  });
});
