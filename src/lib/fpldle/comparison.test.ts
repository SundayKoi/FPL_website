import { describe, expect, it } from "vitest";
import { compareFpldleGuess, type FpldleCandidate } from "./comparison";

const target: FpldleCandidate = {
  slug: "target-player-na1",
  name: "Target Player",
  tag: "NA1",
  team: "Team Alpha",
  position: "Mid",
  champion: "Ahri",
  overall: 88,
};

function guess(overrides: Partial<FpldleCandidate> = {}): FpldleCandidate {
  return {
    slug: "guess-player-na1",
    name: "Guess Player",
    tag: "NA1",
    team: "Team Beta",
    position: "Top",
    champion: "Orianna",
    overall: 75,
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
          position: target.position,
          champion: target.champion,
          overall: target.overall,
        }),
        target,
      ),
    ).toEqual({
      player: { slug: target.slug, name: target.name, tag: target.tag },
      team: "match",
      position: "match",
      champion: "match",
      overall: "equal",
      isCorrect: true,
    });
  });

  it("reports misses for team, position, and champion", () => {
    expect(compareFpldleGuess(guess(), target)).toMatchObject({
      team: "miss",
      position: "miss",
      champion: "miss",
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
});
