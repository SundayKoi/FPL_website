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
    { id: "old-draft", fixture_id: "old", game_number: 1, blue_team_name: "Other", red_team_name: "Night Vale", winner_team: null, actions: actions("Ahri").map((action) => action.stepIndex === 7 ? { ...action, champion: "Ahri" } : action), positions: null, created_at: "2025-08-01" },
    { id: "untouched", fixture_id: "1", game_number: 2, blue_team_name: "Night Vale", red_team_name: "Other", winner_team: null, actions: [], positions: null, created_at: "2026-08-01" },
  ],
};

describe("opponent scouting derivation", () => {
  it("resolves sides and scopes recent series and season", () => {
    expect(resolveScoutedSide(source.drafts[0], " night vale ")).toBe("blue");
    expect(resolveScoutedSide(source.drafts.find((draft) => draft.id === "old-draft")!, "NIGHT VALE")).toBe("red");
    expect(scopeTeamGames(source, "season").every((game) => game.fixture.season === "S5")).toBe(true);
    expect(scopeTeamGames(source, "all").some((game) => game.draft.id === "untouched")).toBe(false);
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

  it("normalizes champion variants into one frequency row", () => {
    const variant = structuredClone(source);
    const firstPick = variant.drafts[0].actions.find((action) => action.stepIndex === 6)!;
    firstPick.champion = "  ahri  ";
    expect(deriveScoutData(variant, "all").firstPicks.find((row) => row.champion === "Ahri")?.count).toBe(3);
  });

  it("builds trade-aware pools from the current roster and scopes attributed fixtures", () => {
    const traded = structuredClone(source);
    traded.roster = [
      { id: "h", displayName: "Hollowpoint", role: "top" },
      { id: "g", displayName: "GhostRoute", role: "jungle" },
      { id: "n", displayName: " NorthStar ", role: "mid" },
      { id: "h2", displayName: "Halflight", role: "adc" },
      { id: "l", displayName: "LowTide", role: "support" },
    ];
    const pick = (name: string, champion: string, stepIndex = 6): MatchDraftAction => ({ stepIndex, side: "blue", kind: "pick", slot: 1, playerName: name, champion });
    traded.drafts = [
      ...traded.drafts,
      ...["7", "8"].map((id) => ({ ...traded.drafts[0], id: `trade-${id}`, fixture_id: id, actions: [pick("northstar", "Ahri")] })),
      { ...traded.drafts[0], id: "trade-ori", fixture_id: "1", actions: [pick(" NorthStar ", "Orianna")] },
      { ...traded.drafts[0], id: "former-team", fixture_id: "1", actions: [pick("Former Mid", "LeBlanc")] },
      ...Array.from({ length: 5 }, (_, index) => ({ ...traded.drafts[0], id: `away-${index}`, fixture_id: "1", actions: [pick("Former Mid", "Ahri")] })),
    ];
    traded.fixtures = [...traded.fixtures, fixture("7", "S5", "2026-08-07T00:00:00Z"), fixture("8", "S5", "2026-08-08T00:00:00Z")];
    const pools = deriveScoutData(traded, "all").playerPools;
    expect(pools.map((row) => row.playerName)).toEqual(["Hollowpoint", "GhostRoute", "NorthStar", "Halflight", "LowTide"]);
    expect(pools.find((row) => row.playerName === "NorthStar")?.champions).toEqual([{ champion: "Ahri", count: 2 }, { champion: "Orianna", count: 1 }]);
    expect(pools.find((row) => row.playerName === "Hollowpoint")?.totalPicks).toBe(0);
    expect(pools.some((row) => row.playerName === "Former Mid")).toBe(false);
  });

  it("keeps current-season former-team history and limits recent pools to five fixture groups", () => {
    const scoped = structuredClone(source);
    scoped.roster = [{ id: "n", displayName: "Northstar", role: "mid" }];
    const pick = (fixtureId: string, champion: string, playerName: string | null = "Northstar") => ({ ...scoped.drafts[0], id: `pool-${fixtureId}-${champion}`, fixture_id: fixtureId, actions: [{ stepIndex: 6, side: "blue" as const, kind: "pick" as const, slot: 1, champion, playerName }] });
    scoped.drafts = [pick("1", "FormerTeamAhri"), pick("2", "Orianna"), pick("3", "Zed"), pick("4", "Syndra"), pick("5", "Viktor"), pick("6", "LeBlanc"), pick("old", "ShouldNotCount", null)];
    const season = deriveScoutData(scoped, "season").playerPools[0];
    expect(season.champions.map((row) => row.champion)).toContain("FormerTeamAhri");
    expect(season.totalPicks).toBe(2);
    const recent = deriveScoutData(scoped, "recent").playerPools[0];
    expect(recent.gamesSampled).toBe(5);
    expect(recent.champions.map((row) => row.champion)).not.toContain("FormerTeamAhri");
  });

  it("preserves pool aggregates when the visible champion list is capped at five", () => {
    const capped = structuredClone(source);
    capped.roster = [{ id: "n", displayName: "Northstar", role: "mid" }];
    capped.drafts = Array.from({ length: 6 }, (_, index) => ({ ...capped.drafts[0], id: `cap-${index}`, actions: [{ stepIndex: 6, side: "blue" as const, kind: "pick" as const, slot: 1, champion: `Champion ${index}`, playerName: "Northstar" }] }));
    const pool = deriveScoutData(capped, "all").playerPools[0];
    expect(pool.champions).toHaveLength(5);
    expect(pool.distinctChampions).toBe(6);
    expect(pool.totalPicks).toBe(6);
  });

  it("derives openings, pairings, side facts, adaptation, and confirmed flexes", () => {
    const patterned = structuredClone(source);
    patterned.roster = [];
    const game = (id: string, gameNumber: number, winnerTeam: string | null, first: string, positions: string[] | null = null) => ({
      ...patterned.drafts[0], id, fixture_id: id, game_number: gameNumber, winner_team: winnerTeam,
      positions: positions ? { blue: positions } : null,
      actions: LCS_DRAFT_STEPS.map((step) => ({ stepIndex: step.index, side: step.side, kind: step.kind, slot: step.slot, champion: step.kind === "pick" ? (step.side === "blue" ? [first, "Vi", "Nautilus", "Ahri", "Garen"][step.slot - 1] : `red-${step.slot}`) : `ban-${step.index}` })),
    });
    patterned.fixtures = [fixture("p1", "S5", "2026-08-10T00:00:00Z")];
    patterned.drafts = [game("p1", 1, "Other", "Ahri", ["Ahri", "Vi", "Ahri", "Nautilus", "Garen"]), { ...game("p2", 2, "Night Vale", "Ahri"), fixture_id: "p1" }];
    const data = deriveScoutData(patterned, "all");
    expect(data.openings[0]).toMatchObject({ champion: "Ahri / Vi / Nautilus", count: 2 });
    expect(data.pairings.find((row) => row.champion === "Ahri + Vi")?.count).toBe(2);
    expect(data.sideFacts).toEqual(expect.arrayContaining([{ side: "blue", games: 2, commonOpening: expect.objectContaining({ champion: "Ahri", count: 2 }) }]));
    expect(data.adaptation).toEqual({ lossesFollowed: 1, changedFirstPick: 0, repeatedChampions: 5 });
    expect(data.flexes).toEqual([{ champion: "Ahri", roles: ["Top", "Mid"] }]);
  });
});
