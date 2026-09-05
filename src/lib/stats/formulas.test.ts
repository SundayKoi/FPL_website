import { describe, expect, it } from "vitest";
import {
  combineChampionRows,
  combineSeasonRows,
  combineTeamRows,
  mergeRows,
  powerRanking,
  scoutingProfile,
} from "./formulas";
import type { ChampionAggRow, PlayerAggRow, TeamAggRow } from "./types";

describe("powerRanking", () => {
  it("preserves stable tied-stat ranks within a four-player role and leaves inputs unchanged", () => {
    const rows = ["A", "B", "C", "D"].map((tag) => playerRow({
      summoner_name: "Same", tag, role_mode: "TOP", winrate_pct: 50,
      kda: 3, avg_dmg_per_min: 400, avg_cs_per_min: 5, avg_gold_per_min: 300,
      avg_kills: 4, avg_deaths: 3, avg_assists: 6, avg_vision_per_min: 1,
    }));
    rows.push(playerRow({ summoner_name: "Other", role_mode: "UTILITY", winrate_pct: 100 }));
    const original = structuredClone(rows);
    expect(powerRanking(rows).filter((row) => row.role_mode === "TOP").map(({ tag, score }) => ({ tag, score }))).toEqual([
      { tag: "D", score: 73.8 }, { tag: "C", score: 58.6 },
      { tag: "B", score: 43.4 }, { tag: "A", score: 28.2 },
    ]);
    expect(rows).toEqual(original);
  });

  it("ranks a synthetic 2-player TOP cohort by hand-computed power score", () => {
    // Synthetic: 2 TOP players, games>=5 each is not required by
    // calcPowerScore itself (only renderPower's caller applies a min-games
    // filter before calling it) so this exercises the raw formula.
    // TOP weights: {winRate:20,kda:18,damagePerMin:18,csPerMin:14,killsPerGame:10,deathsPerGame:12,goldPerMin:8}
    // maxBenchmarks: {winRate:100,kda:6,damagePerMin:800,csPerMin:9,goldPerMin:450,killsPerGame:10,deathsPerGame:8}
    // Cohort of 2 < 4, so sameRole falls back to `all` (both rows) per the ported fallback rule.
    // Player A percentile (idx=1 of 2, since sorted ascending puts the WORSE stat first for
    // non-inverted keys): pc = 1/(2-1)*100 = 100 for every key where A > B; for deathsPerGame
    // (invert=true) A's deaths=2 < B's deaths=6, so A is idx=0 ascending -> pc=0, inverted -> 100.
    // normVal(A.winRate=70,100)=70; blended = 70*0.4+100*0.6=88
    // normVal(A.kda=4,6)=66.667; blended = 66.667*0.4+100*0.6=86.667
    // normVal(A.damagePerMin=700,800)=87.5; blended=87.5*0.4+100*0.6=95
    // normVal(A.csPerMin=8,9)=88.889; blended=88.889*0.4+100*0.6=95.556
    // normVal(A.killsPerGame=6,10)=60; blended=60*0.4+100*0.6=84
    // normVal(A.deathsPerGame invert: maxGood-val=8-2=6, /8*100=75); pctile invert=100 -> blended=75*0.4+100*0.6=90
    // normVal(A.goldPerMin=420,450)=93.333; blended=93.333*0.4+100*0.6=97.333
    // score = 88*20+86.667*18+95*18+95.556*14+84*10+90*12+97.333*8, all /100
    //   = (1760+1560.006+1710+1337.784+840+1080+778.664)/100 = 9066.454/100 = 90.66454
    // totalWeight = 20+18+18+14+10+12+8 = 100 -> score/totalWeight*100 = 90.66454 -> toFixed(1) = 90.7
    const a = playerRow({
      summoner_name: "A", role_mode: "TOP", games: 10, winrate_pct: 70,
      kda: 4, avg_dmg_per_min: 700, avg_cs_per_min: 8, avg_kills: 6,
      avg_deaths: 2, avg_gold_per_min: 420,
    });
    const b = playerRow({
      summoner_name: "B", role_mode: "TOP", games: 10, winrate_pct: 30,
      kda: 1, avg_dmg_per_min: 300, avg_cs_per_min: 4, avg_kills: 2,
      avg_deaths: 6, avg_gold_per_min: 250,
    });
    const ranked = powerRanking([a, b]);
    expect(ranked[0].summoner_name).toBe("A");
    expect(ranked[0].score).toBeCloseTo(90.7, 1);
    expect(ranked[1].summoner_name).toBe("B");
  });

  it("clamps score into [0, 100] and rounds to 1 decimal like the legacy +toFixed(1)", () => {
    const row = playerRow({ role_mode: "UTILITY", winrate_pct: 100, kda: 20, avg_assists: 20, avg_vision_per_min: 10 });
    const [ranked] = powerRanking([row]);
    expect(ranked.score).toBeLessThanOrEqual(100);
    expect(ranked.score).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(ranked.score * 10)).toBe(true); // exactly 1 decimal place
  });

  it("regression: MetaShift (MIDDLE) and Aura (UTILITY), S4 Regular, games>=5 cohort", () => {
    // Real stats_player_agg rows queried from the local DB (season='S4',
    // season_phase='Regular', games>=5 — 60 rows, matching renderPower's
    // default `prMinG=5` filter). Legacy calcPowerScore hand-executed on
    // this exact cohort (see scratch computation): MetaShift -> 67.5,
    // Aura -> 68.2. Full cohort/computation reproduced in
    // task-3-report.md; only the 2 target rows + result are asserted here
    // (cohort must be the full 60 for percentiles to match).
    const cohort = s4RegularCohort();
    const ranked = powerRanking(cohort);
    const metaShift = ranked.find((r) => r.summoner_name === "MetaShift");
    const aura = ranked.find((r) => r.summoner_name === "Aura");
    expect(metaShift?.score).toBeCloseTo(67.5, 1);
    expect(aura?.score).toBeCloseTo(68.2, 1);
  });
});

