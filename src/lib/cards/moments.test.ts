import { describe, expect, it } from "vitest";
import {
  findMomentCandidates,
  gameClock,
  mintOrdinal,
  momentFamilyOf,
  selectMoments,
  MOMENT_TRIGGERS,
  type MomentStatRow,
} from "./moments";

const slugOf = (name: string, tag: string) => `${name}-${tag}`.toLowerCase();

function row(overrides: Partial<MomentStatRow> = {}): MomentStatRow {
  return {
    match_id: "m1",
    season: "S5",
    game_date: "2026-08-24T00:00:00Z",
    summoner_name: "Ari",
    tag: "NA1",
    team_name: "Wolves",
    champion: "Jinx",
    role: "BOTTOM",
    win: true,
    kills: 5,
    deaths: 2,
    assists: 4,
    solo_kills: 0,
    baron_kills: 0,
    penta_kills: 0,
    quadra_kills: 0,
    largest_killing_spree: 3,
    kill_participation_pct: 55,
    damage_share_pct: 25,
    objectives_stolen: 0,
    largest_critical_strike: 400,
    bounty_gold: 150,
    nexus_kills: 0,
    solo_turrets_late_game: 0,
    effective_heal_and_shield: 2000,
    max_cs_advantage_on_lane_opponent: 12,
    max_level_lead_on_lane_opponent: 1,
    damage_mitigated: 8000,
    on_my_way_pings: 12,
    game_duration_min: 31.7,
    ...overrides,
  };
}

describe("findMomentCandidates", () => {
  it("mints nothing for an ordinary game", () => {
    expect(findMomentCandidates([row()], slugOf)).toHaveLength(0);
  });

  it("takes a pentakill even in a loss", () => {
    const found = findMomentCandidates([row({ penta_kills: 1, win: false })], slugOf);
    expect(found[0].title).toBe("PENTAKILL");
  });

  it("only counts a steal when the baron came with it", () => {
    // A stolen herald or camp dragon isn't THE STEAL — the steal has to
    // arrive alongside a baron last-hit.
    expect(findMomentCandidates([row({ objectives_stolen: 1 })], slugOf)).toHaveLength(0);
    const found = findMomentCandidates([row({ objectives_stolen: 1, baron_kills: 1 })], slugOf);
    expect(found[0].title).toBe("THE STEAL");
  });

  it("keeps only the rarest trigger for one performance", () => {
    // A penta that was also flawless is one moment, not two.
    const found = findMomentCandidates(
      [row({ penta_kills: 1, deaths: 0, kill_participation_pct: 90 })],
      slugOf,
    );
    expect(found).toHaveLength(1);
    expect(found[0].triggerKey).toBe("pentakill");
  });

  it("needs carry attached, not just a clean sheet", () => {
    // Deathless alone is common; deathless with real participation is not.
    expect(findMomentCandidates([row({ deaths: 0, kill_participation_pct: 40 })], slugOf)).toHaveLength(0);
    expect(findMomentCandidates([row({ deaths: 0, kill_participation_pct: 80 })], slugOf)).toHaveLength(1);
  });

  it("ignores a spree racked up in a loss", () => {
    expect(findMomentCandidates([row({ largest_killing_spree: 9, win: false })], slugOf)).toHaveLength(0);
    expect(findMomentCandidates([row({ largest_killing_spree: 9, win: true })], slugOf)).toHaveLength(1);
  });

  it("skips rows missing the identity a card needs", () => {
    expect(findMomentCandidates([row({ penta_kills: 1, match_id: null })], slugOf)).toHaveLength(0);
    expect(findMomentCandidates([row({ penta_kills: 1, tag: null })], slugOf)).toHaveLength(0);
  });

  it("builds the headline out of the real numbers", () => {
    const found = findMomentCandidates(
      [row({ objectives_stolen: 1, baron_kills: 1, kills: 7, deaths: 1, assists: 3 })],
      slugOf,
    );
    expect(found[0].headline).toBe("Baron stolen from under them · 7/1/3");
  });

  it("names the opponent from the match's own rows", () => {
    const found = findMomentCandidates(
      [
        row({ penta_kills: 1 }),
        row({ summoner_name: "Enemy", team_name: "Cakesters", win: false }),
      ],
      slugOf,
    );
    expect(found[0].opponent).toBe("Cakesters");
    expect(found[0].durationMin).toBe(31.7);
  });

  it("no longer mints for vision alone — LIGHTS ON is retired", () => {
    expect(MOMENT_TRIGGERS.some((trigger) => trigger.key === "vision_lock")).toBe(false);
  });

  it("fires each new trigger at its threshold and not below", () => {
    const cases: [Partial<MomentStatRow>, string][] = [
      [{ nexus_kills: 1, solo_turrets_late_game: 2 }, "backdoor"],
      [{ bounty_gold: 1200 }, "bounty_hunter"],
      [{ largest_critical_strike: 1800, win: false }, "nuke"],
      [{ max_cs_advantage_on_lane_opponent: 55, max_level_lead_on_lane_opponent: 2 }, "lane_kingdom"],
      [{ damage_mitigated: 30000 }, "raid_boss"],
      [{ effective_heal_and_shield: 14000 }, "bodyguard"],
      [{ on_my_way_pings: 70, win: false }, "on_my_way"],
    ];
    for (const [overrides, key] of cases) {
      const found = findMomentCandidates([row(overrides)], slugOf);
      expect(found.map((candidate) => candidate.triggerKey)).toEqual([key]);
    }
    // Near-misses stay quiet: the compound halves are load-bearing.
    expect(findMomentCandidates([row({ nexus_kills: 1, solo_turrets_late_game: 1 })], slugOf)).toHaveLength(0);
    expect(findMomentCandidates([row({ bounty_gold: 1200, win: false })], slugOf)).toHaveLength(0);
    expect(findMomentCandidates([row({ max_cs_advantage_on_lane_opponent: 80 })], slugOf)).toHaveLength(0);
  });
});

