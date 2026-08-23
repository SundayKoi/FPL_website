import { describe, expect, it } from "vitest";
import { LCS_DRAFT_STEPS } from "@/lib/match-draft/rules";
import type { MatchDraftAction } from "@/lib/match-draft/types";
import type { ScoutSource } from "./types";
import { deriveScoutData, resolveScoutedSide, scopeTeamGames } from "./derive";

const fixture = (id: string, season = "S5", scheduledAt = "2026-08-0${id}T00:00:00Z") => ({
  id, season, stage: "week_1" as const, team_a: "Night Vale", team_b: "Other", scheduled_at: scheduledAt,
  best_of: 3 as const, score_a: 1, score_b: 0,
});

const actions = (firstPick: string, skipped = false): MatchDraftAction[] => LCS_DRAFT_STEPS.map((step) => ({
  stepIndex: step.index, side: step.side, kind: step.kind, slot: step.slot,
  champion: skipped && step.index === 7 ? null : step.kind === "pick" ? (step.index === 6 ? firstPick : `${step.side}-${step.kind}-${step.slot}`) : (step.side === "red" ? "Rumble" : `${step.side}-ban-${step.slot}`),
  skipped: skipped && step.index === 7,
}));

const source: ScoutSource = {
  opponentName: " night vale ", currentSeason: "S5", nextFixture: fixture("next"), roster: [],
  fixtures: [fixture("1", "S5", "2026-08-01T00:00:00Z"), fixture("2", "S5", "2026-08-02T00:00:00Z"), fixture("3", "S4", "2026-08-03T00:00:00Z"), fixture("4", "S4", "2026-08-04T00:00:00Z"), fixture("5", "S4", "2026-08-05T00:00:00Z"), fixture("6", "S4", "2026-08-06T00:00:00Z"), fixture("old", "S4", "2025-08-01T00:00:00Z")],
  drafts: [
    ...["1", "2", "3", "4", "5", "6"].map((id, i) => ({ id: `d${id}`, fixture_id: id, game_number: 1, blue_team_name: "Night Vale", red_team_name: "Other", winner_team: null, actions: actions(i < 2 ? "Ahri" : "Zed", i === 1 || i === 5), positions: null, created_at: "2026-08-01" })),
    { id: "old-draft", fixture_id: "old", game_number: 1, blue_team_name: "Other", red_team_name: "Night Vale", winner_team: null, actions: actions("Ahri"), positions: null, created_at: "2025-08-01" },
  ],
};

describe("opponent scouting derivation", () => {
  it("resolves sides and scopes recent series and season", () => {
    expect(resolveScoutedSide(source.drafts[0], " night vale ")).toBe("blue");
    expect(scopeTeamGames(source, "season").every((game) => game.fixture.season === "S5")).toBe(true);
    expect(new Set(scopeTeamGames(source, "recent").map((game) => game.fixture.id)).size).toBe(5);
  });

  it("derives first picks, opposing bans, ordered slots, and stable ties", () => {
    const data = deriveScoutData(source, "season");
    expect(data.firstPicks[0]).toMatchObject({ champion: "Ahri", count: 2 });
    expect(data.bannedAgainst[0]).toMatchObject({ champion: "Rumble", count: 10 });
    expect(data.pastDrafts[0].blue.banPhaseOne).toHaveLength(3);
    expect(data.pastDrafts[0].blue.banPhaseTwo).toHaveLength(2);
    expect(data.pastDrafts[0].red.picks).toHaveLength(5);
    expect(data.pastDrafts.some((draft) => draft.red.picks.some((slot) => slot.champion === null && slot.skipped))).toBe(true);
    expect(data.firstPicks.every((row, i, all) => !i || row.count < all[i - 1].count || row.champion.localeCompare(all[i - 1].champion) >= 0)).toBe(true);
  });
});
