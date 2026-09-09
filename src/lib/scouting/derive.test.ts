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

  it("attributes substitute games from three-or-more current-roster players on one side", () => {
    const withSubstitutes = structuredClone(source) as ScoutSource;
    withSubstitutes.opponentName = "Night Vale";
    withSubstitutes.roster = [
      { id: "p1", displayName: "Player 1", role: "top" },
      { id: "p2", displayName: "Player 2", role: "jungle" },
      { id: "p3", displayName: "Player 3", role: "mid" },
      { id: "p4", displayName: "Player 4", role: "adc" },
      { id: "p5", displayName: "Player 5", role: "support" },
    ];
    withSubstitutes.fixtures = [fixture("four", "S5", "2026-08-10T00:00:00Z"), fixture("three", "S5", "2026-08-11T00:00:00Z")];
    withSubstitutes.drafts = [
      { ...source.drafts[0], id: "four-draft", fixture_id: "four", blue_team_name: "Substitute Blue", red_team_name: "Other" },
      { ...source.drafts[0], id: "three-draft", fixture_id: "three", blue_team_name: "Other", red_team_name: "Substitute Red" },
    ];
    withSubstitutes.ingestedGames = [
      ...["p1", "p2", "p3", "p4"].map((playerId) => ({ playerId, playerName: playerId, role: "top" as const, champion: "Ahri", fixtureId: "four", gameNumber: 1, teamSide: "blue" as const, season: "S5", matchId: "four-game-1", gameDate: null })),
      ...["p1", "p2", "p3"].map((playerId) => ({ playerId, playerName: playerId, role: "top" as const, champion: "Ahri", fixtureId: "three", gameNumber: 1, teamSide: "red" as const, season: "S5", matchId: "three-game-1", gameDate: null })),
    ];

    const games = scopeTeamGames(withSubstitutes, "all");

    expect(games.map((game) => [game.fixture.id, game.side])).toEqual([["three", "red"], ["four", "blue"]]);
  });

  it("resolves reported draft outcomes from per-game Riot results", () => {
    const withResults = structuredClone(source) as ScoutSource;
    withResults.opponentName = "Night Vale";
    withResults.fixtures = [fixture("blue-win"), fixture("red-win", "S5", "2026-08-09T00:00:00Z")];
    withResults.drafts = [
      { ...source.drafts[0], id: "blue-win-draft", fixture_id: "blue-win", winner_team: null },
      { ...source.drafts[0], id: "red-win-draft", fixture_id: "red-win", winner_team: null },
    ];
    withResults.ingestedGames = [
      { playerId: "blue-player", playerName: "Blue player", role: "mid", champion: "Ahri", fixtureId: "blue-win", gameNumber: 1, teamSide: "blue", win: true, season: "S5", matchId: "blue-win-game-1", gameDate: null },
      { playerId: "red-player", playerName: "Red player", role: "mid", champion: "Ahri", fixtureId: "red-win", gameNumber: 1, teamSide: "red", win: true, season: "S5", matchId: "red-win-game-1", gameDate: null },
    ];

    const data = deriveScoutData(withResults, "all");

    expect(data.pastDrafts.find((draft) => draft.fixture.id === "blue-win")?.winnerTeam).toBe("Night Vale");
    expect(data.pastDrafts.find((draft) => draft.fixture.id === "red-win")?.winnerTeam).toBe("Other");
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
    expect(pools.find((row) => row.playerName === "NorthStar")?.champions).toMatchObject([{ champion: "Ahri", count: 2 }, { champion: "Orianna", count: 1 }]);
    expect(pools.find((row) => row.playerName === "Hollowpoint")?.totalPicks).toBe(0);
    expect(pools.some((row) => row.playerName === "Former Mid")).toBe(false);
  });

  it("preserves the captain pool cap while allowing full-roster derivation", () => {
    const expanded = structuredClone(source);
    expanded.roster = [
      { id: "top", displayName: "Alpha Top", role: "top" },
      { id: "jungle", displayName: "Alpha Jungle", role: "jungle" },
      { id: "mid", displayName: "Alpha Mid", role: "mid" },
      { id: "sub", displayName: "Alpha Sub", role: "mid" },
      { id: "adc", displayName: "Alpha ADC", role: "adc" },
      { id: "support", displayName: "Alpha Support", role: "support" },
    ];
    expanded.drafts = [{
      ...expanded.drafts[0],
      actions: [{
        stepIndex: 10, side: "blue", kind: "pick", slot: 3,
        champion: "Nautilus", playerName: "Alpha Support",
      }],
    }];

    expect(deriveScoutData(expanded, "all").playerPools).toHaveLength(5);
    expect(deriveScoutData(expanded, "all", { playerLimit: null }).playerPools.at(-1)).toMatchObject({
      playerName: "Alpha Support",
      champions: [{ champion: "Nautilus", count: 1 }],
    });
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
    const all = deriveScoutData(scoped, "all").playerPools[0];
    expect(all.totalPicks).toBe(6);
    expect(all.champions.map((row) => row.champion)).not.toContain("ShouldNotCount");
  });

  it("preserves pool aggregates when the visible champion list is capped at five", () => {
    const capped = structuredClone(source);
    capped.roster = [{ id: "n", displayName: "Northstar", role: "mid" }];
    capped.drafts = Array.from({ length: 6 }, (_, index) => ({ ...capped.drafts[0], id: `cap-${index}`, actions: [{ stepIndex: 6, side: "blue" as const, kind: "pick" as const, slot: 1, champion: `Champion ${index}`, playerName: "Northstar" }] }));
    const pool = deriveScoutData(capped, "all").playerPools[0];
    expect(pool.champions).toHaveLength(6);
    expect(pool.distinctChampions).toBe(6);
    expect(pool.totalPicks).toBe(6);
  });

  it("counts games rather than fixture series for sampled metrics and player pools", () => {
    const series = structuredClone(source);
    series.roster = [{ id: "n", displayName: "Northstar", role: "mid" }];
    const playerAction = (champion: string): MatchDraftAction => ({ stepIndex: 6, side: "blue", kind: "pick", slot: 1, champion, playerName: "Northstar" });
    series.drafts = [
      ...series.drafts,
      { ...series.drafts[0], id: "series-game-2", fixture_id: "2", game_number: 2, actions: [playerAction("Ahri")] },
    ];
    series.drafts = series.drafts.map((draft) => draft.fixture_id === "2" && draft.game_number === 1 ? { ...draft, actions: [playerAction("Orianna")] } : draft);
    expect(scopeTeamGames(series, "recent")).toHaveLength(6);
    const data = deriveScoutData(series, "recent");
    expect(data.gamesSampled).toBe(6);
    expect(data.blueGames).toBe(6);
    expect(data.playerPools[0]?.gamesSampled).toBe(2);
    const all = deriveScoutData(series, "all");
    expect(all.playerPools[0]?.gamesSampled).toBe(2);
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
    patterned.drafts = [game("p1", 1, "Other", "Ahri", ["Ahri", "Vi", "Ahri", "Nautilus", "Garen"]), { ...game("p2", 2, "Night Vale", "ahri"), fixture_id: "p1" }];
    const data = deriveScoutData(patterned, "all");
    expect(data.openings[0]).toMatchObject({ champion: "Ahri / Vi / Nautilus", count: 2 });
    expect(data.pairings.find((row) => row.champion === "Ahri + Vi")).toBeUndefined();
    expect(data.sideFacts).toEqual(expect.arrayContaining([{ side: "blue", games: 2, commonOpening: expect.objectContaining({ champion: "Ahri", count: 2 }) }]));
    expect(data.adaptation).toEqual({ lossesFollowed: 1, changedFirstPick: 0, repeatedChampions: 5 });
    expect(data.flexes).toEqual([{ champion: "Ahri", roles: ["Top", "Mid"] }]);
  });

  it("only reports champion pairings repeated in at least three games", () => {
    const patterned = structuredClone(source);
    const pairingActions = (first: string): MatchDraftAction[] => LCS_DRAFT_STEPS.map((step) => ({
      stepIndex: step.index, side: step.side, kind: step.kind, slot: step.slot,
      champion: step.kind === "pick"
        ? step.side === "blue" ? [first, "Vi", "Nautilus", "Syndra", "Garen"][step.slot - 1] : `red-${step.slot}`
        : `ban-${step.index}`,
    }));
    patterned.fixtures = [fixture("pair-1"), fixture("pair-2"), fixture("pair-3")];
    patterned.drafts = patterned.fixtures.map((row) => ({
      ...patterned.drafts[0], id: `draft-${row.id}`, fixture_id: row.id, actions: pairingActions("Ahri"),
    }));

    const twoGames = structuredClone(patterned);
    twoGames.fixtures = twoGames.fixtures.slice(0, 2);
    twoGames.drafts = twoGames.drafts.slice(0, 2);
    expect(deriveScoutData(twoGames, "all").pairings.find((row) => row.champion === "Ahri + Vi")).toBeUndefined();
    const data = deriveScoutData(patterned, "all");
    expect(data.pairings.find((row) => row.champion === "Ahri + Vi")).toEqual({ champion: "Ahri + Vi", count: 3 });
  });

  it("does not treat current roster roles as proof of historical participation", () => {
    const attributed = structuredClone(source);
    attributed.teamName = "Night Vale";
    attributed.roster = [{ id: "n", displayName: "Northstar", role: "mid" }];
    attributed.drafts = [{
      ...attributed.drafts[0],
      actions: actions("Ahri"),
      positions: { blue: [null, null, "Ahri", null, null] },
    }, {
      ...attributed.drafts[0],
      id: "other-side",
      actions: actions("Ahri").map((action) => action.stepIndex === 16 ? { ...action, champion: "Ahri" } : action),
      positions: { red: [null, null, "Ahri", null, null] },
    }];

    expect(deriveScoutData(attributed, "all").playerPools[0]).toMatchObject({
      playerName: "Northstar", champions: [], totalPicks: 0, riotConfirmedPicks: 0, draftOnlyPicks: 0,
    });
  });

  it("credits a covered game only to the uniquely resolved Riot participant", () => {
    const reproduced = structuredClone(source);
    reproduced.opponentName = "Academy Team";
    reproduced.teamName = "Academy Team";
    reproduced.roster = [
      { id: "top", displayName: "Academy Top", role: "top" },
      { id: "mid", displayName: "Academy Mid", role: "mid" },
    ];
    reproduced.fixtures = [{ ...fixture("f1"), team_a: "Academy Team", team_b: "Opponent" }];
    reproduced.drafts = [{
      ...reproduced.drafts[0],
      fixture_id: "f1",
      blue_team_name: "Academy Team",
      red_team_name: "Opponent",
      actions: actions("Ahri").map((action) => ({ ...action, playerName: null })),
      positions: { blue: [null, null, "Ahri", null, null] },
    }];
    reproduced.ingestedScouting = {
      games: [{
        playerId: "top", playerName: "Academy Top", role: "top", champion: "Ahri",
        fixtureId: "f1", season: "S5", matchId: "m1", gameDate: "2026-08-01", gameNumber: 1, teamSide: "blue",
      }],
      coverage: [{
        playerId: "top", summonerName: "Academy Top", tag: "NA1", champion: "Ahri",
        fixtureId: "f1", season: "S5", matchId: "m1", gameDate: "2026-08-01", gameNumber: 1, teamSide: "blue",
      }],
    };

    const pools = deriveScoutData(reproduced, "season").playerPools;
    expect(pools.find((row) => row.playerName === "Academy Top")).toMatchObject({
      champions: [{ champion: "Ahri", count: 1 }], riotConfirmedPicks: 1, draftOnlyPicks: 0,
    });
    expect(pools.find((row) => row.playerName === "Academy Mid")).toMatchObject({
      champions: [], totalPicks: 0, riotConfirmedPicks: 0, draftOnlyPicks: 0,
    });
  });

  it("lets Riot ownership override a conflicting explicit draft name", () => {
    const conflicting = structuredClone(source);
    conflicting.opponentName = "Academy Team";
    conflicting.teamName = "Academy Team";
    conflicting.roster = [
      { id: "top", displayName: "Academy Top", role: "top" },
      { id: "mid", displayName: "Academy Mid", role: "mid" },
    ];
    conflicting.fixtures = [{ ...fixture("f1"), team_a: "Academy Team", team_b: "Opponent" }];
    conflicting.drafts = [{
      ...conflicting.drafts[0], fixture_id: "f1", blue_team_name: "Academy Team", red_team_name: "Opponent",
      actions: actions("Ahri").map((action) => action.stepIndex === 6 ? { ...action, playerName: "Academy Mid" } : action),
    }];
    conflicting.ingestedScouting = {
      games: [{ playerId: "top", playerName: "Academy Top", role: "top", champion: "Ahri", fixtureId: "f1", season: "S5", matchId: "m1", gameDate: "2026-08-01", gameNumber: 1, teamSide: "blue" }],
      coverage: [{ playerId: "top", summonerName: "Academy Top", tag: "NA1", champion: "Ahri", fixtureId: "f1", season: "S5", matchId: "m1", gameDate: "2026-08-01", gameNumber: 1, teamSide: "blue" }],
    };

    const pools = deriveScoutData(conflicting, "season").playerPools;
    expect(pools.find((row) => row.playerName === "Academy Top")?.champions).toMatchObject([{ champion: "Ahri", count: 1 }]);
    expect(pools.find((row) => row.playerName === "Academy Mid")?.totalPicks).toBe(0);
  });

  it("deduplicates identical Riot rows and drops conflicting participant champions", () => {
    const duplicated = structuredClone(source);
    duplicated.opponentName = "Academy Team";
    duplicated.roster = [
      { id: "top", displayName: "Academy Top", role: "top" },
      { id: "mid", displayName: "Academy Mid", role: "mid" },
    ];
    duplicated.fixtures = [{ ...fixture("f1"), team_a: "Academy Team", team_b: "Opponent" }];
    duplicated.drafts = [{ ...duplicated.drafts[0], fixture_id: "f1", blue_team_name: "Academy Team", red_team_name: "Opponent", actions: actions("Ahri").map((action) => ({ ...action, playerName: null })) }];
    duplicated.ingestedScouting = {
      games: [
        { playerId: "top", playerName: "Academy Top", role: "top", champion: "Ahri", fixtureId: "f1", season: "S5", matchId: "m1", gameDate: "2026-08-01", gameNumber: 1, teamSide: "blue" },
        { playerId: "top", playerName: "Academy Top", role: "top", champion: "Ahri", fixtureId: "f1", season: "S5", matchId: "m1", gameDate: "2026-08-01", gameNumber: 1, teamSide: "blue" },
        { playerId: "mid", playerName: "Academy Mid", role: "mid", champion: "Orianna", fixtureId: "f1", season: "S5", matchId: "m1", gameDate: "2026-08-01", gameNumber: 1, teamSide: "blue" },
        { playerId: "mid", playerName: "Academy Mid", role: "mid", champion: "Syndra", fixtureId: "f1", season: "S5", matchId: "m1", gameDate: "2026-08-01", gameNumber: 1, teamSide: "blue" },
      ],
      coverage: [
        { playerId: "top", summonerName: "Academy Top", tag: "NA1", champion: "Ahri", fixtureId: "f1", season: "S5", matchId: "m1", gameDate: "2026-08-01", gameNumber: 1, teamSide: "blue" },
        { playerId: "top", summonerName: "Academy Top", tag: "NA1", champion: "Ahri", fixtureId: "f1", season: "S5", matchId: "m1", gameDate: "2026-08-01", gameNumber: 1, teamSide: "blue" },
        { playerId: "mid", summonerName: "Academy Mid", tag: "NA1", champion: "Orianna", fixtureId: "f1", season: "S5", matchId: "m1", gameDate: "2026-08-01", gameNumber: 1, teamSide: "blue" },
        { playerId: "mid", summonerName: "Academy Mid", tag: "NA1", champion: "Syndra", fixtureId: "f1", season: "S5", matchId: "m1", gameDate: "2026-08-01", gameNumber: 1, teamSide: "blue" },
      ],
    };

    const pools = deriveScoutData(duplicated, "season").playerPools;
    expect(pools.find((row) => row.playerName === "Academy Top")).toMatchObject({ champions: [{ champion: "Ahri", count: 1 }], totalPicks: 1 });
    expect(pools.find((row) => row.playerName === "Academy Mid")).toMatchObject({ champions: [], totalPicks: 0 });
  });

  it("rejects an opposing-side namesake before draft attribution", () => {
    const namesake = structuredClone(source);
    namesake.roster = [{ id: "same", displayName: "Same Name", role: "mid" }];
    namesake.drafts = [{
      ...namesake.drafts[0],
      actions: actions("Ahri").map((action) => action.stepIndex === 6
        ? { ...action, playerName: "Same Name" }
        : action.stepIndex === 7
          ? { ...action, champion: "Ahri", playerName: "Same Name" }
          : action),
    }];

    expect(deriveScoutData(namesake, "season").playerPools[0]).toMatchObject({
      champions: [{ champion: "Ahri", count: 1 }], totalPicks: 1, draftOnlyPicks: 1,
    });
  });

  it("uses ingested champion rows when a draft has no player names or role confirmation", () => {
    const unconfirmed = structuredClone(source) as ScoutSource & {
      ingestedGames: Array<{
        playerId: string;
        playerName: string;
        role: "mid";
        champion: string;
        fixtureId: string | null;
        season: string;
        matchId: string;
        gameDate: string;
      }>;
    };
    unconfirmed.teamName = "Night Vale";
    unconfirmed.roster = [{ id: "n", displayName: "Northstar", role: "mid" }];
    unconfirmed.drafts = [{
      ...unconfirmed.drafts[0],
      actions: actions("Ahri").map((action) => ({ ...action, playerName: null })),
      positions: null,
    }];
    unconfirmed.ingestedGames = [{
      playerId: "n",
      playerName: "Northstar",
      role: "mid",
      champion: "Orianna",
      fixtureId: null,
      season: "S5",
      matchId: "NA1_ingested_1",
      gameDate: "2026-08-01T00:00:00Z",
    }];

    expect(deriveScoutData(unconfirmed, "season").playerPools[0]).toMatchObject({
      playerName: "Northstar",
      champions: [{ champion: "Orianna", count: 1 }],
      totalPicks: 1,
      gamesSampled: 1,
    });
  });

  it("keeps all games from the recent five ingested series", () => {
    const recent = structuredClone(source) as ScoutSource & { ingestedGames: NonNullable<ScoutSource["ingestedGames"]> };
    recent.roster = [{ id: "n", displayName: "Northstar", role: "mid" }];
    recent.fixtures = Array.from({ length: 6 }, (_, fixtureIndex) => fixture(`series-${fixtureIndex}`, "S5", `2026-08-${String(fixtureIndex + 1).padStart(2, "0")}T00:00:00Z`));
    const seriesGames = Array.from({ length: 6 }, (_, fixtureIndex) => {
      const fixtureId = `series-${fixtureIndex}`;
      return [1, 2].map((gameIndex) => ({
        playerId: "n",
        playerName: "Northstar",
        role: "mid" as const,
        champion: gameIndex === 1 ? "Orianna" : "Ahri",
        fixtureId,
        season: "S5",
        matchId: `${fixtureId}-game-${gameIndex}`,
        gameDate: `2026-08-${String(fixtureIndex + 1).padStart(2, "0")}T00:00:00Z`,
      }));
    }).flat() as NonNullable<ScoutSource["ingestedGames"]>;
    recent.ingestedGames = seriesGames.concat({
      playerId: "n",
      playerName: "Northstar",
      role: "mid",
      champion: "Syndra",
      fixtureId: null,
      season: "S5",
      matchId: "unmapped-game",
      gameDate: "2026-08-08T00:00:00Z",
    });

    const pool = deriveScoutData(recent, "recent").playerPools[0];
    expect(pool).toMatchObject({ totalPicks: 11, gamesSampled: 11 });
    expect(pool.champions).toMatchObject([{ champion: "Ahri", count: 5 }, { champion: "Orianna", count: 5 }, { champion: "Syndra", count: 1 }]);
  });

  it("falls back to draft attribution only for players without ingested rows", () => {
    const partial = structuredClone(source) as ScoutSource & { ingestedGames: NonNullable<ScoutSource["ingestedGames"]> };
    partial.teamName = "Night Vale";
    partial.roster = [
      { id: "h", displayName: "Hollowpoint", role: "top" },
      { id: "n", displayName: "Northstar", role: "mid" },
    ];
    partial.drafts = [{
      ...partial.drafts[0],
      actions: [
        { stepIndex: 6, side: "blue", kind: "pick", slot: 1, playerName: "Hollowpoint", champion: "Gnar" },
        { stepIndex: 9, side: "blue", kind: "pick", slot: 2, playerName: "Northstar", champion: "Ahri" },
      ],
    }];
    partial.ingestedGames = [{
      playerId: "n",
      playerName: "Northstar",
      role: "mid",
      champion: "Orianna",
      fixtureId: null,
      season: "S5",
      matchId: "ingested-1",
      gameDate: "2026-08-01T00:00:00Z",
    }];

    const pools = deriveScoutData(partial, "all").playerPools;
    expect(pools.find((row) => row.playerName === "Northstar")).toMatchObject({
      champions: [{ champion: "Ahri", count: 1 }, { champion: "Orianna", count: 1 }],
      riotConfirmedPicks: 1,
      draftOnlyPicks: 1,
    });
    expect(pools.find((row) => row.playerName === "Hollowpoint")).toMatchObject({ champions: [{ champion: "Gnar", count: 1 }] });
  });

  it("retains the complete ranked champion pool and aggregates accepted performance", () => {
    const performanceSource = structuredClone(source) as ScoutSource;
    performanceSource.teamName = "Night Vale";
    performanceSource.roster = [{ id: "n", displayName: "Northstar", role: "mid" }];
    performanceSource.fixtures = [fixture("perf", "S5", "2026-08-20T00:00:00Z")];
    performanceSource.drafts = [{
      ...source.drafts[0], fixture_id: "perf", blue_team_name: "Night Vale", red_team_name: "Other",
      actions: [{ stepIndex: 6, side: "blue", kind: "pick", slot: 1, champion: "Ahri", playerName: null }],
    }];
    const performance = {
      kills: 2, deaths: 1, assists: 3, damageToChampions: 12000,
      durationMinutes: 20, killParticipationPct: 40,
    };
    performanceSource.ingestedScouting = {
      games: [{
        playerId: "n", playerName: "Northstar", role: "mid", champion: "Ahri", fixtureId: "perf", season: "S5",
        matchId: "m1", gameDate: "2026-08-20", gameNumber: 1, teamSide: "blue", performance,
      }],
      coverage: [{
        playerId: "n", summonerName: "Northstar", tag: "NA1", champion: "Ahri", fixtureId: "perf", season: "S5",
        matchId: "m1", gameDate: "2026-08-20", gameNumber: 1, teamSide: "blue", performance,
      }],
    };

    const pool = deriveScoutData(performanceSource, "season").playerPools[0];
    expect(pool).toMatchObject({ totalPicks: 1, gamesSampled: 1, champions: [{ champion: "Ahri", count: 1 }] });
    expect(pool.champions[0].performance).toMatchObject({ statGames: 1, kda: 5, damagePerMinute: 600, killParticipationPct: 40 });
  });

  it("supplements duplicate performance rows and makes conflicting metrics unavailable independent of row order", () => {
    const base = structuredClone(source) as ScoutSource;
    base.teamName = "Night Vale";
    base.roster = [{ id: "n", displayName: "Northstar", role: "mid" }];
    base.fixtures = [fixture("perf", "S5", "2026-08-20T00:00:00Z")];
    base.drafts = [{ ...source.drafts[0], fixture_id: "perf", blue_team_name: "Night Vale", red_team_name: "Other", actions: [{ stepIndex: 6, side: "blue", kind: "pick", slot: 1, champion: "Ahri", playerName: null }] }];
    const row = (matchId: string, kills: number | null, damage: number | null) => ({
      playerId: "n", summonerName: "Northstar", tag: "NA1", champion: "Ahri", fixtureId: "perf", season: "S5",
      matchId, gameDate: "2026-08-20", gameNumber: 1, teamSide: "blue" as const,
      performance: { kills, deaths: 1, assists: 3, damageToChampions: damage, durationMinutes: 10, killParticipationPct: 0 },
    });
    const makeSource = (rows: ReturnType<typeof row>[]) => ({
      ...base,
      ingestedScouting: {
        games: rows.map((coverage) => ({ playerId: "n", playerName: "Northstar", role: "mid" as const, champion: "Ahri", fixtureId: "perf", season: "S5", matchId: coverage.matchId, gameDate: coverage.gameDate, gameNumber: 1, teamSide: "blue" as const, performance: coverage.performance })),
        coverage: rows,
      },
    });

    const forward = deriveScoutData(makeSource([row("m1", 2, 1000), row("m1", null, 1000), row("m2", 3, 1000)]), "season").playerPools[0];
    const reversed = deriveScoutData(makeSource([row("m2", 3, 1000), row("m1", null, 1000), row("m1", 2, 1000)]), "season").playerPools[0];
    expect(forward.totalPicks).toBe(1);
    expect(reversed.totalPicks).toBe(1);
    expect(forward.champions[0].performance).toEqual(reversed.champions[0].performance);
    expect(forward.champions[0].performance).toMatchObject({ statGames: 1, kdaGames: 0, damageGames: 1, damagePerMinute: 100, kpGames: 1, kda: null });
  });

  it("keeps ten unique champions available for UI disclosure", () => {
    const complete = structuredClone(source) as ScoutSource;
    complete.teamName = "Night Vale";
    complete.roster = [{ id: "n", displayName: "Northstar", role: "mid" }];
    complete.fixtures = Array.from({ length: 10 }, (_, index) => fixture("pool-" + index, "S5", "2026-08-" + String(index + 1).padStart(2, "0") + "T00:00:00Z"));
    complete.drafts = complete.fixtures.map((fixtureRow, index) => ({
      ...source.drafts[0], id: "pool-draft-" + index, fixture_id: fixtureRow.id, blue_team_name: "Night Vale", red_team_name: "Other",
      actions: [{ stepIndex: 6, side: "blue" as const, kind: "pick" as const, slot: 1, champion: "Champion " + index, playerName: "Northstar" }],
    }));
    expect(deriveScoutData(complete, "season").playerPools[0].champions).toHaveLength(10);
  });
});
