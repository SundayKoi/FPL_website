import { describe, expect, it } from "vitest";
import type { PlayerAggRow } from "@/lib/stats/types";
import { buildSeasonCards, cardPlayerKey, seasonStyleRatings, type CardGameMeta, type CardGameRow } from "./build";
import { gradeAgainst, gradeGame, indexGames, styleStat, type StyleYardstick } from "./styleRating";

/** Quantiles spread evenly from lo to hi: grade = where the value sits. */
const spread = (lo: number, hi: number): number[] => Array.from({ length: 21 }, (_, i) => lo + ((hi - lo) * i) / 20);

const YARDSTICK: StyleYardstick = {
  league: "premier",
  history: ["S1"],
  games: 1000,
  curve: { base: 20, scale: 0.8 },
  distributions: {
    "MIDDLE|assassin": { games: 50, stats: { kills: spread(0, 0.4), solo: spread(0, 0.1), dmg: spread(300, 1100) } },
    "MIDDLE|mage": { games: 400, stats: { dmg: spread(400, 1200), share: spread(10, 40), cc: spread(0, 1) } },
    // Too few top tanks to grade against: they borrow every tank's games.
    "TOP|tank": { games: 5, stats: { cc: spread(0, 100), takenShare: spread(0, 1), mitigated: spread(0, 10000) } },
    "*|tank": { games: 300, stats: { cc: spread(0, 1), takenShare: spread(0.1, 0.5), mitigated: spread(500, 2500) } },
    "TOP|bruiser": { games: 300, stats: { dmg: spread(400, 1200), twr: spread(0, 400), mitPct: spread(0.3, 0.7), solo: spread(0, 0.1) } },
  },
  offsets: { "TOP|tank": { cs: -1 } },
};

const agg = (name: string, role: string, over: Partial<PlayerAggRow> = {}): PlayerAggRow => ({
  summoner_name: name,
  tag: "NA1",
  season: "S6",
  season_phase: "Regular",
  role_mode: role,
  games: 1,
  wins: 1,
  winrate_pct: 50,
  avg_kills: 5,
  avg_deaths: 4,
  avg_assists: 6,
  kda: 2.75,
  avg_kp_pct: 55,
  avg_cs_per_min: 7,
  avg_gold_per_min: 380,
  avg_dmg_per_min: 500,
  avg_dmg_share_pct: 25,
  avg_vision_per_min: 1,
  avg_solo_kills: 0.5,
  total_kills: 5,
  total_deaths: 4,
  total_assists: 6,
  total_solo_kills: 0,
  total_plates: 0,
  total_doubles: 0,
  total_triples: 0,
  total_quadras: 0,
  total_pentas: 0,
  avg_cs_at_10: 70,
  avg_gold_at_10: 3200,
  avg_xp_at_10: 4500,
  avg_dmg_taken_per_min: 600,
  avg_kda_challenges: 2.5,
  first_blood_involvements: 0,
  avg_game_duration: 30,
  ...over,
});

const game = (name: string, over: Partial<CardGameRow>): CardGameRow => ({
  summoner_name: name,
  tag: "NA1",
  champion: "Orianna",
  win: true,
  game_date: "2026-10-05T00:30:00Z",
  match_id: `M_${name}`,
  team_name: `Team ${name}`,
  kills: 5,
  deaths: 4,
  assists: 6,
  cs: 210,
  total_damage_to_champions: 24000,
  ...over,
});

/** A window: every player's agg row and games, 30-minute games throughout. */
function windowOf(players: { row: PlayerAggRow; games: CardGameRow[] }[]) {
  const gamesByPlayer = new Map(players.map((p) => [cardPlayerKey(p.row.summoner_name, p.row.tag), p.games]));
  const gameLog = new Map<string, CardGameMeta>();
  for (const p of players) for (const g of p.games) gameLog.set(g.match_id, { durationMin: 30, blueTeam: null, redTeam: null });
  return { cohort: players.map((p) => p.row), gamesByPlayer, gameLog };
}

/** Four mids: an assassin who did the assassin's job, a mage who did the
 *  mage's, and two ordinary mages. Everything else about them is equal. */
function midWindow() {
  const averageMage = { champion: "Orianna", role: "MIDDLE", total_damage_to_champions: 24000, damage_share_pct: 25, time_ccing_others_s: 15 };
  return windowOf([
    { row: agg("Stabby", "MIDDLE"), games: [game("Stabby", { champion: "Zed", role: "MIDDLE", kills: 12, solo_kills: 3, total_damage_to_champions: 18000, damage_share_pct: 22 })] },
    { row: agg("Blasty", "MIDDLE"), games: [game("Blasty", { champion: "Orianna", role: "MIDDLE", total_damage_to_champions: 36000, damage_share_pct: 40, time_ccing_others_s: 30 })] },
    { row: agg("MidA", "MIDDLE"), games: [game("MidA", averageMage)] },
    { row: agg("MidB", "MIDDLE"), games: [game("MidB", averageMage)] },
  ]);
}