describe("scoutingProfile", () => {
  it("surfaces Core Performance / Damage / Economy / Vision values straight off the agg row", () => {
    const row = playerRow({
      summoner_name: "Scout", role_mode: "MIDDLE", games: 10, wins: 6,
      winrate_pct: 60, kda: 3.5, avg_kills: 5, avg_deaths: 3, avg_assists: 7,
      avg_dmg_per_min: 650, avg_gold_per_min: 400, avg_cs_per_min: 7.5,
      avg_vision_per_min: 1.1, avg_solo_kills: 1.4, avg_kp_pct: 62.3,
      total_plates: 12,
    });
    const profile = scoutingProfile(row);
    expect(profile.player).toBe("Scout");
    expect(profile.role).toBe("MIDDLE");
    expect(profile.games).toBe(10);
    expect(profile.wins).toBe(6);
    expect(profile.losses).toBe(4);
    expect(profile.winrate_pct).toBe(60);
    expect(profile.core.find((l) => l.label === "KDA")?.value).toBe(3.5);
    expect(profile.core.find((l) => l.label === "Kills/Game")?.value).toBe(5);
    expect(profile.damage.find((l) => l.label === "DMG/Min")?.value).toBe(650);
    expect(profile.economy.find((l) => l.label === "Gold/Min")?.value).toBe(400);
    expect(profile.vision.find((l) => l.label === "Vision/Min")?.value).toBe(1.1);
  });

  // Fix round (coordinator review): Core Performance dropped 2 fields that
  // sit inside the already-cited legacy range (2880-2888) — legacy lines
  // 2886-2887: simpleRow('Solo Kills/Game', colAvg('Solo Kills').toFixed(1))
  // and simpleRow('Kill Participation', colAvg('Kill Participation %').toFixed(1)+'%').
  // Both map straight onto PlayerAggRow's own avg_solo_kills / avg_kp_pct.
  it("Core Performance includes Solo Kills/Game and Kill Participation (legacy lines 2886-2887)", () => {
    const row = playerRow({ avg_solo_kills: 1.4, avg_kp_pct: 62.3 });
    const profile = scoutingProfile(row);
    expect(profile.core.find((l) => l.label === "Solo Kills/Game")).toEqual({ label: "Solo Kills/Game", value: 1.4, fmt: "dec1" });
    expect(profile.core.find((l) => l.label === "Kill Participation")).toEqual({ label: "Kill Participation", value: 62.3, fmt: "pct" });
  });

  // Economy: legacy line 2962, simpleRow('Turret Plates',
  // colAvg('Turret Plates Destroyed').toFixed(1)+'/g') — colAvg is a mean
  // over the player's raw rows; the view exposes only the season/phase sum
  // (total_plates), so the per-game figure is reconstructed with one
  // division: total_plates / games. 24 plates / 8 games = 3 per game.
  it("Economy includes Turret Plates as total_plates / games (legacy line 2962)", () => {
    const row = playerRow({ games: 8, total_plates: 24 });
    const profile = scoutingProfile(row);
    expect(profile.economy.find((l) => l.label === "Turret Plates")).toEqual({ label: "Turret Plates", value: 3, fmt: "dec1" });
  });

  it("Turret Plates divides exactly by games for a non-whole result", () => {
    const row = playerRow({ games: 3, total_plates: 5 });
    const profile = scoutingProfile(row);
    expect(profile.economy.find((l) => l.label === "Turret Plates")?.value).toBeCloseTo(5 / 3, 5);
  });
});

