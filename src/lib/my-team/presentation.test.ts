import { describe, expect, it } from "vitest";
import type { Player } from "@/lib/draft/types";
import type { FixtureRow } from "@/lib/schedule/types";
import type { MatchCode } from "@/lib/captain/queries";
import {
  buildLineupSlots,
  buildTournamentCodeSlots,
  deriveRecentSeries,
  deriveSeriesRecord,
  deriveUpcomingFixtures,
} from "./presentation";

function fixture(overrides: Partial<FixtureRow> = {}): FixtureRow {
  return {
    id: "fixture-1",
    season: "S5",
    stage: "week_1",
    division: null,
    team_a: "My Team",
    team_b: "Opponent",
    scheduled_at: "2026-08-01T20:00:00Z",
    best_of: 3,
    score_a: null,
    score_b: null,
    sort_order: 1,
    created_at: "2026-07-01T00:00:00Z",
    ...overrides,
  };
}

function player(overrides: Partial<Player> = {}): Player {
  return {
    id: "player-1",
    draft_id: "draft-1",
    display_name: "Player One",
    role: "top",
    rank: null,
    opgg_url: null,
    notes: null,
    canonical_player_id: null,
    team_id: "draft-team-1",
    price: null,
    acquisition: null,
    ...overrides,
  };
}

function code(overrides: Partial<MatchCode> = {}): MatchCode {
  return {
    id: "code-1",
    fixture_id: "fixture-1",
    season: "S5",
    team_a_id: "team-1",
    team_b_id: "team-2",
    game_number: 1,
    code: "CODE-1",
    note: null,
    created_by: null,
    created_at: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

describe("My Team presentation", () => {
  it("derives case-insensitive series wins, losses, and ties and ignores incomplete results", () => {
    const fixtures = [
      fixture({ id: "win", team_a: " my TEAM ", score_a: 2, score_b: 1 }),
      fixture({ id: "loss", team_a: "Opponent", team_b: "MY TEAM", score_a: 2, score_b: 0 }),
      fixture({ id: "tie", team_a: "MY TEAM", team_b: "Opponent", score_a: 1, score_b: 1 }),
      fixture({ id: "partial", score_a: 2, score_b: null }),
      fixture({ id: "upcoming" }),
    ];

    expect(deriveSeriesRecord(fixtures, " My Team ")).toEqual({ wins: 1, losses: 1 });
    expect(deriveRecentSeries(fixtures, "my team")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fixtureId: "win", outcome: "W", myScore: 2, opponentScore: 1 }),
        expect.objectContaining({ fixtureId: "loss", outcome: "L", myScore: 0, opponentScore: 2 }),
        expect.objectContaining({ fixtureId: "tie", outcome: "T", myScore: 1, opponentScore: 1 }),
      ]),
    );
  });

  it("orders recent and upcoming fixtures by date, stage, and sort order with null dates stable", () => {
    const upcoming = [
      fixture({ id: "null-date", scheduled_at: null, stage: "finals", sort_order: 1 }),
      fixture({ id: "late", scheduled_at: "2026-08-20T20:00:00Z", sort_order: 9 }),
      fixture({ id: "early", scheduled_at: "2026-08-10T20:00:00Z", sort_order: 5 }),
      fixture({ id: "same-stage-later", scheduled_at: "2026-08-10T20:00:00Z", sort_order: 8 }),
    ];
    expect(deriveUpcomingFixtures(upcoming).map((row) => row.id)).toEqual([
      "early",
      "same-stage-later",
      "late",
      "null-date",
    ]);

    const recent = upcoming.map((row, index) => ({
      ...row,
      id: `recent-${index}`,
      scheduled_at: index === 0 ? null : row.scheduled_at,
      score_a: 1,
      score_b: 0,
    }));
    expect(deriveRecentSeries(recent, "my team").map((row) => row.fixtureId)).toEqual([
      "recent-1",
      "recent-2",
      "recent-3",
    ]);
  });

  it("limits recent results to three and handles no fixtures", () => {
    expect(deriveRecentSeries([], "My Team")).toEqual([]);
    expect(deriveSeriesRecord([], "My Team")).toEqual({ wins: 0, losses: 0 });
    const rows = Array.from({ length: 4 }, (_, index) => fixture({
      id: `fixture-${index}`,
      scheduled_at: `2026-08-${String(index + 1).padStart(2, "0")}T20:00:00Z`,
      score_a: 2,
      score_b: 0,
    }));
    expect(deriveRecentSeries(rows, "My Team", 3)).toHaveLength(3);
  });

  it("builds exactly five canonical role slots, fills missing players, and marks only canonical identity", () => {
    const slots = buildLineupSlots({
      mine: [
        player({ id: "support", role: "support", display_name: "Support" }),
        player({ id: "mid", role: "mid", display_name: "Viewer", canonical_player_id: "pool-1" }),
        player({ id: "duplicate-mid", role: "mid", display_name: "Duplicate" }),
        player({ id: "top", role: "top", display_name: "Top" }),
        player({ id: "extra", role: "jungle", display_name: "Jungle" }),
        player({ id: "adc", role: "adc", display_name: "ADC" }),
      ],
      opponent: [
        player({ id: "opponent-support", role: "support", display_name: "Enemy Support" }),
        player({ id: "opponent-mid", role: "mid", display_name: "Enemy Mid" }),
      ],
      playerPoolId: "pool-1",
    });

    expect(slots.map((slot) => slot.role)).toEqual(["top", "jungle", "mid", "adc", "support"]);
    expect(slots).toHaveLength(5);
    expect(slots.find((slot) => slot.role === "jungle")?.mine?.display_name).toBe("Jungle");
    expect(slots.find((slot) => slot.role === "mid")?.mine?.display_name).toBe("Duplicate");
    expect(slots.find((slot) => slot.role === "mid")?.viewerIsMine).toBe(false);
    expect(slots.find((slot) => slot.role === "support")?.viewerIsMine).toBe(false);
  });

  it("preserves own players when opponent roster is unavailable", () => {
    const slots = buildLineupSlots({
      mine: [player({ role: "top" }), player({ role: "support", id: "support" })],
      opponent: null,
      playerPoolId: null,
    });
    expect(slots.find((slot) => slot.role === "top")?.mine?.display_name).toBe("Player One");
    expect(slots.every((slot) => slot.opponent === null)).toBe(true);
  });

  it("creates one ordered slot per expected game, choosing one duplicate deterministically", () => {
    const slots = buildTournamentCodeSlots([
      code({ id: "code-3", game_number: 3, code: "CODE-3" }),
      code({ id: "code-2", game_number: 2, code: "CODE-2" }),
      code({ id: "code-2-duplicate", game_number: 2, code: "DUPLICATE" }),
    ], 3);
    expect(slots.map((slot) => slot.gameNumber)).toEqual([1, 2, 3]);
    expect(slots[0].code).toBeNull();
    expect(slots[1].code?.code).toBe("CODE-2");
    expect(slots[2].code?.code).toBe("CODE-3");
    expect(buildTournamentCodeSlots([], 1).map((slot) => slot.gameNumber)).toEqual([1]);
    expect(buildTournamentCodeSlots([], 5).map((slot) => slot.gameNumber)).toEqual([1, 2, 3, 4, 5]);
  });
});
