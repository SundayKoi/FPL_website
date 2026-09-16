import { describe, expect, it } from "vitest";
import { championCategories, deriveSeasonEnd, type SeasonRow } from "./derive";
import type { FixtureRow } from "@/lib/schedule/types";

const roles = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];
export function game(n: number, aWins = true): SeasonRow[] {
  return ["Blue", "Red"].flatMap((side, s) => roles.map((role, i) => ({
    match_id: `match${n}`, summoner_name: `${s ? "B" : "A"}${i}`, tag: "NA1", season: "S5", season_phase: "Regular",
    team_name: s ? "Bears" : "Wolves", team_side: side, role, champion: "Ahri", game_date: new Date(Date.UTC(2026, 7, n)).toISOString(), win: s ? !aWins : aWins,
    game_duration_min: 30, kills: s ? 2 : 6, deaths: s ? 6 : 2, assists: 10, solo_kills: 1,
    largest_multi_kill: 3, kda: 3, damage_per_min: 500, cs_per_min: 6, vision_score_per_min: 1, kill_participation_pct: 60,
    team_dragons: s ? 1 : 3, team_barons: s ? 0 : 2, team_towers: s ? 2 : 9,
    gold_at_15: s ? 4000 : 5000, gold_at_10: s ? 2500 : 3000, cs_at_15: s ? 80 : 100,
    damage_share_pct: 20, gold_share_pct: 20, total_damage_to_champions: 15000, gold_earned: 10000,
    cs: 180, detector_wards_placed: 2, control_wards_bought: 10,
    spell1_casts_q: 100, spell2_casts_w: 100, spell3_casts_e: 80, spell4_casts_r: 20,
    healing_on_teammates: 50, shielding_on_teammates: 100,
  })));
}
const fixtures = (overrides: Partial<FixtureRow> = {}): FixtureRow[] => [{ id: "f1", season: "S5", stage: "week_1", team_a: "Wolves", team_b: "Bears", score_a: 2, score_b: 0, best_of: 3, division: null, scheduled_at: null, sort_order: 0, created_at: "", ...overrides }];
const season = () => Array.from({ length: 6 }, (_, i) => game(i+1)).flat();
const award = (rows: SeasonRow[], id: string, fs = fixtures()) => deriveSeasonEnd(rows, fs, "S5", "premier").awards.find(a => a.id === id)!;

