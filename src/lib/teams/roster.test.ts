import { describe, expect, it } from "vitest";
import type { Player, Profile, Team } from "@/lib/draft/types";
import { toRosterTeams } from "./roster";

const team: Team = {
  id: "team-alpha",
  draft_id: "draft-1",
  name: "Alpha League",
  abbreviation: "ALP",
  image_url: "https://img.test/alpha",
  captain_profile_id: "profile-1",
  nomination_position: 1,
  budget_start: 100,
  points_remaining: 80,
};

const captainProfile: Profile = {
  id: "profile-1",
  discord_id: null,
  display_name: "Captain Profile",
  avatar_url: null,
  is_admin: false,
};

const player = (overrides: Partial<Player> = {}): Player => ({
  id: "captain-player",
  draft_id: "draft-1",
  display_name: "Roster Captain",
  role: "top",
  rank: null,
  opgg_url: null,
  notes: null,
  team_id: "team-alpha",
  price: 0,
  acquisition: "captain",
  ...overrides,
});

describe("toRosterTeams", () => {
  it("maps persisted identity and selected captain profile", () => {
    const view = toRosterTeams([team], [player()], [captainProfile])[0];

    expect(view.abbreviation).toBe("ALP");
    expect(view.imageUrl).toBe("https://img.test/alpha");
    expect(view.captainName).toBe("Captain Profile");
    expect(view.players).toHaveLength(5);
    expect(view.players.map((slot) => slot.role)).toEqual([
      "top",
      "jungle",
      "mid",
      "adc",
      "support",
    ]);
    expect("pointsRemaining" in view).toBe(false);
  });

  it("falls back to the roster captain and then Unassigned", () => {
    const unassignedTeam = { ...team, id: "team-unassigned", captain_profile_id: null };

    const views = toRosterTeams(
      [{ ...team, captain_profile_id: null }, unassignedTeam],
      [player()],
    );

    expect(views[0].captainName).toBe("Roster Captain");
    expect(views[1].captainName).toBe("Unassigned");
  });
});
