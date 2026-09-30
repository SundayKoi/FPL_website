import { describe, expect, it } from "vitest";
import { utcDateLabel } from "./time";

describe("utcDateLabel", () => {
  it("formats the UTC calendar date regardless of the local zone", () => {
    expect(utcDateLabel("2026-09-25T23:30:00Z")).toBe("Sep 25, 2026");
    expect(utcDateLabel("2026-01-01T00:00:00Z")).toBe("Jan 1, 2026");
  });

  it("shows the fallback for unparseable input", () => {
    expect(utcDateLabel("not a date")).toBe("—");
    expect(utcDateLabel("not a date", "not a date")).toBe("not a date");
  });
});
