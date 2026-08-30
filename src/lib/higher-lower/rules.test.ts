import { describe, expect, it } from "vitest";
import type { PlayerCardData } from "@/lib/cards/build";
import {
  choiceIsCorrect,
  concealHigherLowerCard,
  difficultyForRound,
  rankHigherLowerWeek,
  utcWeekStart,
} from "./rules";

const card = {
  slug: "player-one",
  name: "Player One",
  teamName: "Blue Team",
  teamAbbr: "BLU",
  teamImageUrl: "https://example.com/blue.png",
  overall: 88,
  signature: { champion: "Ahri", games: 12 },
  artSkin: "classic",
} as unknown as PlayerCardData;

describe("Higher or Lower rules", () => {
  it("keeps the difficulty bands exact at their boundaries", () => {
    expect(difficultyForRound(1)).toEqual({ minGap: 30, maxGap: 99 });
    expect(difficultyForRound(5)).toEqual({ minGap: 30, maxGap: 99 });
    expect(difficultyForRound(6)).toEqual({ minGap: 21, maxGap: 30 });
    expect(difficultyForRound(10)).toEqual({ minGap: 21, maxGap: 30 });
    expect(difficultyForRound(11)).toEqual({ minGap: 15, maxGap: 22 });
    expect(difficultyForRound(16)).toEqual({ minGap: 10, maxGap: 16 });
    expect(difficultyForRound(21)).toEqual({ minGap: 7, maxGap: 12 });
    expect(difficultyForRound(26)).toEqual({ minGap: 4, maxGap: 9 });
    expect(difficultyForRound(30)).toEqual({ minGap: 4, maxGap: 9 });
    expect(() => difficultyForRound(31)).toThrow();
  });

  it("compares challenger OVR without allowing ties", () => {
    expect(choiceIsCorrect(80, 81, "higher")).toBe(true);
    expect(choiceIsCorrect(80, 79, "lower")).toBe(true);
    expect(choiceIsCorrect(80, 80, "higher")).toBe(false);
    expect(choiceIsCorrect(80, 80, "lower")).toBe(false);
  });

  it("creates a safe concealed challenger DTO", () => {
    const concealed = concealHigherLowerCard(card);

    expect(concealed).toMatchObject({
      slug: "player-one",
      name: "Player One",
      teamName: "Blue Team",
      teamAbbr: "BLU",
    });
    expect(concealed).not.toHaveProperty("overall");
    expect(concealed).not.toHaveProperty("signature");
    expect(concealed).not.toHaveProperty("subStats");
  });

  it("uses Monday UTC boundaries and best run per member", () => {
    expect(utcWeekStart(new Date("2026-08-30T23:59:59.000Z"))).toBe("2026-08-24");
    expect(utcWeekStart(new Date("2026-08-31T00:00:00.000Z"))).toBe("2026-08-31");

    expect(
      rankHigherLowerWeek(
        [
          { profileId: "one", username: "One", avatarUrl: null, score: 4, league: "premier", puzzleDate: "2026-08-24" },
          { profileId: "one", username: "One", avatarUrl: null, score: 9, league: "premier", puzzleDate: "2026-08-24" },
          { profileId: "two", username: "Two", avatarUrl: null, score: 9, league: "academy", puzzleDate: "2026-08-25" },
        ],
        "one",
      ),
    ).toEqual([
      { username: "One", avatarUrl: null, score: 9, rank: 1, league: "premier", achievedDate: "2026-08-24", isCurrentUser: true },
      { username: "Two", avatarUrl: null, score: 9, rank: 1, league: "academy", achievedDate: "2026-08-25", isCurrentUser: false },
    ]);
  });
});
