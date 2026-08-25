import { describe, expect, it } from "vitest";
import type { PlayerAggRow } from "@/lib/stats/types";
import { assignArchetypes, buildCard, buildSeasonCards, cardSlug, FALLBACK_ARCHETYPE, OVR_BASE, OVR_SCALE, teamBadgeKey, tierFor, type CardGameRow } from "./build";

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
  kills: 5,
  deaths: 3,
  assists: 6,
  cs: 200,
  total_damage_to_champions: 20000,
  ...over,
});

/** gameLog meta with only durations set (team names optional per test). */
const logOf = (durations: Record<string, number>) =>
  new Map(Object.entries(durations).map(([id, mins]) => [id, { durationMin: mins, blueTeam: "Gamblers", redTeam: "Enemies" }]));

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
  const gameLog = logOf({ NA1_1: 25, NA1_2: 40, NA1_3: 35, NA1_4: 28, NA1_5: 33, NA1_6: 30 });

  const card = buildCard({ row: target, cohort: cohortOf(target), games, gameLog });

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
    const built = buildCard({ row: target, cohort: cohortOf(target), games: riotNamed, gameLog: new Map() });

    // Both spellings merge into one display-named pool entry.
    expect(built.signature).toEqual({ champion: "Miss Fortune", games: 2 });
    expect(built.topChampions.map((c) => c.champion)).toEqual(["Miss Fortune", "Wukong"]);
  });

  it("labels a low-death high-KDA player The Surgeon", () => {
    const surgeon = agg({ summoner_name: "Surgeon", kda: 8, avg_deaths: 0.8 });
    const cohort = [...cohortOf(target), surgeon];
    const built = buildCard({ row: surgeon, cohort, games: [], gameLog: new Map() });
    expect(built.archetype).toBe("The Surgeon");
  });

  it("collects season highs with champion + opponent details", () => {
    const highlightGames = [
      gameRow({ match_id: "NA1_1", kills: 12, deaths: 2, cs: 250, total_damage_to_champions: 41200, champion: "Jhin" }),
      gameRow({ match_id: "NA1_2", kills: 4, deaths: 0, assists: 9, cs: 180, total_damage_to_champions: 18000, champion: "Jinx" }),
    ];
    const built = buildCard({ row: target, cohort: cohortOf(target), games: highlightGames, gameLog });

    // Flawless (0-death win with 13 K+A) leads, then kills and damage peaks.
    expect(built.highlights[0]).toEqual({ label: "Flawless game", value: "4/0/9", detail: "Jinx vs Enemies" });
    expect(built.highlights[1]).toEqual({ label: "Most kills", value: "12", detail: "Jhin vs Enemies" });
    expect(built.highlights[2]).toEqual({ label: "Damage high", value: "41k", detail: "Jhin vs Enemies" });
  });

  it("awards feat badges from the season line", () => {
    const row = agg({ total_pentas: 2, games: 16, wins: 11, winrate_pct: 68.8, first_blood_involvements: 9 });
    const built = buildCard({
      row,
      cohort: cohortOf(target),
      games: [gameRow({ deaths: 0, win: true })],
      gameLog: new Map(),
      recordCategories: ["Most kills in a game"],
    });

    const keys = built.badges.map((badge) => badge.key);
    // Capped at four, strongest feats first.
    expect(keys).toEqual(["penta", "record", "first-blood", "flawless"]);
  });

  it("passes standout, team art, and chosen skin through", () => {
    const built = buildCard({
      row: target,
      cohort: cohortOf(target),
      games,
      gameLog,
      standout: true,
      artSkin: 4,
      teamImages: new Map([["gamblers", "https://cdn.example/gamblers.png"]]),
    });
    expect(built.standout).toBe(true);
    expect(built.artSkin).toBe(4);
    expect(built.teamImageUrl).toBe("https://cdn.example/gamblers.png");
  });

  it("carries the team's abbreviation, and leaves it null when none resolves", () => {
    const withAbbr = buildCard({
      row: target,
      cohort: cohortOf(target),
      games,
      gameLog,
      teamAbbrs: new Map([["gamblers", "GMB"]]),
    });
    expect(withAbbr.teamAbbr).toBe("GMB");

    // No map at all: the card still builds, and the renderer falls back to
    // the full name rather than showing an empty slot.
    const withoutAbbr = buildCard({ row: target, cohort: cohortOf(target), games, gameLog });
    expect(withoutAbbr.teamAbbr).toBeNull();
  });

  it("maps the league's best week onto a reachable top tier", () => {
    const best = buildCard({ row: target, cohort: cohortOf(target), games, gameLog });
    expect(best.overall).toBeGreaterThan(0);
    // The curve itself: a 92 raw score must clear Challenger's 94 floor.
    expect(tierFor(Math.round(OVR_BASE + 92 * OVR_SCALE)).key).toBe("challenger");
    expect(tierFor(Math.round(OVR_BASE + 55 * OVR_SCALE)).key).toBe("gold");
  });
});