describe("families and formatting", () => {
  it("assigns every trigger a colorway family", () => {
    for (const trigger of MOMENT_TRIGGERS) {
      expect(["ember", "void", "ice", "gold"]).toContain(momentFamilyOf(trigger.key));
    }
  });

  it("prints retired and unknown triggers in the fallback family", () => {
    expect(momentFamilyOf("vision_lock")).toBe("ember");
    expect(momentFamilyOf(null)).toBe("ember");
  });

  it("formats the game clock, and refuses to invent one", () => {
    expect(gameClock(31.7)).toBe("31:42");
    expect(gameClock(45)).toBe("45:00");
    expect(gameClock(null)).toBeNull();
    expect(gameClock(undefined)).toBeNull();
  });

  it("speaks mint ordinals like a collector", () => {
    expect(mintOrdinal(1)).toBe("1st");
    expect(mintOrdinal(2)).toBe("2nd");
    expect(mintOrdinal(3)).toBe("3rd");
    expect(mintOrdinal(4)).toBe("4th");
    expect(mintOrdinal(11)).toBe("11th");
    expect(mintOrdinal(21)).toBe("21st");
  });
});

describe("selectMoments", () => {
  const rowsBySlug = new Map<string, MomentStatRow>();

  it("caps the week however many qualify", () => {
    const candidates = findMomentCandidates(
      [
        row({ summoner_name: "A", penta_kills: 1 }),
        row({ summoner_name: "B", objectives_stolen: 1, baron_kills: 1 }),
        row({ summoner_name: "C", largest_killing_spree: 9 }),
        row({ summoner_name: "D", quadra_kills: 1 }),
      ],
      slugOf,
    );
    expect(candidates).toHaveLength(4);
    expect(selectMoments(candidates, rowsBySlug, 2)).toHaveLength(2);
  });

  it("keeps the rarest, not the first detected", () => {
    // The comedy trigger comes first in row order; the penta must still
    // win the slot.
    const candidates = findMomentCandidates(
      [row({ summoner_name: "Quiet", on_my_way_pings: 80 }), row({ summoner_name: "Loud", penta_kills: 1 })],
      slugOf,
    );
    const picked = selectMoments(candidates, rowsBySlug, 1);
    expect(picked[0].summonerName).toBe("Loud");
  });

  it("gives one player one moment however good their night was", () => {
    const candidates = findMomentCandidates(
      [
        row({ match_id: "m1", penta_kills: 1 }),
        row({ match_id: "m2", objectives_stolen: 1, baron_kills: 1 }),
        row({ match_id: "m3", quadra_kills: 1 }),
      ],
      slugOf,
    );
    const picked = selectMoments(candidates, rowsBySlug, 5);
    expect(picked).toHaveLength(1);
    expect(picked[0].triggerKey).toBe("pentakill");
  });

  it("is deterministic when two performances tie exactly", () => {
    const candidates = findMomentCandidates(
      [row({ summoner_name: "Zoe", penta_kills: 1 }), row({ summoner_name: "Abe", penta_kills: 1 })],
      slugOf,
    );
    const once = selectMoments(candidates, rowsBySlug, 1);
    const again = selectMoments([...candidates].reverse(), rowsBySlug, 1);
    expect(once[0].slug).toBe(again[0].slug);
  });
});
