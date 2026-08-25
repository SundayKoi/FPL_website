import type { DraftSide, MatchDraftAction } from "./types";
import { describe, expect, it } from "vitest";
import {
  DRAFT_TURN_SECONDS,
  LCS_DRAFT_STEPS,
  fearlessBlockedChampions,
  fearlessBlockedByGame,
  matchDraftBestOf,
  matchDraftGameLinks,
  matchDraftHref,
  matchDraftOverlayHref, pickOrderBySide, normalizeChampionName} from "./rules";
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

describe("fearlessBlockedByGame", () => {
  it("maps each blocked champion to the game that took it, keeping the earliest", () => {
    expect(
      fearlessBlockedByGame(
        [
          { gameNumber: 1, actions: [{ kind: "pick", champion: "Ahri" }, { kind: "ban", champion: "Aatrox" }] },
          // Re-picking a champion is impossible under fearless, but a series
          // played with fearless toggled on mid-way can carry one — the first
          // game that used it is the honest answer for the badge.
          { gameNumber: 2, actions: [{ kind: "pick", champion: "Ahri" }, { kind: "pick", champion: "Zeri" }] },
          { gameNumber: 3, actions: [{ kind: "pick", champion: "Orianna" }] },
        ],
        3,
      ),
    ).toEqual({ ahri: 1, zeri: 2 });
  });

  it("keys by normalized name so casing and spacing can't miss a badge", () => {
    expect(
      fearlessBlockedByGame([{ gameNumber: 1, actions: [{ kind: "pick", champion: "  Lee  Sin " }] }], 2),
    ).toEqual({ "lee sin": 1 });
  });
});

describe("pickOrderBySide", () => {
  /** A pick action as the board records one. */
  const pick = (stepIndex: number, side: DraftSide, slot: number, champion: string | null): MatchDraftAction => ({
    stepIndex,
    side,
    kind: "pick",
    slot,
    champion,
  });

  const game: MatchDraftAction[] = [
    { stepIndex: 0, side: "blue", kind: "ban", slot: 1, champion: "Aatrox" },
    pick(6, "blue", 1, "Ahri"),
    pick(7, "red", 1, "Jinx"),
    pick(9, "blue", 2, "Lulu"),
    pick(10, "blue", 3, "Sett"),
    pick(16, "red", 4, "Bard"),
  ];

  it("numbers a side's picks in the order that side took them", () => {
    const order = pickOrderBySide(game, "blue");
    expect([...order.entries()].map(([champion, entry]) => [champion, entry.pick])).toEqual([
      ["ahri", 1],
      ["lulu", 2],
      ["sett", 3],
    ]);
  });

  it("keeps the position in the whole draft, not just the side's", () => {
    // "Answered immediately" and "answered three turns later" are different
    // reads, and only the global step index tells them apart.
    expect(pickOrderBySide(game, "red").get("bard")?.step).toBe(16);
  });

  it("ignores the other side's picks", () => {
    expect(pickOrderBySide(game, "blue").has("jinx")).toBe(false);
  });

  it("ignores bans", () => {
    expect(pickOrderBySide(game, "blue").has("aatrox")).toBe(false);
  });

  it("skips a pick nobody made", () => {
    // A skipped pick carries no champion, so there is nothing to key on.
    const order = pickOrderBySide([...game, pick(18, "blue", 4, null)], "blue");
    expect(order.size).toBe(3);
  });

  it("matches the champion however the confirmed order spells it", () => {
    // positions stores champion NAMES, and this map is looked up with them.
    expect(pickOrderBySide(game, "blue").get(normalizeChampionName("Ahri"))?.pick).toBe(1);
  });

  it("falls back to draft order when an action carries no slot", () => {
    const legacy = [
      { stepIndex: 9, side: "blue", kind: "pick", champion: "Lulu" },
      { stepIndex: 6, side: "blue", kind: "pick", champion: "Ahri" },
    ] as MatchDraftAction[];
    const order = pickOrderBySide(legacy, "blue");
    expect(order.get("ahri")?.pick).toBe(1);
    expect(order.get("lulu")?.pick).toBe(2);
  });

  it("survives an unfinished draft", () => {
    expect(pickOrderBySide([], "blue").size).toBe(0);
  });
});
