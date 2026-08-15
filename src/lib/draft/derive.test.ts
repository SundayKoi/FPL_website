import { describe, expect, it } from "vitest";
import { bidBlockReason, maxBid, nominateBlockReason, openRoles } from "./derive";
import type { Draft, Lot, Player, Team } from "./types";

const team = (over: Partial<Team> = {}): Team => ({
  id: "t1", draft_id: "d", name: "A", captain_profile_id: "p1",
  abbreviation: "A", image_url: null, banner_color: "#083344", division: null,
  nomination_position: 1, budget_start: 100, points_remaining: 20, ...over,
  captain_profile_id_2: over.captain_profile_id_2 ?? null,
});
const player = (over: Partial<Player> = {}): Player => ({
  id: "pl", draft_id: "d", display_name: "X", role: "mid", rank: null,
  opgg_url: null, notes: null, team_id: null, price: null, acquisition: null, ...over,
});
const lot = (over: Partial<Lot> = {}): Lot => ({
  id: "l1", draft_id: "d", player_id: "pl", nominated_by_team_id: "t2",
  round: 1, opening_bid: 10, current_bid: 10, leading_team_id: "t2",
  closes_at: new Date().toISOString(), status: "open", created_at: "", closed_at: null, ...over,
});
const draft = (over: Partial<Draft> = {}): Draft => ({
  id: "d", name: "D", status: "live", countdown_seconds: 15,
  round_minimums: [10, 5, 1], current_round: 1,
  current_nominator_team_id: "t1", paused_time_remaining: null, created_at: "", ...over,
});

// roster: my team already holds top+jungle
const roster = [
  player({ id: "r1", role: "top", team_id: "t1", acquisition: "captain", price: 0 }),
  player({ id: "r2", role: "jungle", team_id: "t1", acquisition: "free_agency", price: 0 }),
];

describe("openRoles / maxBid", () => {
  it("lists unfilled roles in order", () => {
    expect(openRoles("t1", roster)).toEqual(["mid", "adc", "support"]);
  });
  it("cap keeps a point per other open role", () => {
    expect(maxBid(team(), roster)).toBe(18); // 20 - (3-1)
  });
});

describe("bidBlockReason", () => {
  const p = player();
  it("allows a legal raise", () => {
    expect(bidBlockReason(team(), lot(), p, roster, 11)).toBeNull();
  });
  it("blocks the current leader", () => {
    expect(bidBlockReason(team(), lot({ leading_team_id: "t1" }), p, roster, 11)).toMatch(/high bid/);
  });
  it("blocks a filled role", () => {
    expect(bidBlockReason(team(), lot(), player({ role: "top" }), roster, 11)).toMatch(/already have/);
  });
  it("blocks a low raise and over-cap", () => {
    expect(bidBlockReason(team(), lot(), p, roster, 10)).toMatch(/at least 11/);
    expect(bidBlockReason(team(), lot(), p, roster, 19)).toMatch(/max bid is 18/);
  });
});

describe("nominateBlockReason", () => {
  it("allows the nominator a needed role they can afford", () => {
    expect(nominateBlockReason(team(), player(), draft(), roster)).toBeNull();
  });
  it("blocks when not your turn / player taken / role filled", () => {
    expect(nominateBlockReason(team(), player(), draft({ current_nominator_team_id: "t2" }), roster)).toMatch(/turn/);
    expect(nominateBlockReason(team(), player({ team_id: "t9" }), draft(), roster)).toMatch(/taken/);
    expect(nominateBlockReason(team(), player({ role: "top" }), draft(), roster)).toMatch(/already have/);
  });
  it("blocks when the round minimum exceeds the cap", () => {
    expect(nominateBlockReason(team({ points_remaining: 11 }), player(), draft(), roster)).toMatch(/afford/);
  });
});
