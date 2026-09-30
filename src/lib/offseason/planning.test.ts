import { describe, expect, it } from "vitest";
import type { LolRole } from "@/lib/draft/types";
import { planWeek, playablePlayers, proposeElimination, suggestCaptains } from "./planning";
import type { EntrantRating } from "./ratings";
import type { OffseasonEntrant } from "./types";

let clock = 0;
function entrant(id: string, role: LolRole | null, overrides: Partial<OffseasonEntrant> = {}): OffseasonEntrant {
  clock += 1;
  return {
    id,
    event_id: "event",
    profile_id: `profile-${id}`,
    display_name: id,
    riot_id: `${id}#OS1`,
    opgg_url: null,
    current_rank: null,
    primary_role: role ?? "top",
    secondary_role: null,
    assigned_role: role,
    status: "active",
    eliminated_week: null,
    signed_up_at: `2026-10-01T00:${String(Math.floor(clock / 60)).padStart(2, "0")}:${String(clock % 60).padStart(2, "0")}Z`,
    ...overrides,
  };
}

function rated(overalls: Record<string, number | null>): Map<string, EntrantRating> {
  return new Map(
    Object.entries(overalls).map(([id, overall]) => [
      id,
      { entrantId: id, card: null, overall, games: overall === null ? 0 : 3, wins: 0, losses: 0, weekly: [] },
    ]),
  );
}

const ROLES: LolRole[] = ["top", "jungle", "mid", "adc", "support"];
function teamsOf(count: number, prefix: string): OffseasonEntrant[] {
  return Array.from({ length: count }, (_, team) => ROLES.map((role) => entrant(`${prefix}${team}-${role}`, role))).flat();
}

describe("playablePlayers", () => {
  it("keeps active players with a role", () => {
    const players = [
      entrant("a", "top"),
      entrant("b", null),
      entrant("c", "mid", { status: "benched" }),
      entrant("d", "adc", { status: "eliminated", eliminated_week: 3 }),
    ];
    expect(playablePlayers(players).map((player) => player.id)).toEqual(["a"]);
  });
});

describe("proposeElimination", () => {
  it("takes the lowest-rated players of each role, lowest first", () => {
    const players = [entrant("t1", "top"), entrant("t2", "top"), entrant("t3", "top"), entrant("t4", "top"), entrant("m1", "mid")];
    const proposal = proposeElimination(players, rated({ t1: 80, t2: 55, t3: 62, t4: null, m1: 40 }), 2);
    expect(proposal.byRole.top.map((player) => player.id)).toEqual(["t2", "t3"]);
    expect(proposal.byRole.mid.map((player) => player.id)).toEqual(["m1"]);
    expect([...proposal.ids].sort()).toEqual(["m1", "t2", "t3"]);
    expect(proposal.unrated.map((player) => player.id)).toEqual(["t4"]);
  });

  it("proposes no one for a zero count", () => {
    const proposal = proposeElimination([entrant("t1", "top")], rated({ t1: 50 }), 0);
    expect(proposal.ids.size).toBe(0);
  });
});

describe("suggestCaptains", () => {
  it("picks the best-rated players who have a site account", () => {
    const pool = [entrant("a", "top"), entrant("b", "mid", { profile_id: null }), entrant("c", "adc"), entrant("d", "support")];
    const captains = suggestCaptains(pool, rated({ a: 70, b: 99, c: 85, d: null }), 2);
    expect(captains.map((captain) => captain.id)).toEqual(["c", "a"]);
  });
});

describe("planWeek", () => {
  it("places everyone in the round robin with captain seats", () => {
    const players = teamsOf(2, "m");
    const plan = planWeek({
      entrants: players,
      eliminationIds: new Set(),
      mainCaptainIds: ["m1-mid", "m0-top"],
      eliminationCaptainIds: [],
    });
    expect(plan.problems).toEqual([]);
    expect(plan.mainTeams).toBe(2);
    expect(plan.eliminationTeams).toBe(0);
    expect(plan.entries.filter((entry) => entry.tier === "main")).toHaveLength(10);
    expect(plan.entries.find((entry) => entry.entrant_id === "m1-mid")?.captain_seat).toBe(1);
    expect(plan.entries.find((entry) => entry.entrant_id === "m0-top")?.captain_seat).toBe(2);
    expect(plan.entries.find((entry) => entry.entrant_id === "m0-mid")?.captain_seat).toBeNull();
  });

  it("splits the elimination group into its own tier", () => {
    const main = teamsOf(2, "m");
    const elimination = teamsOf(2, "e");
    const plan = planWeek({
      entrants: [...main, ...elimination],
      eliminationIds: new Set(elimination.map((player) => player.id)),
      mainCaptainIds: ["m0-top", "m1-top"],
      eliminationCaptainIds: ["e0-top", "e1-top"],
    });
    expect(plan.problems).toEqual([]);
    expect(plan.eliminationTeams).toBe(2);
    expect(plan.entries.filter((entry) => entry.tier === "elimination")).toHaveLength(10);
    expect(plan.entries.find((entry) => entry.entrant_id === "e1-top")).toEqual({
      entrant_id: "e1-top",
      tier: "elimination",
      captain_seat: 2,
    });
  });

  it("sits the latest sign-ups of an over-full role out, but never a captain", () => {
    const players = teamsOf(2, "m");
    const lateMid = entrant("late-mid", "mid");
    const plan = planWeek({
      entrants: [...players, lateMid],
      eliminationIds: new Set(),
      mainCaptainIds: ["m0-top", "m1-top"],
      eliminationCaptainIds: [],
    });
    expect(plan.sittingOut.map((player) => player.id)).toEqual(["late-mid"]);
    expect(plan.entries.find((entry) => entry.entrant_id === "late-mid")?.tier).toBe("bench");
  });

  it("benches benched players and skips withdrawn and eliminated ones", () => {
    const players = [
      ...teamsOf(2, "m"),
      entrant("resting", "top", { status: "benched" }),
      entrant("gone", "top", { status: "withdrawn" }),
      entrant("out", "top", { status: "eliminated", eliminated_week: 3 }),
    ];
    const plan = planWeek({ entrants: players, eliminationIds: new Set(), mainCaptainIds: ["m0-top", "m1-top"], eliminationCaptainIds: [] });
    expect(plan.entries.find((entry) => entry.entrant_id === "resting")?.tier).toBe("bench");
    expect(plan.entries.some((entry) => entry.entrant_id === "gone" || entry.entrant_id === "out")).toBe(false);
  });

  it("reports captain and team-count problems", () => {
    const main = teamsOf(2, "m");
    const lone = [entrant("e-top", "top"), entrant("e-mid", "mid")];
    const plan = planWeek({
      entrants: [...main, ...lone],
      eliminationIds: new Set(lone.map((player) => player.id)),
      mainCaptainIds: ["m0-top", "e-top"],
      eliminationCaptainIds: [],
    });
    expect(plan.problems).toContain("A main captain is not in the main pool.");
    expect(plan.problems).toContain("2 main teams need 2 captains; 1 picked.");
    expect(plan.problems).toContain("The elimination tier needs at least two full teams.");
  });
});
