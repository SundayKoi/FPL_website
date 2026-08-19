import { describe, expect, it } from "vitest";
import {
  DRAFT_TURN_SECONDS,
  LCS_DRAFT_STEPS,
  fearlessBlockedChampions,
  matchDraftLinksForFixture,
} from "./rules";
import type { FixtureRow } from "@/lib/schedule/types";

const fixture: FixtureRow = {
  id: "fixture-1",
  season: "S5",
  stage: "week_1",
  division: null,
  team_a: "Blue Team",
  team_b: "Red Team",
  scheduled_at: null,
  best_of: 3,
  score_a: null,
  score_b: null,
  sort_order: 0,
  created_at: "2026-08-19T00:00:00Z",
};

describe("LCS_DRAFT_STEPS", () => {
  it("uses the tournament draft order with 30 seconds for every pick and ban", () => {
    expect(LCS_DRAFT_STEPS.map((step) => `${step.side}:${step.kind}:${step.slot}`)).toEqual([
      "blue:ban:1",
      "red:ban:1",
      "blue:ban:2",
      "red:ban:2",
      "blue:ban:3",
      "red:ban:3",
      "blue:pick:1",
      "red:pick:1",
      "red:pick:2",
      "blue:pick:2",
      "blue:pick:3",
      "red:pick:3",
      "red:ban:4",
      "blue:ban:4",
      "red:ban:5",
      "blue:ban:5",
      "red:pick:4",
      "blue:pick:4",
      "blue:pick:5",
      "red:pick:5",
    ]);
    expect(LCS_DRAFT_STEPS.every((step) => step.seconds === DRAFT_TURN_SECONDS)).toBe(true);
  });
});

describe("matchDraftLinksForFixture", () => {
  it("creates three fearless game links for regular-season Bo3 fixtures", () => {
    expect(matchDraftLinksForFixture(fixture)).toEqual([
      { gameNumber: 1, href: "/match-draft/fixture-1?game=1&layout=stage", label: "Game 1 draft" },
      { gameNumber: 2, href: "/match-draft/fixture-1?game=2&layout=stage", label: "Game 2 draft" },
      { gameNumber: 3, href: "/match-draft/fixture-1?game=3&layout=stage", label: "Game 3 draft" },
    ]);
  });

  it("uses the fixture best_of count for non-regular-season fixtures", () => {
    expect(matchDraftLinksForFixture({ ...fixture, stage: "finals", best_of: 5 })).toHaveLength(5);
  });
});

describe("fearlessBlockedChampions", () => {
  it("blocks champions picked in earlier games of the same series only", () => {
    expect(
      fearlessBlockedChampions(
        [
          { gameNumber: 1, actions: [{ kind: "pick", champion: "Ahri" }, { kind: "ban", champion: "Aatrox" }] },
          { gameNumber: 2, actions: [{ kind: "pick", champion: "Zeri" }] },
          { gameNumber: 3, actions: [{ kind: "pick", champion: "Orianna" }] },
        ],
        3,
      ),
    ).toEqual(new Set(["Ahri", "Zeri"]));
  });
});