describe("combineSeasonRows", () => {
  it("games-weights winrate_pct and averages across two season rows", () => {
    // S1: 10 games, 5 wins (50%); S2: 20 games, 15 wins (75%).
    // Weighted winrate = (5+15)/(10+20)*100 = 66.666... -> matches
    // round(100*wins/games,1) shape used by the view itself: 66.7.
    const s1 = playerRow({ season: "S1", games: 10, wins: 5, winrate_pct: 50, avg_kills: 4, avg_deaths: 2, avg_assists: 6 });
    const s2 = playerRow({ season: "S2", games: 20, wins: 15, winrate_pct: 75, avg_kills: 6, avg_deaths: 3, avg_assists: 9 });
    const combined = combineSeasonRows([s1, s2]);
    expect(combined.games).toBe(30);
    expect(combined.wins).toBe(20);
    expect(combined.winrate_pct).toBeCloseTo(66.7, 1);
    // avg_kills games-weighted: (4*10 + 6*20)/30 = (40+120)/30 = 5.333 -> 5.33
    expect(combined.avg_kills).toBeCloseTo(5.33, 2);
    // kda recomputed from summed kills/assists/deaths (matches the view's
    // own "kda from sums, not average of per-row kda" rule): total kills =
    // 4*10+6*20=160, total assists=6*10+9*20=240, total deaths=2*10+3*20=80
    // kda = (160+240)/80 = 5
    expect(combined.kda).toBeCloseTo(5, 2);
  });

  it("sums simple counting columns directly", () => {
    const s1 = playerRow({ season: "S1", games: 5, total_solo_kills: 3, total_doubles: 1, first_blood_involvements: 2 });
    const s2 = playerRow({ season: "S2", games: 5, total_solo_kills: 7, total_doubles: 2, first_blood_involvements: 1 });
    const combined = combineSeasonRows([s1, s2]);
    expect(combined.total_solo_kills).toBe(10);
    expect(combined.total_doubles).toBe(3);
    expect(combined.first_blood_involvements).toBe(3);
  });

  it("throws on an empty row list (no meaningful combined row)", () => {
    expect(() => combineSeasonRows([])).toThrow();
  });

  it("returns the row unchanged in shape for a single-season input", () => {
    const s1 = playerRow({ season: "S1", games: 8, winrate_pct: 37.5, wins: 3 });
    const combined = combineSeasonRows([s1]);
    expect(combined.games).toBe(8);
    expect(combined.wins).toBe(3);
    expect(combined.winrate_pct).toBeCloseTo(37.5, 1);
  });

  it("accepts an explicit seasonLabel for a specific-season + phase=All merge (item 1 fix)", () => {
    // A single season's Regular + Playoffs rows merged together should
    // keep the real season code, not the "All seasons" sentinel — this is
    // the merge LeaderboardTab/MvpTab/PowerRankingsTab/PlayersTab now run
    // whenever season is specific but phase="All".
    const regular = playerRow({ season: "S1", season_phase: "Regular", games: 10, wins: 4 });
    const playoffs = playerRow({ season: "S1", season_phase: "Playoffs", games: 4, wins: 3 });
    const combined = combineSeasonRows([regular, playoffs], "S1");
    expect(combined.season).toBe("S1");
    expect(combined.games).toBe(14);
    expect(combined.wins).toBe(7);
  });

  it("defaults seasonLabel to 'All' when omitted (unchanged pre-fix behavior)", () => {
    const s1 = playerRow({ season: "S1", games: 10, wins: 5 });
    const s2 = playerRow({ season: "S2", games: 10, wins: 5 });
    const combined = combineSeasonRows([s1, s2]);
    expect(combined.season).toBe("All");
  });
});

