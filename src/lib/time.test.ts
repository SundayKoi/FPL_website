import { describe, expect, it } from "vitest";
import { easternStamp, relativeTime } from "./time";

const NOW = new Date("2026-09-03T20:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

describe("relativeTime", () => {
  it("rounds to the unit a row has room for", () => {
    expect(relativeTime(ago(10_000), NOW)).toBe("just now");
    expect(relativeTime(ago(5 * 60_000), NOW)).toBe("5m ago");
    expect(relativeTime(ago(3 * 3_600_000), NOW)).toBe("3h ago");
    expect(relativeTime(ago(2 * 86_400_000), NOW)).toBe("2d ago");
  });

  it("falls back to a date once it is old news", () => {
    expect(relativeTime(ago(20 * 86_400_000), NOW)).toBe("Aug 14");
  });

  it("says nothing for nothing", () => {
    expect(relativeTime(null, NOW)).toBe("");
    expect(relativeTime("not a date", NOW)).toBe("");
  });
});

describe("easternStamp", () => {
  it("pins to league time and says so", () => {
    expect(easternStamp("2026-09-03T20:00:00Z")).toBe("Sep 3, 2026, 4:00 PM ET");
  });
});
