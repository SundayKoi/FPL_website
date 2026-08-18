import { describe, expect, it } from "vitest";
import {
  formatEasternDateTime,
  formatEasternInputValue,
  parseEasternInputValue,
} from "./schedule";

describe("draft schedules", () => {
  it("formats a scheduled instant in Eastern Time", () => {
    expect(formatEasternDateTime("2026-08-16T01:00:00.000Z")).toContain("Saturday, August 15");
    expect(formatEasternDateTime("2026-08-16T01:00:00.000Z")).toContain("9:00 PM");
  });

  it("formats a stored instant for a datetime-local input", () => {
    expect(formatEasternInputValue("2026-08-16T01:00:00.000Z")).toBe("2026-08-15T21:00");
  });

  it("parses an Eastern datetime-local value to an ISO instant", () => {
    expect(parseEasternInputValue("2026-08-15T21:00")).toEqual({
      iso: "2026-08-16T01:00:00.000Z",
    });
  });

  it("rejects a datetime-local value that is not complete", () => {
    expect(parseEasternInputValue("2026-08-16")).toEqual({ error: "Enter a date and time." });
  });
});
