import { describe, expect, it } from "vitest";
import { findMomentCandidates, selectMoments, type MomentStatRow } from "./moments";

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
    penta_kills: 0,
    quadra_kills: 0,
    largest_killing_spree: 3,
    kill_participation_pct: 55,
    damage_share_pct: 25,
    objectives_stolen: 0,
    vision_score_per_min: 1,
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
    const found = findMomentCandidates([row({ objectives_stolen: 1, kills: 7, deaths: 1, assists: 3 })], slugOf);
    expect(found[0].headline).toBe("1 objective stolen · 7/1/3");
  });
});

describe("selectMoments", () => {
  const rowsBySlug = new Map<string, MomentStatRow>();

  it("caps the week however many qualify", () => {
    const candidates = findMomentCandidates(
      [
        row({ summoner_name: "A", penta_kills: 1 }),
        row({ summoner_name: "B", objectives_stolen: 1 }),
        row({ summoner_name: "C", largest_killing_spree: 9 }),
        row({ summoner_name: "D", quadra_kills: 1 }),
      ],
      slugOf,
    );
    expect(candidates).toHaveLength(4);
    expect(selectMoments(candidates, rowsBySlug, 2)).toHaveLength(2);
  });

  it("keeps the rarest, not the first detected", () => {
    // Vision comes first in row order; the penta must still win the slot.
    const candidates = findMomentCandidates(
      [row({ summoner_name: "Quiet", vision_score_per_min: 4 }), row({ summoner_name: "Loud", penta_kills: 1 })],
      slugOf,
    );
    const picked = selectMoments(candidates, rowsBySlug, 1);
    expect(picked[0].summonerName).toBe("Loud");
  });

  it("gives one player one moment however good their night was", () => {
    const candidates = findMomentCandidates(
      [
        row({ match_id: "m1", penta_kills: 1 }),
        row({ match_id: "m2", objectives_stolen: 1 }),
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