describe("mergeRows", () => {
  it("groups by keyFn and combines each group, preserving first-seen key order", () => {
    const rows = [
      { id: "a", v: 1 },
      { id: "b", v: 10 },
      { id: "a", v: 2 },
      { id: "b", v: 20 },
    ];
    const merged = mergeRows(
      rows,
      (r) => r.id,
      (group) => ({ id: group[0].id, v: group.reduce((s, r) => s + r.v, 0) }),
    );
    expect(merged).toEqual([
      { id: "a", v: 3 },
      { id: "b", v: 30 },
    ]);
  });

  it("returns one combined row per distinct key for a single-row group (combiner still runs)", () => {
    const rows = [{ id: "solo", v: 5 }];
    const merged = mergeRows(rows, (r) => r.id, (group) => group[0]);
    expect(merged).toEqual([{ id: "solo", v: 5 }]);
  });

  it("returns an empty array for an empty input", () => {
    const merged = mergeRows<{ id: string }>([], (r) => r.id, (group) => group[0]);
    expect(merged).toEqual([]);
  });

  it("real-shape regression: merges a specific-season+phase-All PlayerAggRow fetch to one row per player", () => {
    // Reproduces item 1's exact bug scenario: stats_player_agg fetched for
    // season='S1' with no phase filter returns 2 rows per player (Regular
    // + Playoffs) — mergeRows + combineSeasonRows must collapse that back
    // to 1 row per player with games summed.
    const rows = [
      playerRow({ summoner_name: "Solo", tag: "NA1", season: "S1", season_phase: "Regular", games: 10, wins: 6 }),
      playerRow({ summoner_name: "Solo", tag: "NA1", season: "S1", season_phase: "Playoffs", games: 3, wins: 1 }),
      playerRow({ summoner_name: "Duo", tag: "NA1", season: "S1", season_phase: "Regular", games: 8, wins: 4 }),
    ];
    const key = (r: PlayerAggRow) => `${r.summoner_name}#${r.tag}`;
    const merged = mergeRows(rows, key, (group) => combineSeasonRows(group, "S1"));
    expect(merged).toHaveLength(2);
    const solo = merged.find((r) => r.summoner_name === "Solo");
    expect(solo?.games).toBe(13);
    expect(solo?.wins).toBe(7);
  });
});

describe("combineTeamRows", () => {
  function teamRow(overrides: Partial<TeamAggRow> = {}): TeamAggRow {
    return {
      team_name: "Team",
      season: "S1",
      season_phase: "Regular",
      games: 10,
      wins: 5,
      losses: 5,
      winrate_pct: 50,
      avg_duration_min: 30,
      dragon_rate: 60,
      baron_rate: 40,
      first_blood_rate: 50,
      first_tower_rate: 45,
      avg_team_kills: 20,
      ...overrides,
    };
  }

  it("sums counting columns and games-weights rate columns across two rows", () => {
    const regular = teamRow({ season_phase: "Regular", games: 10, wins: 6, losses: 4, avg_team_kills: 20 });
    const playoffs = teamRow({ season_phase: "Playoffs", games: 4, wins: 3, losses: 1, avg_team_kills: 25 });
    const combined = combineTeamRows([regular, playoffs]);
    expect(combined.games).toBe(14);
    expect(combined.wins).toBe(9);
    expect(combined.losses).toBe(5);
    // avg_team_kills games-weighted: (20*10 + 25*4)/14 = (200+100)/14 = 21.43
    expect(combined.avg_team_kills).toBeCloseTo(21.43, 2);
  });

  it("keeps the real season code when seasonLabel is passed explicitly", () => {
    const regular = teamRow({ season: "S1", season_phase: "Regular" });
    const playoffs = teamRow({ season: "S1", season_phase: "Playoffs" });
    const combined = combineTeamRows([regular, playoffs], "S1");
    expect(combined.season).toBe("S1");
  });

  it("defaults to the ALL_SEASONS sentinel when seasonLabel is passed for true all-seasons merges", () => {
    const s1 = teamRow({ season: "S1" });
    const s2 = teamRow({ season: "S2" });
    const combined = combineTeamRows([s1, s2], "All");
    expect(combined.season).toBe("All");
  });

  it("throws on an empty row list", () => {
    expect(() => combineTeamRows([])).toThrow();
  });
});