describe("gradeAgainst", () => {
  it("reads where a value sits in the history, linear between quantiles", () => {
    const quantiles = spread(0, 100);
    expect(gradeAgainst(quantiles, 50)).toBe(50);
    expect(gradeAgainst(quantiles, 52.5)).toBeCloseTo(52.5);
    expect(gradeAgainst(quantiles, -1)).toBe(0);
    expect(gradeAgainst(quantiles, 101)).toBe(100);
  });

  it("puts a value that ties a run of history at the middle of the run", () => {
    // Most games have no solo kill: a zero is ordinary, not the worst game
    // ever played, and not the best either.
    const mostlyZero = [0, 0, 0, 0, 0, ...spread(1, 16).slice(5)];
    expect(gradeAgainst(mostlyZero, 0)).toBe(10);
  });
});

describe("styleStat", () => {
  const index = indexGames([
    game("Front", { match_id: "G1", team_name: "Blue", damage_taken: 30000, damage_mitigated: 30000 }),
    game("Carry", { match_id: "G1", team_name: "Blue", damage_taken: 10000 }),
    game("Other", { match_id: "G1", team_name: "Red", damage_taken: 99999 }),
  ]);

  it("rates counting stats per minute", () => {
    expect(styleStat("kills", game("A", { kills: 9 }), 30, index)).toBeCloseTo(0.3);
  });

  it("has no rate for a game with no clock, rather than a per-game total", () => {
    expect(styleStat("kills", game("A", { kills: 9 }), 0, index)).toBeNull();
    // Shares need no clock.
    expect(styleStat("share", game("A", { damage_share_pct: 31 }), 0, index)).toBe(31);
  });

  it("measures soaking as a share of the player's OWN team's damage taken", () => {
    const front = game("Front", { match_id: "G1", team_name: "Blue", damage_taken: 30000, damage_mitigated: 30000 });
    expect(styleStat("takenShare", front, 30, index)).toBeCloseTo(0.75);
    expect(styleStat("mitPct", front, 30, index)).toBeCloseTo(0.5);
  });
});

describe("gradeGame", () => {
  const index = indexGames([]);

  it("grades an assassin on the assassin's job, against assassins", () => {
    const zed = game("Stabby", { champion: "Zed", role: "MIDDLE", kills: 12, solo_kills: 3, total_damage_to_champions: 18000 });
    // kills 0.4/min and solo 0.1/min top their histories; 600 dmg/min sits
    // at the 37.5th percentile of assassin damage.
    expect(gradeGame(zed, "MIDDLE", 30, index, YARDSTICK)).toEqual({ style: "assassin", grade: 0.4 * 100 + 0.3 * 100 + 0.3 * 37.5 });
  });

  it("borrows the class's games from every role when the role has too few", () => {
    const sion = game("Rock", { champion: "Sion", role: "TOP", time_ccing_others_s: 15, damage_mitigated: 45000, damage_taken: 20000 });
    const { style, grade } = gradeGame(sion, "TOP", 30, indexGames([sion]), YARDSTICK);
    expect(style).toBe("tank");
    // Against *|tank: cc 0.5/min -> 50, all the team's damage taken -> 100,
    // 1500 mitigated/min -> 50. Against the 5-game TOP|tank group it would
    // have graded near zero on every stat.
    expect(grade).toBeCloseTo(0.4 * 50 + 0.3 * 100 + 0.3 * 50);
  });

  it("cannot grade a champion it does not know", () => {
    expect(gradeGame(game("X", { champion: "NotAChampion", role: "MIDDLE" }), "MIDDLE", 30, index, YARDSTICK)).toEqual({ style: null, grade: null });
  });
});

