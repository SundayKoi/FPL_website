import { describe, expect, it } from "vitest";
import {
  FIRST_GAME_AT,
  DRAFT_DAY_AT,
  getHomepagePhase,
  getCountdownParts,
} from "./seasonState";

describe("homepage season state", () => {
  it("keeps the preseason page active until the first game", () => {
    expect(getHomepagePhase(new Date("2026-08-15T19:59:00-04:00"))).toBe("preseason");
    expect(getHomepagePhase(new Date("2026-08-16T23:59:59-04:00"))).toBe("preseason");
    expect(getHomepagePhase(new Date(FIRST_GAME_AT))).toBe("regular");
  });

  it("exposes the published draft and first-game event times", () => {
    expect(DRAFT_DAY_AT).toBe("2026-08-15T20:00:00-05:00");
    expect(FIRST_GAME_AT).toBe("2026-08-17T00:00:00-04:00");
  });

  it("formats a countdown without rounding up the current second", () => {
    expect(
      getCountdownParts(new Date("2026-08-15T20:00:00-04:00"), new Date("2026-08-15T19:58:29-04:00")),
    ).toEqual({ days: 0, hours: 0, minutes: 1, seconds: 31, complete: false });
  });
});