describe("season-end winners", () => {
  it("isolates league, season and regular season, and rejects a mismatched request", () => {
    const data = [...season(), ...game(7).map(r => ({...r, season: "A1", kills: 999})), ...game(8).map(r => ({...r, season_phase: "Playoffs", kills: 999}))];
    expect(award(data, "body-count").winners[0].total).toBe(36);
    expect(() => deriveSeasonEnd(data, [], "A1", "premier")).toThrow(/belong/);
    expect(deriveSeasonEnd(data, [], "A1", "academy").games).toBe(1);
  });
  it("counts team objectives once per game and measures towers lost from the opponent", () => {
    expect(award(season(), "dragon-hoard").winners).toMatchObject([{ name: "Wolves", value: 18 }]);
    expect(award(season(), "baron-society").winners[0].value).toBe(12);
    expect(award(season(), "fortress").winners).toMatchObject([{ name: "Wolves", value: 2 }]);
    expect(award(season(), "jungle-mid-connection").winners).toMatchObject([{ name: "A1#NA1 + A2#NA1", value: 6 }]);
  });
  it("keeps ties and prints season totals/per-game figures for rate winners", () => {
    const result = award(season(), "relentless");
    expect(result.winners).toHaveLength(10);
    expect(result.winners[0]).toMatchObject({ value: 500, total: 90000, perGame: 15000, games: 6 });
    const rows = season(); rows[0].game_duration_min = 60;
    expect(award(rows, "relentless").winners.map(w => w.name)).not.toContain("A0#NA1");
  });
  it("does not count a missing challenge or control wards bought as observations", () => {
    const rows = season(); rows[0].detector_wards_placed = null;
    expect(award(rows, "control-freak").status).toBe("unavailable");
    expect(award(rows, "the-collector").status).toBe("unavailable");
    expect(award(rows, "body-count").status).toBe("ready");
  });
  it("rejects incomplete matches and duplicate ingestion instead of crowning partial leaders", () => {
    const rows = season(); rows.pop();
    expect(award(rows, "body-count").status).toBe("unavailable");
    const duplicate = [...season(), { ...game(1)[0] }];
    expect(award(duplicate, "body-count").status).toBe("unavailable");
  });
  it("withholds ambiguous team awards without discarding valid individual stats", () => {
    const rows = season(); rows[0].team_name = "Bears";
    expect(award(rows, "dragon-hoard").status).toBe("unavailable");
    expect(award(rows, "giant-slayer").status).toBe("unavailable");
    expect(award(rows, "body-count").winners[0].total).toBe(36);
    expect(award(rows, "clean-sweep").winners[0].value).toBe(1);
  });
  it("uses unique opposing roles and excludes short games from lane checkpoints", () => {
    expect(award(season(), "lane-landlord").winners[0].value).toBe(1000);
    expect(award(season(), "farm-gap").winners[0].value).toBe(20);
    const ambiguous = season(); ambiguous[6].role = "TOP";
    expect(award(ambiguous, "lane-landlord").status).toBe("unavailable");
    const short = season(); short.filter(r => r.match_id === "match1").forEach(r => { r.game_duration_min = 12; r.gold_at_15 = null; });
    expect(award(short, "lane-landlord").winners[0]).toMatchObject({ games: 5, value: 1000 });
  });
  it("uses strictly positive/negative lane leads and double-digit assist games", () => {
    expect(award(season(), "fast-starter").winners[0].value).toBe(6);
    const rows = season(); rows.filter(r => r.team_side === "Blue").forEach(r => { r.gold_at_15 = 3000; });
    expect(award(rows, "comeback-artist").winners[0].value).toBe(6);
    expect(award(rows, "human-highlight-reel").winners[0].value).toBe(6);
    expect(award(rows, "everybody-eats").winners[0].value).toBe(6);
  });
  it("sorts streaks chronologically and breaks them on a failing game", () => {
    const rows = [game(6), game(3, false), game(1), game(5), game(2), game(4)].flat();
    expect(award(rows, "hot-streak").winners[0]).toMatchObject({ value: 3 });
    rows.forEach(r => { r.deaths = r.match_id === "match3" ? 1 : 0; r.solo_kills = r.match_id === "match3" ? 0 : 1; });
    expect(award(rows, "unkillable-run").winners[0].value).toBe(3);
    expect(award(rows, "bloodline").winners[0].value).toBe(3);
    rows[0].game_date = "unknown";
    expect(award(rows, "hot-streak").status).toBe("unavailable");
  });
  it("requires three speedrun wins and strictly over forty minutes for marathon wins", () => {
    const rows = season(); rows.forEach(r => { r.game_duration_min = r.match_id === "match1" ? 40 : 41; });
    expect(award(rows, "marathon-winners").winners[0].value).toBe(5);
    expect(award(game(1), "speedrunners").status).toBe("unearned");
  });
  it("only counts completed multi-game sweeps and waits for final standings", () => {
    expect(award(season(), "clean-sweep").winners[0].value).toBe(1);
    expect(award(season(), "clean-sweep", fixtures({ score_a: 1 })).status).toBe("unearned");
    expect(award(season(), "clean-sweep", fixtures({ best_of: 1, score_a: 1 })).status).toBe("unearned");
    expect(award(season(), "the-starting-five").winners[0].detail).toContain("A4#NA1");
    expect(award(season(), "the-starting-five", fixtures({score_a: null, score_b: null})).status).toBe("unavailable");
    expect(award(season(), "giant-slayer", fixtures({score_a: 1})).status).toBe("unavailable");
  });
  it("commemorates the most-played actual five, including tied lineups", () => {
    const rows = season(); rows.filter(r => r.summoner_name === "A0" && ["match4","match5","match6"].includes(r.match_id)).forEach(r => { r.summoner_name = "Sub"; });
    expect(award(rows, "the-starting-five").winners).toHaveLength(2);
  });
  it("counts player upsets by their team at the time and distinct revenge opponents", () => {
    const rows = [game(1, false), game(2), game(3)].flat();
    const upset = award(rows, "giant-slayer", fixtures({ score_a: 0, score_b: 2 }));
    expect(upset.winners[0]).toMatchObject({ name: "A0#NA1", value: 2 });
    expect(award(rows, "revenge-tour").winners[0]).toMatchObject({ name: "A0#NA1", value: 1 });
  });
  it("has explicit no-achievement and minimum-games results", () => {
    const rows = season(); rows.forEach(r => { r.penta_kills = 0; });
    expect(award(rows, "penthouse").status).toBe("unearned");
    expect(award(game(1), "untouchable").status).toBe("unearned");
    expect(award([], "body-count").status).toBe("unavailable");
    expect(award(rows, "metronome").status).toBe("unearned"); // everyone scores 50, below floor
  });
  it("uses late-season performance and enforces Metronome's minimum floor", () => {
    const rows = Array.from({length:9}, (_,i) => game(i+1)).flat();
    for (const r of rows) if (r.team_side === "Blue") for (const key of ["kda", "damage_per_min", "cs_per_min", "vision_score_per_min", "kill_participation_pct"]) r[key] = Number(r[key]) * 2;
    expect(award(rows, "metronome").winners).toHaveLength(5);
    expect(award(rows, "metronome").winners[0].value).toBeCloseTo(0);
    expect(award(rows, "late-bloomer").winners[0].games).toBe(3);
  });
  it("uses verified mappings, counts all classes, and does not invent regions", () => {
    expect(championCategories("Ahri", "regions")).toEqual(["ionia"]);
    expect(championCategories("MonkeyKing", "classes")).toBeTruthy();
    expect(championCategories("Aatrox", "regions")).toEqual([]);
    expect(award(season(), "world-tour").winners[0].value).toBe(1);
    const rows = season(); rows[0].champion = "Unknown Future Champion";
    expect(award(rows, "world-tour").status).toBe("unavailable");
    expect(award(rows, "full-arsenal").status).toBe("unavailable");
  });
  it("measures rare picks within the selected league and qualifies proportions", () => {
    const rows = Array.from({length:20}, (_,i) => game(i+1)).flat(); rows[0].champion = "Garen";
    expect(award(rows, "against-the-grain").winners).toMatchObject([{ name: "A0#NA1", value: 5 }]);
  });
  it("keeps all requested cards visible, including the correctly named steal award", () => {
    const result = deriveSeasonEnd(season(), fixtures(), "S5", "premier");
    expect(result.awards).toHaveLength(68);
    expect(result.awards.find(a => a.id === "grand-theft-objective")?.description).toContain("not recorded");
  });
});
