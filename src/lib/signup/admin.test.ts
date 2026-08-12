import { describe, expect, it } from "vitest";
import { duplicateSignupIds, signupsToCsv } from "./admin";
import type { SignupRow } from "./types";

function signup(overrides: Partial<SignupRow> & { id: string }): SignupRow {
  return {
    season: "S5",
    discord: "someone",
    riot_id: "Name#NA1",
    opgg: "https://op.gg/lol/summoners/na/Name-NA1",
    current_rank: "Diamond 4",
    peak_rank: "Diamond 1",
    primary_role: "mid",
    secondary_role: null,
    captain_interest: false,
    player_status: "new",
    created_at: "2026-08-12T00:00:00Z",
    ...overrides,
  };
}

describe("duplicateSignupIds", () => {
  it("flags both sides of a repeated Discord handle, case-insensitively", () => {
    const rows = [
      signup({ id: "a", discord: "GratxAce", riot_id: "One#NA1" }),
      signup({ id: "b", discord: "  gratxace ", riot_id: "Two#NA1" }),
      signup({ id: "c", discord: "someone-else", riot_id: "Three#NA1" }),
    ];
    expect(duplicateSignupIds(rows)).toEqual(new Set(["a", "b"]));
  });

  it("flags a repeated Riot ID even when Discord handles differ", () => {
    const rows = [
      signup({ id: "a", discord: "one", riot_id: "Shared#NA1" }),
      signup({ id: "b", discord: "two", riot_id: "shared#na1" }),
    ];
    expect(duplicateSignupIds(rows)).toEqual(new Set(["a", "b"]));
  });

  it("keeps seasons separate so returning players aren't flagged", () => {
    const rows = [
      signup({ id: "a", season: "S4" }),
      signup({ id: "b", season: "S5" }),
    ];
    expect(duplicateSignupIds(rows).size).toBe(0);
  });

  it("returns an empty set for a clean pool", () => {
    const rows = [
      signup({ id: "a", discord: "one", riot_id: "One#NA1" }),
      signup({ id: "b", discord: "two", riot_id: "Two#NA1" }),
    ];
    expect(duplicateSignupIds(rows).size).toBe(0);
  });
});

describe("signupsToCsv", () => {
  it("emits a header row plus one quoted row per signup", () => {
    const csv = signupsToCsv([
      signup({ id: "a", discord: "gratxace", secondary_role: "adc", captain_interest: true }),
    ]);
    const lines = csv.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('"Discord"');
    expect(lines[1]).toContain('"gratxace"');
    expect(lines[1]).toContain('"adc"');
    expect(lines[1]).toContain('"Yes"');
  });

  it("escapes embedded quotes and flattens multi-line op.gg entries", () => {
    const csv = signupsToCsv([
      signup({ id: "a", discord: 'we"ird', opgg: "https://a.gg/one\nhttps://a.gg/two" }),
    ]);
    expect(csv).toContain('"we""ird"');
    expect(csv).toContain('"https://a.gg/one https://a.gg/two"');
  });
});
