import { describe, expect, it } from "vitest";
import { nemesisState, otherDivision } from "./nemesis";
import type { NemesisPick, Team } from "./types";

const team = (id: string, name: string, captain: string | null = null): Team => ({
  id,
  draft_id: "d1",
  name,
  captain_profile_id: captain,
  abbreviation: name.slice(0, 2).toUpperCase(),
  image_url: null,
  banner_color: null,
  division: null,
  nomination_position: 1,
  budget_start: 100,
  points_remaining: 100,
});

const pick = (
  n: number,
  chosen: string,
  division: "Lunari" | "Solari",
  chooser: string | null
): NemesisPick => ({
  id: `p${n}`,
  draft_id: "d1",
  pick_number: n,
  chooser_team_id: chooser,
  chosen_team_id: chosen,
  division,
  created_at: "2026-08-14T00:00:00Z",
});

const teams = [team("a", "Alpha"), team("b", "Bravo"), team("c", "Charlie"), team("d", "Delta")];

describe("otherDivision", () => {
  it("flips sides", () => {
    expect(otherDivision("Lunari")).toBe("Solari");
    expect(otherDivision("Solari")).toBe("Lunari");
  });
});

describe("nemesisState", () => {
  it("reports not started with no picks", () => {
    const s = nemesisState(teams, []);
    expect(s.phase).toBe("not_started");
    expect(s.onTheClockTeamId).toBeNull();
    expect(s.nextDivision).toBeNull();
    expect(s.unplaced).toHaveLength(4);
  });

  it("puts the seeded team on the clock and aims at the other division", () => {
    const s = nemesisState(teams, [pick(0, "a", "Lunari", null)]);
    expect(s.phase).toBe("live");
    expect(s.onTheClockTeamId).toBe("a");
    expect(s.nextDivision).toBe("Solari");
    expect(s.byDivision.Lunari.map((t) => t.id)).toEqual(["a"]);
    expect(s.unplaced.map((t) => t.id)).toEqual(["b", "c", "d"]);
  });

  it("hands the clock to whoever was chosen last", () => {
    const s = nemesisState(teams, [pick(0, "a", "Lunari", null), pick(1, "b", "Solari", "a")]);
    expect(s.onTheClockTeamId).toBe("b");
    expect(s.nextDivision).toBe("Lunari");
  });

  it("alternates sides across a full chain and completes", () => {
    const s = nemesisState(teams, [
      pick(0, "a", "Lunari", null),
      pick(1, "b", "Solari", "a"),
      pick(2, "c", "Lunari", "b"),
      pick(3, "d", "Solari", "c"),
    ]);
    expect(s.phase).toBe("complete");
    expect(s.onTheClockTeamId).toBeNull();
    expect(s.nextDivision).toBeNull();
    expect(s.byDivision.Lunari.map((t) => t.id)).toEqual(["a", "c"]);
    expect(s.byDivision.Solari.map((t) => t.id)).toEqual(["b", "d"]);
    expect(s.unplaced).toHaveLength(0);
  });

  it("orders placed teams by pick number regardless of input order", () => {
    const s = nemesisState(teams, [pick(1, "b", "Solari", "a"), pick(0, "a", "Lunari", null)]);
    expect(s.placed.map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("ignores picks naming a team the draft no longer holds", () => {
    const s = nemesisState(teams, [pick(0, "a", "Lunari", null), pick(1, "gone", "Solari", "a")]);
    expect(s.placed.map((t) => t.id)).toEqual(["a"]);
    expect(s.unplaced.map((t) => t.id)).toEqual(["b", "c", "d"]);
  });

  it("treats an empty draft as not started", () => {
    expect(nemesisState([], []).phase).toBe("not_started");
  });
});
