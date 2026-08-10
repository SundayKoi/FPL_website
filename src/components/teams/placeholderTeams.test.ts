import { describe, expect, it } from "vitest";
import { ROLE_ORDER } from "@/lib/draft/types";
import { PLACEHOLDER_TEAMS } from "./placeholderTeams";

describe("PLACEHOLDER_TEAMS", () => {
  it("contains twelve complete preview rosters", () => {
    expect(PLACEHOLDER_TEAMS).toHaveLength(12);

    const teamIds = new Set(PLACEHOLDER_TEAMS.map((team) => team.id));
    const playerIds = new Set(
      PLACEHOLDER_TEAMS.flatMap((team) => team.players.map((player) => player.id)),
    );

    expect(teamIds.size).toBe(12);
    expect(playerIds.size).toBe(60);

    for (const team of PLACEHOLDER_TEAMS) {
      expect(team.players).toHaveLength(5);
      expect(team.players.map((player) => player.role)).toEqual(ROLE_ORDER);
      expect(team.players.some((player) => player.acquisition === "captain")).toBe(true);
      expect(team.abbreviation).toBeTruthy();
      expect(team.imageUrl).toBeNull();
    }
  });
});