describe("archetype scarcity", () => {
  it("gives a title to at most cap players — two surgeons can't both be The Surgeon", () => {
    const surgeonOne = agg({ summoner_name: "SurgeonOne", kda: 8, avg_deaths: 0.8 });
    const surgeonTwo = agg({ summoner_name: "SurgeonTwo", kda: 7.9, avg_deaths: 0.9 });
    const cohort = [...cohortOf(agg()), surgeonOne, surgeonTwo];

    const assigned = assignArchetypes(cohort, new Map());

    // The stronger claim wins the title; the other player gets something else.
    expect(assigned.get("surgeonone#na1")).toBe("The Surgeon");
    expect(assigned.get("surgeontwo#na1")).toBeTruthy();
    expect(assigned.get("surgeontwo#na1")).not.toBe("The Surgeon");
  });

  it("assigns every player some title", () => {
    const cohort = cohortOf(agg());
    const assigned = assignArchetypes(cohort, new Map());
    for (const row of cohort) {
      expect(assigned.get(`${row.summoner_name.toLowerCase()}#na1`), row.summoner_name).toBeTruthy();
    }
  });

  it("buildSeasonCards spreads titles across the league", () => {
    const cohort = cohortOf(agg());
    const cards = buildSeasonCards({ cohort, gamesByPlayer: new Map(), gameLog: new Map() });

    expect(cards).toHaveLength(cohort.length);
    // Small league, generous title pool: only the fallback may repeat.
    const titles = cards.map((card) => card.archetype).filter((title) => title !== FALLBACK_ARCHETYPE);
    expect(new Set(titles).size).toBe(titles.length);
    expect(titles.length).toBeGreaterThan(0);
    // Sorted best first, with collector serials following the sort.
    for (let i = 1; i < cards.length; i += 1) {
      expect(cards[i - 1].overall).toBeGreaterThanOrEqual(cards[i].overall);
    }
    expect(cards.map((card) => card.serial)).toEqual(cards.map((_, index) => index + 1));
    expect(cards[0].collectionSize).toBe(cohort.length);
  });

  it("threads team abbreviations through the whole-season build", () => {
    // buildCard taking teamAbbrs isn't enough: fetchSeasonCards goes through
    // buildSeasonCards, and a map that stops at the seam leaves every live
    // card without its short code.
    const cohort = cohortOf(agg());
    // A card's team comes from its GAMES, not the agg row, so the player
    // under test needs one before there's a team to abbreviate at all.
    const cards = buildSeasonCards({
      cohort,
      gamesByPlayer: new Map([["player#na1", [gameRow({ team_name: "Gamblers" })]]]),
      gameLog: logOf({ NA1_1: 30 }),
      teamAbbrs: new Map([[teamBadgeKey("Gamblers"), "GMB"]]),
    });

    const withTeam = cards.filter((card) => card.teamName === "Gamblers");
    expect(withTeam.length).toBeGreaterThan(0);
    expect(withTeam.every((card) => card.teamAbbr === "GMB")).toBe(true);
  });

  it("crowns the highest-OVR card in each role as Card of the Week", () => {
    // cohortOf builds one BOTTOM role cohort with a clear ranking; the top
    // card must wear the crown and nobody else in the role may.
    const cohort = cohortOf(agg());
    const cards = buildSeasonCards({ cohort, gamesByPlayer: new Map(), gameLog: new Map() });

    const bots = cards.filter((card) => card.role === "Bot");
    expect(bots[0].standout).toBe(true);
    expect(bots[0].overall).toBe(Math.max(...bots.map((card) => card.overall)));
    expect(bots.slice(1).every((card) => !card.standout)).toBe(true);
  });

  it("threads art prefs (skin + motto) through to the built card", () => {
    const cohort = cohortOf(agg());
    const cards = buildSeasonCards({
      cohort,
      gamesByPlayer: new Map(),
      gameLog: new Map(),
      artPrefs: new Map([["player#na1", { skin: 7, motto: "Lock in." }]]),
    });
    const mine = cards.find((card) => card.slug === "player-na1")!;
    expect(mine.artSkin).toBe(7);
    expect(mine.motto).toBe("Lock in.");
  });
});

