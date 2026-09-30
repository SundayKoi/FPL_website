import { describe, expect, it } from "vitest";
import { isIsoDate, isRecord } from "./validation";

describe("isRecord", () => {
  it("accepts objects and arrays but not null or primitives", () => {
    expect(isRecord({ league: "premier" })).toBe(true);
    expect(isRecord([])).toBe(true);
    expect(isRecord(null)).toBe(false);
    expect(isRecord(undefined)).toBe(false);
    expect(isRecord("premier")).toBe(false);
  });
});

describe("isIsoDate", () => {
  it("accepts a real calendar date", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2028-02-29")).toBe(true);
  });

  it("rejects impossible dates, other formats, and non-strings", () => {
    expect(isIsoDate("2026-02-29")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("2026-2-28")).toBe(false);
    expect(isIsoDate("2026-02-28T00:00:00Z")).toBe(false);
    expect(isIsoDate(20260228)).toBe(false);
  });
});
