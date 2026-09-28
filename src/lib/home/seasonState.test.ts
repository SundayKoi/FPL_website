import { describe, expect, it } from "vitest";
import { FIRST_GAME_AT, getHomepagePhase, resolveHomepagePhase } from "./seasonState";

describe("homepage season phase", () => {
  it("switches from preseason to regular season at the first game boundary", () => {
    const firstGame = new Date(FIRST_GAME_AT);

    expect(getHomepagePhase(new Date(firstGame.getTime() - 1))).toBe("preseason");
    expect(getHomepagePhase(firstGame)).toBe("regular");
  });

  it("honors an explicit staff phase override independently of the calendar", () => {
    const beforeOpening = new Date("2026-08-14T12:00:00-05:00");
    const afterOpening = new Date("2026-08-18T12:00:00-05:00");

    expect(resolveHomepagePhase("regular", beforeOpening)).toBe("regular");
    expect(resolveHomepagePhase("preseason", afterOpening)).toBe("preseason");
  });
});