describe("combineChampionRows", () => {
  function championRow(overrides: Partial<ChampionAggRow> = {}): ChampionAggRow {
    return {
      champion: "Ahri",
      season: "S1",
      season_phase: "Regular",
      picks: 10,
      wins: 6,
      winrate_pct: 60,
      avg_kda: 3,
      bans: 5,
      games_in_scope: 20,
      presence_pct: 75,
      ...overrides,
    };
  }

  it("sums wins directly from each row's wins field (item 4 fix, not reconstructed from rounded winrate_pct)", () => {
    // Rounded winrate_pct alone can't recover the exact win count: e.g.
    // 7 wins / 11 picks = 63.636...% which rounds to 63.6 — reconstructing
    // via round((63.6/100)*11) = round(6.996) = 7 happens to work here, but
    // stacking that rounding error across multiple combined rows drifts.
    // This fixture uses win/pick pairs whose OLD reconstruction diverges
    // from the true summed win count: row A 5 wins/9 picks (55.6% rounds
    // from 55.555..., reconstruct: round(0.556*9)=round(5.004)=5 - ok) but
    // row B 2 wins/3 picks (66.7% rounds from 66.666..., reconstruct:
    // round(0.667*3)=round(2.001)=2 - ok individually). The real
    // regression is at the COMBINED level: old code summed the
    // per-row RECONSTRUCTED wins (still correct per-row here), but the
    // fix changes the mechanism entirely to read `wins` directly -- assert
    // the summed total matches summing the real `wins` fields, not a
    // winrate-derived approximation.
    const a = championRow({ picks: 9, wins: 5, winrate_pct: 55.6 });
    const b = championRow({ picks: 3, wins: 2, winrate_pct: 66.7 });
    const combined = combineChampionRows([a, b]);
    expect(combined.wins).toBe(7);
    expect(combined.picks).toBe(12);
  });

  it("sums picks/bans/games_in_scope and recomputes winrate_pct/presence_pct from the summed totals", () => {
    const regular = championRow({ season_phase: "Regular", picks: 10, wins: 6, bans: 5, games_in_scope: 20 });
    const playoffs = championRow({ season_phase: "Playoffs", picks: 4, wins: 1, bans: 2, games_in_scope: 8 });
    const combined = combineChampionRows([regular, playoffs]);
    expect(combined.picks).toBe(14);
    expect(combined.bans).toBe(7);
    expect(combined.games_in_scope).toBe(28);
    // winrate_pct = 100*7/14 = 50.0
    expect(combined.winrate_pct).toBeCloseTo(50, 1);
    // presence_pct = 100*(14+7)/28 = 75.0
    expect(combined.presence_pct).toBeCloseTo(75, 1);
  });

  it("weights avg_kda by picks across rows", () => {
    const a = championRow({ picks: 10, avg_kda: 3 });
    const b = championRow({ picks: 5, avg_kda: 6 });
    const combined = combineChampionRows([a, b]);
    // (3*10 + 6*5)/15 = 60/15 = 4
    expect(combined.avg_kda).toBeCloseTo(4, 2);
  });

  it("keeps the real season code when seasonLabel is passed explicitly", () => {
    const regular = championRow({ season: "S1", season_phase: "Regular" });
    const playoffs = championRow({ season: "S1", season_phase: "Playoffs" });
    const combined = combineChampionRows([regular, playoffs], "S1");
    expect(combined.season).toBe("S1");
  });

  it("throws on an empty row list", () => {
    expect(() => combineChampionRows([])).toThrow();
  });
});

