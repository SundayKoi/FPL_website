import { describe, expect, it } from "vitest";
import { compareFpldleGuess, type FpldleCandidate } from "./comparison";

const target: FpldleCandidate = {
  slug: "target-player-na1",
  name: "Target Player",
  tag: "NA1",
  team: "Team Alpha",
  teamLogoUrl: "https://example.com/alpha.png",
  position: "Mid",
  champion: "Ahri",
  overall: 88,
  division: "Solari",
};

function guess(overrides: Partial<FpldleCandidate> = {}): FpldleCandidate {
  return {
    slug: "guess-player-na1",
    name: "Guess Player",
    tag: "NA1",
    team: "Team Beta",
    teamLogoUrl: "https://example.com/beta.png",
    position: "Top",
    champion: "Orianna",
    overall: 75,
    division: "Lunari",
    ...overrides,
  };
}

describe("compareFpldleGuess", () => {
  it("reports exact team, position, champion, and overall matches", () => {
    expect(
      compareFpldleGuess(
        guess({
          slug: target.slug,
          name: target.name,
          tag: target.tag,
          team: target.team,
          teamLogoUrl: target.teamLogoUrl,
          position: target.position,
          champion: target.champion,
          overall: target.overall,
          division: target.division,
        }),
        target,
      ),
    ).toEqual({
      player: { slug: target.slug, name: target.name, tag: target.tag },
      team: "match",
      teamName: target.team,
      teamLogoUrl: target.teamLogoUrl,
      position: "match",
      positionName: target.position,
      champion: "match",
      championName: target.champion,
      overall: "equal",
      overallValue: target.overall,
      division: "match",
      divisionName: target.division,
      isCorrect: true,
    });
  });

  it("reports misses for team, position, and champion", () => {
    expect(compareFpldleGuess(guess(), target)).toMatchObject({
      team: "miss",
      teamName: "Team Beta",
      teamLogoUrl: "https://example.com/beta.png",
      position: "miss",
      positionName: "Top",
      champion: "miss",
      championName: "Orianna",
      division: "miss",
      divisionName: "Lunari",
      isCorrect: false,
    });
  });

  it("reports that target overall is higher than the guess", () => {
    expect(compareFpldleGuess(guess({ overall: 87 }), target).overall).toBe("higher");
  });

  it("reports that target overall is lower than the guess", () => {
    expect(compareFpldleGuess(guess({ overall: 89 }), target).overall).toBe("lower");
  });

  it("reports equal overall independently of the other clues", () => {
    expect(compareFpldleGuess(guess({ overall: target.overall }), target).overall).toBe("equal");
  });

  it("marks division unavailable when the target league has no divisions", () => {
    const academyTarget = { ...target, division: null };
    expect(compareFpldleGuess(guess({ division: null }), academyTarget)).toMatchObject({
      division: "unavailable",
      divisionName: null,
    });
  });
});
