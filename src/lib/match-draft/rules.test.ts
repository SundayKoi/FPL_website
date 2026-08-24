import { describe, expect, it } from "vitest";
import {
  DRAFT_TURN_SECONDS,
  LCS_DRAFT_STEPS,
  fearlessBlockedChampions,
  matchDraftBestOf,
  matchDraftGameLinks,
  matchDraftHref,
  matchDraftOverlayHref,
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

describe("match draft links", () => {
  it("shares one link per fixture, with per-game tab links inside", () => {
    expect(matchDraftHref(fixture)).toBe("/match-draft/fixture-1");
    expect(matchDraftOverlayHref(fixture)).toBe(
      "/match-draft/fixture-1?overlay=1&bg=transparent",
    );
    expect(matchDraftGameLinks(fixture)).toEqual([
      { gameNumber: 1, href: "/match-draft/fixture-1?game=1", label: "Game 1" },
      { gameNumber: 2, href: "/match-draft/fixture-1?game=2", label: "Game 2" },
      { gameNumber: 3, href: "/match-draft/fixture-1?game=3", label: "Game 3" },
    ]);
  });

  it("forces regular-season series to Bo3 and honors best_of elsewhere", () => {
    expect(matchDraftBestOf(fixture)).toBe(3);
    expect(matchDraftBestOf({ ...fixture, stage: "finals", best_of: 5 })).toBe(5);
    expect(matchDraftGameLinks({ ...fixture, stage: "finals", best_of: 5 })).toHaveLength(5);
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
