import { describe, expect, it } from "vitest";
import { mondayOf } from "./week";

describe("mondayOf", () => {
  it("returns the same Monday for every day of that UTC week", () => {
    // 2026-08-17 is a Monday
    const week = ["2026-08-17T00:00:00Z", "2026-08-20T13:45:00Z", "2026-08-23T23:59:59Z"];
    for (const stamp of week) {
      expect(mondayOf(new Date(stamp))).toBe("2026-08-17");
    }
  });

  it("rolls to the next Monday once Sunday ends", () => {
    expect(mondayOf(new Date("2026-08-23T23:59:59Z"))).toBe("2026-08-17");
    expect(mondayOf(new Date("2026-08-24T00:00:00Z"))).toBe("2026-08-24");
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
