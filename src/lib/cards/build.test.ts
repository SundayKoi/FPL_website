import { describe, expect, it } from "vitest";
import type { PlayerAggRow } from "@/lib/stats/types";
import { buildCard, cardSlug, tierFor, type CardGameRow } from "./build";

const agg = (over: Partial<PlayerAggRow> = {}): PlayerAggRow => ({
  summoner_name: "Player",
  tag: "NA1",
  season: "S5",
  season_phase: "Regular",
  role_mode: "BOTTOM",
  games: 10,
  wins: 5,
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
  total_solo_kills: 5,
  total_plates: 10,
  total_doubles: 3,
  total_triples: 1,
  total_quadras: 0,
  total_pentas: 0,
  avg_cs_at_10: 70,
  avg_gold_at_10: 3200,
  avg_xp_at_10: 4500,
  avg_dmg_taken_per_min: 600,
  avg_kda_challenges: 2.5,
  first_blood_involvements: 3,
  avg_game_duration: 30,
  ...over,
});

const gameRow = (over: Partial<CardGameRow> = {}): CardGameRow => ({
  summoner_name: "Player",
  tag: "NA1",
  champion: "Jhin",
  win: true,
  game_date: "2026-08-01T00:00:00Z",
  match_id: "NA1_1",
  team_name: "Gamblers",
  ...over,
});

/** A cohort with a clear spread so percentiles are deterministic. */
function cohortOf(target: PlayerAggRow): PlayerAggRow[] {
  const scale = (mult: number, name: string): PlayerAggRow =>
    agg({
      summoner_name: name,
      kda: 2.75 * mult,
      avg_dmg_per_min: 500 * mult,
      avg_kills: 5 * mult,
      avg_kp_pct: 55 * mult,
      avg_deaths: 4 / mult,
      avg_cs_per_min: 7 * mult,
      avg_gold_per_min: 380 * mult,
      avg_gold_at_10: 3200 * mult,
      avg_vision_per_min: 1 * mult,
      winrate_pct: Math.min(95, 50 * mult),
    });
  return [target, scale(0.6, "Low"), scale(0.8, "MidLow"), scale(1.2, "MidHigh"), scale(1.5, "High")];
}

describe("cardSlug", () => {
  it("slugifies name and tag into a URL-safe unique id", () => {
    expect(cardSlug("7gen", "NA1")).toBe("7gen-na1");
    expect(cardSlug("Nunu & Willump Fan", "EUW")).toBe("nunu-willump-fan-euw");
  });
});

describe("tierFor", () => {
  it("maps rating bands to LoL-flavored tiers", () => {
    expect(tierFor(45).key).toBe("bronze");
    expect(tierFor(60).key).toBe("gold");
    expect(tierFor(85).key).toBe("diamond");
    expect(tierFor(97).key).toBe("challenger");
  });
});

describe("buildCard", () => {
  const target = agg();
  const games: CardGameRow[] = [
    gameRow({ match_id: "NA1_1", game_date: "2026-08-01T00:00:00Z", champion: "Jhin", win: true }),
    gameRow({ match_id: "NA1_2", game_date: "2026-08-02T00:00:00Z", champion: "Jhin", win: false }),
    gameRow({ match_id: "NA1_3", game_date: "2026-08-03T00:00:00Z", champion: "Jinx", win: true }),
    gameRow({ match_id: "NA1_4", game_date: "2026-08-04T00:00:00Z", champion: "Jhin", win: true }),
    gameRow({ match_id: "NA1_5", game_date: "2026-08-05T00:00:00Z", champion: "Kai'Sa", win: true }),
    gameRow({ match_id: "NA1_6", game_date: "2026-08-06T00:00:00Z", champion: "Jhin", win: true }),
  ];
  const durations = new Map([
    ["NA1_1", 25],
    ["NA1_2", 40],
    ["NA1_3", 35],
    ["NA1_4", 28],
    ["NA1_5", 33],
    ["NA1_6", 30],
  ]);

  const card = buildCard({ row: target, cohort: cohortOf(target), games, durations });

  it("produces a 1-99 overall with a matching tier", () => {
    expect(card.overall).toBeGreaterThanOrEqual(1);
    expect(card.overall).toBeLessThanOrEqual(99);
    expect(card.tier).toEqual(tierFor(card.overall));
  });

  it("crowns the most-played champion as signature", () => {
    expect(card.signature).toEqual({ champion: "Jhin", games: 4 });
    expect(card.topChampions[0].champion).toBe("Jhin");
    expect(card.topChampions).toHaveLength(3);
  });

  it("takes form from the last five games, oldest first", () => {
    expect(card.form).toEqual([false, true, true, true, true]);
    // Four of five + a 4-win streak: form should read hot.
    const form = card.subStats.find((s) => s.key === "form")!;
    expect(form.value).toBeGreaterThan(80);
  });

  it("computes clutch from long games only", () => {
    // Long games (>=32min): NA1_2 (L), NA1_3 (W), NA1_5 (W) -> 2/3.
    const clutch = card.subStats.find((s) => s.key === "clutch")!;
    expect(clutch.value).toBe(Math.round(15 + (2 / 3) * 80));
  });

  it("keeps every sub-stat on the 1-99 scale", () => {
    for (const stat of card.subStats) {
      expect(stat.value).toBeGreaterThanOrEqual(1);
      expect(stat.value).toBeLessThanOrEqual(99);
    }
  });

  it("carries identity, record, and level through", () => {
    expect(card.slug).toBe("player-na1");
    expect(card.role).toBe("Bot");
    expect(card.teamName).toBe("Gamblers");
    expect(card.wins).toBe(5);
    expect(card.losses).toBe(5);
    expect(card.level).toBe(10);
  });

  it("canonicalizes Riot internal championName spellings so art resolves and aliases merge", () => {
    const riotNamed = [
      gameRow({ match_id: "NA1_10", game_date: "2026-08-01T00:00:00Z", champion: "MissFortune", win: true }),
      gameRow({ match_id: "NA1_11", game_date: "2026-08-02T00:00:00Z", champion: "Miss Fortune", win: false }),
      gameRow({ match_id: "NA1_12", game_date: "2026-08-03T00:00:00Z", champion: "MonkeyKing", win: true }),
    ];
    const built = buildCard({ row: target, cohort: cohortOf(target), games: riotNamed, durations: new Map() });

    // Both spellings merge into one display-named pool entry.
    expect(built.signature).toEqual({ champion: "Miss Fortune", games: 2 });
    expect(built.topChampions.map((c) => c.champion)).toEqual(["Miss Fortune", "Wukong"]);
  });

  it("labels a low-death high-KDA player The Surgeon", () => {
    const surgeon = agg({ summoner_name: "Surgeon", kda: 8, avg_deaths: 0.8 });
    const cohort = [...cohortOf(target), surgeon];
    const built = buildCard({ row: surgeon, cohort, games: [], durations: new Map() });
    expect(built.archetype).toBe("The Surgeon");
  });
});
