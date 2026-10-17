import { describe, expect, it } from "vitest";
import { formatWeekTime, nextWeekMoment } from "./times";

describe("formatWeekTime", () => {
  it("shows Eastern Time on either side of the clock change", () => {
    expect(formatWeekTime("2026-10-19T00:00:00Z")).toBe("Sun, Oct 18, 8:00 PM EDT");
    expect(formatWeekTime("2026-11-10T01:00:00Z")).toBe("Mon, Nov 9, 8:00 PM EST");
  });
});

describe("nextWeekMoment", () => {
  const week = { week_number: 2, draft_at: "2026-10-26T23:00:00Z", games_at: "2026-10-27T00:00:00Z" };

  it("is the draft until it starts, then the games", () => {
    expect(nextWeekMoment(week, Date.parse("2026-10-25T12:00:00Z"))).toEqual({ kind: "draft", weekNumber: 2, at: week.draft_at });
    expect(nextWeekMoment(week, Date.parse("2026-10-26T23:30:00Z"))).toEqual({ kind: "games", weekNumber: 2, at: week.games_at });
  });

  it("is nothing once both have passed or neither is set", () => {
    expect(nextWeekMoment(week, Date.parse("2026-10-28T00:00:00Z"))).toBeNull();
    expect(nextWeekMoment({ week_number: 2, draft_at: null, games_at: null })).toBeNull();
  });
});
