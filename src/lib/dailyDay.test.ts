import { describe, expect, it } from "vitest";
import { dailyGameDate } from "./dailyDay";
import { easternDateOf } from "@/lib/packs/week";

describe("the daily game day", () => {
  it("rolls over at Eastern midnight, not UTC midnight", () => {
    // THE bug this file exists for. 01:00 UTC is 9pm the previous day in
    // Eastern — prime playing time. Under the old UTC day the puzzle had
    // already flipped while the Daily Rip had not, so the same visit was
    // on two different days at once.
    const ninePmEastern = new Date("2026-09-11T01:00:00Z");
    expect(dailyGameDate(ninePmEastern)).toBe("2026-09-10");
    expect(ninePmEastern.toISOString().slice(0, 10)).toBe("2026-09-11");
  });

  it("agrees with the calendar the rip and expeditions already keep", () => {
    // Not a second implementation of Eastern: the same function
    // open_daily_pack's day is derived from on the app side.
    for (const iso of ["2026-01-01T04:59:00Z", "2026-06-15T12:00:00Z", "2026-11-02T05:30:00Z"]) {
      const at = new Date(iso);
      expect(dailyGameDate(at)).toBe(easternDateOf(at));
    }
  });

  it("has already turned over by Eastern midnight", () => {
    // 04:00 UTC in summer is exactly midnight Eastern.
    expect(dailyGameDate(new Date("2026-09-11T03:59:00Z"))).toBe("2026-09-10");
    expect(dailyGameDate(new Date("2026-09-11T04:00:00Z"))).toBe("2026-09-11");
  });

  it("returns a plain ISO date", () => {
    expect(dailyGameDate(new Date("2026-09-11T18:00:00Z"))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
