import { describe, expect, it } from "vitest";
import { revealBoxScore, type BoxScoreSnapshot } from "./reveal";

const snapshot: BoxScoreSnapshot = {
  date: "2026-08-31",
  expiresAt: "2026-09-01T00:00:00.000Z",
  candidates: [
    { slug: "guess-one-na1", name: "Guess One", tag: "NA1", role: "Support" },
    { slug: "target-na1", name: "Target", tag: "NA1", role: "Mid" },
  ],
  target: {
    slug: "target-na1",
    name: "Target",
    tag: "NA1",
    role: "Mid",
    champion: "Ahri",
    championArtUrl: "https://ddragon.example/ahri.jpg",
    kills: 8,
    deaths: 2,
    assists: 11,
    kda: 9.5,
    killParticipationPct: 72.4,
    totalDamage: 28_400,
    damagePerMin: 812.6,
    damageSharePct: 31.2,
    cs: 245,
    csPerMin: 7.0,
    gold: 13_200,
    goldPerMin: 377.1,
    csAt10: 82,
    goldAt10: 3_450,
    team: "Solaris",
    date: "2026-08-29T19:30:00.000Z",
    result: "win",
    side: "Blue",
    durationMin: 35.2,
    visionScore: 24,
    objectives: 3,
    damageTaken: 18_100,
    damageMitigated: 9_500,
    healing: 1_240,
    multikills: { doubles: 2, triples: 1, quadras: 0, pentas: 0 },
    soloKills: 3,
    turretDamage: 1_800,
    objectiveDamage: 750,
  },
};

describe("revealBoxScore", () => {
  it("starts with role and keeps champion, stats, and identity locked", () => {
    const reveal = revealBoxScore(snapshot, [], "playing");

    expect(reveal).toEqual({
      stage: "role",
      role: "Mid",
      champion: null,
      combat: null,
      damage: null,
      economy: null,
      final: null,
      cardBack: null,
      canFlip: false,
    });
  });

  it("opens one clue rail after each wrong guess", () => {
    expect(revealBoxScore(snapshot, ["guess-one-na1"], "playing")).toMatchObject({
      stage: "champion",
      champion: { name: "Ahri", artUrl: "https://ddragon.example/ahri.jpg" },
      combat: null,
    });
    expect(revealBoxScore(snapshot, ["a", "b"], "playing")).toMatchObject({
      stage: "combat",
      combat: { kills: 8, deaths: 2, assists: 11, kda: 9.5, killParticipationPct: 72.4 },
      damage: null,
    });
    expect(revealBoxScore(snapshot, ["a", "b", "c"], "playing")).toMatchObject({
      stage: "damage",
      damage: { total: 28_400, perMin: 812.6, sharePct: 31.2 },
      economy: null,
    });
    expect(revealBoxScore(snapshot, ["a", "b", "c", "d"], "playing")).toMatchObject({
      stage: "economy",
      economy: { cs: 245, csPerMin: 7, gold: 13_200, goldPerMin: 377.1, csAt10: 82, goldAt10: 3_450 },
      final: null,
    });
  });

  it("reveals identity after game over and keeps the completed back separate", () => {
    const lost = revealBoxScore(snapshot, ["a", "b", "c", "d", "e"], "lost");
    expect(lost.stage).toBe("final");
    expect(lost.final).toEqual({
      slug: "target-na1",
      name: "Target",
      tag: "NA1",
      team: "Solaris",
      date: "2026-08-29T19:30:00.000Z",
      result: "win",
      side: "Blue",
      durationMin: 35.2,
    });
    expect(lost.cardBack).toBeNull();
    expect(lost.canFlip).toBe(false);

    const won = revealBoxScore(snapshot, [], "won");
    expect(won.final?.name).toBe("Target");
    expect(won.cardBack).toEqual({
      visionScore: 24,
      objectives: 3,
      damageTaken: 18_100,
      damageMitigated: 9_500,
      healing: 1_240,
      multikills: { doubles: 2, triples: 1, quadras: 0, pentas: 0 },
      soloKills: 3,
      turretDamage: 1_800,
      objectiveDamage: 750,
    });
    expect(won.canFlip).toBe(true);
  });

  it("never serializes internal game identifiers or locked answer fields early", () => {
    const start = JSON.stringify(revealBoxScore(snapshot, [], "playing"));
    const champion = JSON.stringify(revealBoxScore(snapshot, ["guess"], "playing"));

    expect(start).not.toContain("target-na1");
    expect(start).not.toContain("matchId");
    expect(start).not.toContain("Solaris");
    expect(champion).not.toContain("28,400");
    expect(champion).not.toContain("killParticipationPct");
  });
});