describe("archetypes fit the role they land on", () => {
  /** A full role cohort, so percentiles are computed within the role. */
  const roleCohort = (role: string): PlayerAggRow[] =>
    [1.6, 1.3, 1.0, 0.8, 0.6].map((mult, index) =>
      agg({
        summoner_name: `${role}${index}`,
        role_mode: role,
        kda: 3 * mult,
        avg_dmg_per_min: 500 * mult,
        avg_dmg_share_pct: 25 * mult,
        avg_dmg_taken_per_min: 700 * mult,
        avg_kills: 5 * mult,
        avg_assists: 8 * mult,
        avg_kp_pct: 55 * mult,
        avg_deaths: 4 / mult,
        avg_cs_per_min: 7 * mult,
        avg_gold_per_min: 380 * mult,
        avg_cs_at_10: 60 * mult,
        avg_gold_at_10: 3200 * mult,
        avg_xp_at_10: 4200 * mult,
        avg_vision_per_min: 1 * mult,
        avg_solo_kills: 1 * mult,
        first_blood_involvements: 3 * mult,
        total_plates: 4 * mult,
        winrate_pct: Math.min(95, 50 * mult),
      }),
    );

  /** Titles that describe farming a lane or winning one — meaningless for a
   *  jungler (no lane) and a support (no farm). This is the reported bug:
   *  supports were being crowned Farm Demon and junglers Lane Bully purely
   *  for topping their own role's percentile. */
  const LANE_ONLY = ["Farm Demon", "Lane Bully", "Gold Hoarder", "Plate Collector", "Wave Manager", "Free Win Lane"];

  it("never hands a support a farming or laning title", () => {
    const assigned = assignArchetypes(roleCohort("UTILITY"), new Map());
    for (const title of assigned.values()) {
      expect(LANE_ONLY, `support got "${title}"`).not.toContain(title);
      expect(title).not.toBe("The Hypercarry");
      expect(title).not.toBe("Island King");
    }
  });

  it("never hands a jungler a laning title, but does let them power farm", () => {
    const assigned = assignArchetypes(roleCohort("JUNGLE"), new Map());
    for (const title of assigned.values()) {
      expect(LANE_ONLY, `jungler got "${title}"`).not.toContain(title);
    }
    // Camps are still farm — the jungle keeps its own word for it.
    const titles = [...assigned.values()];
    expect(titles.some((title) => title === "Power Farmer" || title === "Camp Thief" || title === "Jungle Diff")).toBe(true);
  });

  it("keeps every role out of the fallback — each has a deep pool of its own", () => {
    for (const role of ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"]) {
      const assigned = assignArchetypes(roleCohort(role), new Map());
      const fallbacks = [...assigned.values()].filter((title) => title === FALLBACK_ARCHETYPE);
      expect(fallbacks.length, `${role} fell back too often`).toBeLessThanOrEqual(1);
    }
  });

  it("gives supports support words", () => {
    const assigned = assignArchetypes(roleCohort("UTILITY"), new Map());
    const SUPPORT_WORDS = [
      "The Warden", "The Bodyguard", "The Engage", "The Lifeline", "Roam Enjoyer",
      "Poke Support", "Vision Denier", "Sacrificial Play", "Playmaker", "The Enabler",
      "The Frontline", "Space Creator", "Unkillable", "First Blood Merchant",
    ];
    expect([...assigned.values()].some((title) => SUPPORT_WORDS.includes(title))).toBe(true);
  });
});

describe("team badge keys", () => {
  it("collapses punctuation and spacing so the two team tables can meet", () => {
    // raw_stats carries league_teams.name; the logo hangs off the
    // draft-side teams table. Nothing enforces identical spelling.
    expect(teamBadgeKey("Fraudulent 5")).toBe(teamBadgeKey("Fraudulent5"));
    expect(teamBadgeKey("  The Cakesters  ")).toBe(teamBadgeKey("the cakesters"));
    expect(teamBadgeKey("Honest Elo-Peakers")).toBe(teamBadgeKey("Honest Elo Peakers"));
    expect(teamBadgeKey("FRD")).toBe("frd");
  });

  it("keeps genuinely different teams apart", () => {
    expect(teamBadgeKey("Winter")).not.toBe(teamBadgeKey("Winters"));
    expect(teamBadgeKey("")).toBe("");
  });
});
