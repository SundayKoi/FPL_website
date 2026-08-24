import { describe, expect, it } from "vitest";
import { mondayOf } from "./week";

describe("mondayOf", () => {
  it("returns the same Monday for every day of that EASTERN week", () => {
    // 2026-08-17 is a Monday. Eastern midnight is 04:00Z under EDT.
    const week = ["2026-08-17T04:00:00Z", "2026-08-20T13:45:00Z", "2026-08-24T03:59:59Z"];
    for (const stamp of week) {
      expect(mondayOf(new Date(stamp))).toBe("2026-08-17");
    }
  });

  it("keeps a Sunday-evening ET instant in ITS week even though UTC has rolled over", () => {
    // 2026-08-24T00:00Z is still Sunday Aug 23, 8:00 PM in New York — the
    // exact case that used to stamp next week's edition on a Sunday pull.
    expect(mondayOf(new Date("2026-08-24T00:00:00Z"))).toBe("2026-08-17");
    // The week actually turns at ET midnight (04:00Z under EDT).
    expect(mondayOf(new Date("2026-08-24T04:00:00Z"))).toBe("2026-08-24");
  });

  it("uses the EST offset in winter", () => {
    // 2026-12-14 is a Monday; ET midnight is 05:00Z under EST.
    expect(mondayOf(new Date("2026-12-14T04:59:59Z"))).toBe("2026-12-07");
    expect(mondayOf(new Date("2026-12-14T05:00:00Z"))).toBe("2026-12-14");
  });

  it("crosses month and year boundaries", () => {
    expect(mondayOf(new Date("2026-01-01T12:00:00Z"))).toBe("2025-12-29");
  });

  it("does not mutate the input date", () => {
    const date = new Date("2026-08-20T13:45:00Z");
    mondayOf(date);
    expect(date.toISOString()).toBe("2026-08-20T13:45:00.000Z");
  });
});
