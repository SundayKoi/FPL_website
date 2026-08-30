import { describe, expect, it } from "vitest";
import { settlementWindow } from "./higher-lower-settlement";

describe("Higher or Lower settlement schedule", () => {
  it("maps the EDT trigger to Monday 8 PM and the prior UTC week", () => {
    expect(settlementWindow(new Date("2026-09-01T00:00:00.000Z"))).toMatchObject({
      eligible: true,
      localDate: "2026-08-31",
      localHour: 20,
      weekStart: "2026-08-24",
    });
  });

  it("keeps the EST trigger pair DST-safe", () => {
    expect(settlementWindow(new Date("2026-01-06T00:00:00.000Z")).eligible).toBe(false);
    expect(settlementWindow(new Date("2026-01-06T01:00:00.000Z"))).toMatchObject({
      eligible: true,
      localDate: "2026-01-05",
      localHour: 20,
      weekStart: "2025-12-29",
    });
  });
});