describe("the style rating on a card", () => {
  it("pays each player for their own style's job", () => {
    const cards = buildSeasonCards({ ...midWindow(), yardstick: YARDSTICK });
    const bar = (name: string) => cards.find((card) => card.name === name)!.subStats[0];
    // The assassin's week is judged on kills and solo kills, not on a mage's
    // damage — and lands well above the ordinary mages for doing it.
    expect(bar("Stabby")).toEqual({ key: "style", label: "Assassin", value: 84 });
    expect(bar("Blasty")).toEqual({ key: "style", label: "Mage", value: 99 });
    expect(bar("MidA")).toEqual({ key: "style", label: "Mage", value: 60 });
  });

  it("wears the style bar and the role's four fundamentals", () => {
    const [card] = buildSeasonCards({ ...midWindow(), yardstick: YARDSTICK });
    expect(card.subStats.map((stat) => stat.key)).toEqual(["style", "laning", "survival", "teamplay", "vision"]);
  });

  it("scores 30% winning, 40% fundamentals, 30% playstyle, through the season's curve", () => {
    const window = midWindow();
    const ratings = seasonStyleRatings({ ...window, yardstick: YARDSTICK });
    const stabby = window.cohort.find((row) => row.summoner_name === "Stabby")!;
    // Everyone's fundamentals tie at 50 and everyone won half their games.
    const score = (30 * 50 + 40 * 50 + 30 * (0.4 * 100 + 0.3 * 100 + 0.3 * 37.5)) / 100;
    expect(ratings.get(stabby)!.score).toBeCloseTo(score);
    const card = buildSeasonCards({ ...window, yardstick: YARDSTICK }).find((c) => c.name === "Stabby")!;
    expect(card.overall).toBe(Math.round(20 + 0.8 * score));
  });

  it("expects a tank to farm like a tank", () => {
    // YARDSTICK says top tanks farm a CS a minute less than the role: Sion's
    // 6 a minute is Darius's 7, and the Laning bar says so.
    const top = (name: string, champion: string, cs: number) => ({
      row: agg(name, "TOP"),
      games: [game(name, { champion, role: "TOP", cs })],
    });
    const cards = buildSeasonCards({
      ...windowOf([top("Rock", "Sion", 180), top("Axe", "Darius", 210), top("Spin", "Garen", 210), top("Croc", "Renekton", 150)]),
      yardstick: YARDSTICK,
    });
    const laning = (name: string) => cards.find((card) => card.name === name)!.subStats.find((stat) => stat.key === "laning")!.value;
    expect(laning("Rock")).toBe(laning("Axe"));
    expect(laning("Rock")).toBeGreaterThan(laning("Croc"));
  });

  it("measures laning against the player in the same role on the other team", () => {
    const mid = (name: string, match: string, team: string, lead: number) => ({
      row: agg(name, "MIDDLE"),
      games: [game(name, { match_id: match, team_name: team, role: "MIDDLE", cs_at_10: 80 + lead, gold_at_10: 3500 + lead * 20, xp_at_10: 4500 + lead * 20 })],
    });
    const cards = buildSeasonCards({
      ...windowOf([mid("Winner", "L1", "Blue", 10), mid("Loser", "L1", "Red", -10), mid("EvenA", "L2", "Blue", 0), mid("EvenB", "L2", "Red", 0)]),
      yardstick: YARDSTICK,
    });
    const laning = (name: string) => cards.find((card) => card.name === name)!.subStats.find((stat) => stat.key === "laning")!.value;
    expect(laning("Winner")).toBeGreaterThan(laning("EvenA"));
    expect(laning("EvenA")).toBeGreaterThan(laning("Loser"));
  });

  it("leaves CS out of a support's laning", () => {
    const support = (name: string, cs: number) => ({ row: agg(name, "UTILITY"), games: [game(name, { champion: "Leona", role: "UTILITY", cs })] });
    const cards = buildSeasonCards({
      ...windowOf([support("Farmer", 120), support("B", 30), support("C", 30), support("D", 30)]),
      yardstick: YARDSTICK,
    });
    const laning = cards.map((card) => card.subStats.find((stat) => stat.key === "laning")!.value);
    expect(new Set(laning).size).toBe(1);
  });

  it("sits a player it cannot grade at the middle, under a neutral label", () => {
    const window = windowOf([
      { row: agg("Mystery", "MIDDLE"), games: [game("Mystery", { champion: "NotAChampion", role: "MIDDLE" })] },
      ...["A", "B", "C"].map((name) => ({ row: agg(name, "MIDDLE"), games: [game(name, { role: "MIDDLE" })] })),
    ]);
    const card = buildSeasonCards({ ...window, yardstick: YARDSTICK }).find((c) => c.name === "Mystery")!;
    expect(card.subStats[0]).toEqual({ key: "style", label: "Playstyle", value: 60 });
  });

  it("rates exactly as before when no yardstick is given", () => {
    const window = midWindow();
    expect(buildSeasonCards({ ...window, yardstick: null })).toEqual(buildSeasonCards(window));
    expect(buildSeasonCards(window)[0].subStats[0].key).toBe("combat");
  });
});