describe("pctile tag disambiguation (item 3)", () => {
  it("powerRanking ranks two same-named different-tag players correctly using their own row, not each other's", () => {
    // Two real distinct players sharing a summoner_name (e.g. Aura#5950 vs
    // Aura#RGB0) in the same cohort. Before the fix, pctile's
    // `findIndex(x => x.summoner_name === row.summoner_name)` would always
    // resolve to whichever same-named row sorts first, so both players
    // would get the SAME percentile for every key regardless of their own
    // actual stats. With the fix (`${summoner_name}#${tag}` match), each
    // player's percentile reflects their own row.
    const strong = playerRow({
      summoner_name: "Aura", tag: "5950", role_mode: "TOP", games: 10,
      winrate_pct: 80, kda: 5, avg_dmg_per_min: 750, avg_cs_per_min: 8.5,
      avg_kills: 8, avg_deaths: 2, avg_gold_per_min: 430,
    });
    const weak = playerRow({
      summoner_name: "Aura", tag: "RGB0", role_mode: "TOP", games: 10,
      winrate_pct: 20, kda: 1, avg_dmg_per_min: 300, avg_cs_per_min: 4,
      avg_kills: 2, avg_deaths: 7, avg_gold_per_min: 260,
    });
    const ranked = powerRanking([strong, weak]);
    const strongEntry = ranked.find((r) => r.tag === "5950")!;
    const weakEntry = ranked.find((r) => r.tag === "RGB0")!;
    expect(strongEntry.score).toBeGreaterThan(weakEntry.score);
    // Before the fix both would tie at whichever row findIndex hit first
    // for BOTH players' lookups (same summoner_name) — assert they differ.
    expect(strongEntry.score).not.toBe(weakEntry.score);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────

function playerRow(overrides: Partial<PlayerAggRow> = {}): PlayerAggRow {
  return {
    summoner_name: "Player",
    tag: "NA1",
    season: "S4",
    season_phase: "Regular",
    role_mode: "MIDDLE",
    games: 10,
    wins: 5,
    winrate_pct: 50,
    avg_kills: 4,
    avg_deaths: 4,
    avg_assists: 6,
    kda: 2.5,
    avg_kp_pct: 55,
    avg_cs_per_min: 6,
    avg_gold_per_min: 350,
    avg_dmg_per_min: 500,
    avg_dmg_share_pct: 20,
    avg_vision_per_min: 1,
    avg_solo_kills: 1,
    total_solo_kills: 10,
    total_plates: 5,
    total_doubles: 1,
    total_triples: 0,
    total_quadras: 0,
    total_pentas: 0,
    avg_cs_at_10: 70,
    avg_gold_at_10: 3200,
    avg_xp_at_10: 4000,
    avg_dmg_taken_per_min: 400,
    avg_kda_challenges: 2.5,
    first_blood_involvements: 1,
    avg_game_duration: 30,
    ...overrides,
  };
}

/**
 * Real stats_player_agg rows for season='S4', season_phase='Regular',
 * games>=5 — queried from the local DB
 * (`docker exec supabase_db_FPL_website_new psql -U postgres -d postgres
 * -c "select ... from stats_player_agg where season='S4' and
 * season_phase='Regular' and games>=5"`). This is the exact cohort
 * `renderPower()`/`renderMVP()` would use (both default to a 5-game
 * minimum). Full derivation documented in task-3-report.md.
 */
function s4RegularCohort(): PlayerAggRow[] {
  const rows: Array<[string, string, number, number, number, number, number, number, number, number, number, number]> = [
    // name, role, games, winrate_pct, kda, avg_dmg_per_min, avg_cs_per_min, avg_gold_per_min, avg_kills, avg_deaths, avg_assists, avg_vision_per_min
    ["7gen", "BOTTOM", 9, 55.6, 2.84, 955.67, 7.84, 463.56, 7.00, 4.78, 6.56, 0.56],
    ["Balmer", "BOTTOM", 11, 36.4, 2.49, 892.91, 8.33, 475.27, 6.00, 4.45, 5.09, 0.91],
    ["BigRed2000", "BOTTOM", 10, 60.0, 3.21, 907.30, 8.01, 465.10, 7.20, 4.20, 6.30, 0.82],
    ["Crabadabadoo", "BOTTOM", 9, 44.4, 2.82, 1133.78, 7.83, 483.00, 9.00, 5.56, 6.67, 0.87],
    ["Dariss", "BOTTOM", 10, 30.0, 2.84, 1006.40, 8.48, 483.10, 6.90, 4.50, 5.90, 0.74],
    ["Flyinq squirtle", "BOTTOM", 10, 70.0, 3.33, 1128.20, 8.50, 554.00, 9.80, 5.20, 7.50, 0.85],
    ["Humble", "BOTTOM", 10, 20.0, 1.78, 619.10, 8.08, 430.10, 2.90, 4.50, 5.10, 0.76],
    ["juanitosol", "BOTTOM", 11, 36.4, 2.51, 761.55, 7.65, 437.73, 6.27, 5.00, 6.27, 0.91],
    ["Kyujin", "BOTTOM", 11, 72.7, 1.98, 824.00, 8.25, 488.73, 5.91, 6.00, 6.00, 0.50],
    ["lolcavan", "BOTTOM", 10, 80.0, 4.43, 774.70, 8.20, 466.00, 5.60, 3.00, 7.70, 0.76],
    ["luci", "BOTTOM", 10, 40.0, 3.43, 917.00, 8.50, 474.40, 7.10, 4.20, 7.30, 0.48],
    ["Zygg", "BOTTOM", 10, 50.0, 2.51, 639.10, 8.51, 444.50, 4.20, 3.90, 5.60, 0.61],
    ["Angrodis", "JUNGLE", 10, 70.0, 3.22, 919.00, 7.39, 483.40, 9.50, 5.80, 9.20, 0.84],
    ["Beg", "JUNGLE", 11, 72.7, 2.92, 484.91, 6.58, 391.73, 3.55, 4.45, 9.45, 1.33],
    ["Conguitos0", "JUNGLE", 11, 36.4, 5.16, 632.82, 6.14, 402.27, 5.82, 2.91, 9.18, 0.80],
    ["I fear nobody", "JUNGLE", 10, 30.0, 2.35, 649.30, 6.23, 398.60, 5.20, 5.40, 7.50, 1.49],
    ["Lizzo Mukkbang", "JUNGLE", 10, 80.0, 3.31, 521.30, 6.61, 399.40, 4.10, 3.90, 8.80, 1.30],
    ["Pinei nessa poha", "JUNGLE", 10, 20.0, 2.90, 473.70, 7.70, 422.00, 5.00, 3.00, 3.70, 0.84],
    ["Sir Joey", "JUNGLE", 12, 50.0, 2.48, 611.67, 6.44, 398.50, 5.50, 5.50, 8.17, 0.69],
    ["Spies", "JUNGLE", 10, 60.0, 6.91, 711.50, 7.48, 436.20, 6.50, 2.20, 8.70, 1.12],
    ["Tauty2k", "JUNGLE", 11, 36.4, 2.02, 438.73, 6.28, 360.36, 2.64, 4.64, 6.73, 0.68],
    ["The Fool", "JUNGLE", 9, 55.6, 3.66, 628.89, 7.08, 424.22, 5.00, 3.56, 8.00, 0.97],
    ["YWGI", "JUNGLE", 10, 50.0, 2.98, 603.60, 6.70, 418.70, 4.90, 4.30, 7.90, 0.92],
    ["Zhaphh", "JUNGLE", 10, 40.0, 3.83, 715.80, 6.72, 430.10, 8.20, 4.20, 7.90, 1.19],
    ["Canadia", "MIDDLE", 10, 30.0, 1.73, 543.60, 6.22, 336.00, 2.90, 6.30, 8.00, 0.89],
    ["Feral Eevee", "MIDDLE", 9, 55.6, 4.80, 889.44, 6.96, 389.56, 6.00, 2.78, 7.33, 0.78],
    ["Fox", "MIDDLE", 11, 36.4, 1.76, 530.64, 7.04, 354.91, 2.64, 4.91, 6.00, 1.03],
    ["JellyBeanGeoff", "MIDDLE", 10, 50.0, 3.49, 704.90, 7.59, 390.10, 4.40, 3.50, 7.80, 1.03],
    ["MetaShift", "MIDDLE", 12, 50.0, 3.24, 975.25, 7.75, 418.42, 6.25, 4.25, 7.50, 0.90],
    ["QBall", "MIDDLE", 11, 36.4, 2.78, 785.00, 7.61, 382.09, 3.27, 3.27, 5.82, 1.02],
    ["Quetips", "MIDDLE", 10, 70.0, 3.09, 696.50, 7.12, 385.90, 4.60, 4.30, 8.70, 1.20],
    ["Rutledge", "MIDDLE", 7, 85.7, 4.23, 1096.43, 8.00, 439.43, 7.00, 3.71, 8.71, 0.79],
    ["SlimPimpin77", "MIDDLE", 10, 60.0, 5.03, 887.90, 8.00, 406.00, 4.50, 2.90, 10.10, 0.76],
    ["Solomon", "MIDDLE", 10, 40.0, 3.56, 645.00, 6.48, 344.00, 4.30, 3.40, 7.80, 0.76],
    ["YRW", "MIDDLE", 11, 72.7, 4.05, 974.91, 7.39, 426.36, 7.45, 3.64, 7.27, 1.14],
    ["zeldaguy0", "MIDDLE", 10, 20.0, 1.39, 805.00, 7.42, 390.00, 4.20, 5.70, 3.70, 0.77],
    ["Bleedinwolves", "TOP", 11, 36.4, 2.50, 1002.64, 8.24, 442.73, 5.64, 4.73, 6.18, 0.85],
    ["BlindHookers", "TOP", 10, 40.0, 2.23, 637.50, 6.49, 359.80, 3.70, 4.30, 5.90, 1.02],
    ["Canny", "TOP", 10, 80.0, 3.73, 778.90, 8.02, 438.20, 5.10, 3.00, 6.10, 0.84],
    ["Cheongseolmo", "TOP", 10, 70.0, 2.53, 664.60, 6.80, 379.90, 3.80, 4.70, 8.10, 0.89],
    ["ConcreteMuncher", "TOP", 8, 25.0, 1.50, 546.38, 6.73, 328.63, 1.38, 4.00, 4.63, 0.87],
    ["KingOfSpades", "TOP", 9, 55.6, 2.09, 649.22, 7.59, 376.67, 2.11, 3.89, 6.00, 0.94],
    ["ReginaldDwight", "TOP", 11, 36.4, 2.02, 714.73, 6.85, 370.64, 4.36, 3.73, 3.18, 0.81],
    ["SaintofAegis", "TOP", 7, 28.6, 1.79, 892.86, 7.36, 425.86, 6.86, 7.43, 6.43, 0.93],
    ["Sycoghost", "TOP", 11, 72.7, 2.83, 825.82, 7.88, 456.64, 6.73, 4.18, 5.09, 1.02],
    ["The World", "TOP", 11, 54.5, 1.24, 832.45, 6.55, 350.00, 3.45, 7.91, 6.36, 0.80],
    ["UnluckyCanadian", "TOP", 10, 60.0, 3.77, 552.50, 7.25, 349.50, 1.80, 2.60, 8.00, 1.03],
    ["Winter", "TOP", 10, 50.0, 2.68, 737.50, 7.33, 384.60, 4.60, 3.70, 5.30, 0.88],
    ["08 Mitsu Eclipse", "UTILITY", 10, 40.0, 4.43, 331.60, 0.67, 271.00, 1.90, 3.70, 14.50, 2.93],
    ["AfkBoulder", "UTILITY", 11, 36.4, 2.88, 313.91, 1.10, 277.00, 1.18, 5.09, 13.45, 2.61],
    ["Aura", "UTILITY", 12, 50.0, 3.84, 318.33, 1.04, 280.67, 1.08, 4.17, 14.92, 2.97],
    ["cocoa", "UTILITY", 10, 20.0, 2.36, 215.50, 1.19, 257.60, 0.90, 3.60, 7.60, 2.70],
    ["Ethereal Ice", "UTILITY", 9, 44.4, 2.60, 306.22, 0.71, 270.44, 1.00, 4.44, 10.56, 2.67],
    ["FriskyMMO", "UTILITY", 10, 50.0, 2.54, 261.50, 1.08, 261.50, 1.10, 4.80, 11.10, 2.63],
    ["I am ATOMIC", "UTILITY", 9, 55.6, 2.22, 230.44, 0.86, 261.56, 0.56, 5.44, 11.56, 2.89],
    ["Rexcat4", "UTILITY", 10, 80.0, 2.96, 310.00, 1.07, 276.20, 1.40, 4.80, 12.80, 3.06],
    ["Sunset Diner", "UTILITY", 10, 70.0, 4.32, 259.50, 1.06, 302.10, 1.10, 4.40, 17.90, 3.17],
    ["The Grim Queefer", "UTILITY", 10, 60.0, 7.00, 267.50, 1.07, 279.30, 1.10, 2.30, 15.00, 2.89],
    ["TMinusBOOM", "UTILITY", 9, 66.7, 1.90, 331.89, 1.13, 282.89, 1.56, 6.56, 10.89, 2.48],
    ["Yoshi", "UTILITY", 10, 30.0, 2.74, 395.70, 0.93, 275.10, 1.30, 5.40, 13.50, 2.03],
  ];
  return rows.map(([summoner_name, role_mode, games, winrate_pct, kda, avg_dmg_per_min, avg_cs_per_min, avg_gold_per_min, avg_kills, avg_deaths, avg_assists, avg_vision_per_min]) =>
    playerRow({
      summoner_name: summoner_name as string,
      role_mode: role_mode as string,
      games: games as number,
      wins: Math.round(((winrate_pct as number) / 100) * (games as number)),
      winrate_pct: winrate_pct as number,
      kda: kda as number,
      avg_dmg_per_min: avg_dmg_per_min as number,
      avg_cs_per_min: avg_cs_per_min as number,
      avg_gold_per_min: avg_gold_per_min as number,
      avg_kills: avg_kills as number,
      avg_deaths: avg_deaths as number,
      avg_assists: avg_assists as number,
      avg_vision_per_min: avg_vision_per_min as number,
    })
  );
}
