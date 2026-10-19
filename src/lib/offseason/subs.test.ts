import { describe, expect, it } from "vitest";
import type { LolRole } from "@/lib/draft/types";
import type { OffseasonStatRow } from "./ratings";
import { attributeSubs } from "./subs";
import type { OffseasonEntrant, OffseasonEventData } from "./types";
import { buildOffseasonView } from "./view";

const ROLES: LolRole[] = ["top", "jungle", "mid", "adc", "support"];
const POSITION: Record<LolRole, string> = { top: "TOP", jungle: "JUNGLE", mid: "MIDDLE", adc: "BOTTOM", support: "UTILITY" };
const RIOT_MATCH = "NA1_1000000001";

function statRow(name: string, tag: string, role: string, side: "Blue" | "Red"): OffseasonStatRow {
  return {
    summoner_name: name,
    tag,
    season: "OFFSEASON",
    season_phase: "Offseason",
    role,
    champion: "Ahri",
    game_date: "2026-10-20",
    match_id: RIOT_MATCH,
    team_name: `Team ${side}`,
    team_side: side,
    game_duration_min: 30,
    kills: side === "Blue" ? 6 : 3,
    deaths: side === "Blue" ? 2 : 5,
    assists: 7,
    solo_kills: 1,
    kill_participation_pct: 55,
    cs: 220,
    cs_per_min: 7.3,
    gold_earned: 11_000,
    gold_per_min: 370,
    total_damage_to_champions: 18_000,
    damage_per_min: 600,
    damage_share_pct: 20,
    vision_score: 25,
    vision_score_per_min: 0.8,
    turret_plates_destroyed: 1,
    double_kills: 0,
    triple_kills: 0,
    quadra_kills: 0,
    penta_kills: 0,
    cs_at_10: 70,
    gold_at_10: 3_200,
    xp_at_10: 4_500,
    damage_taken_per_min: 500,
    kda_challenges: 4,
    first_blood_kill: false,
    first_blood_assist: false,
    win: side === "Blue",
  } as OffseasonStatRow;
}

function entrant(id: string, role: LolRole): OffseasonEntrant {
  return {
    id,
    event_id: "event",
    profile_id: null,
    display_name: id,
    riot_id: `${id}#OS1`,
    opgg_url: null,
    current_rank: null,
    primary_role: role,
    secondary_role: null,
    assigned_role: role,
    status: "active",
    eliminated_week: null,
    signed_up_at: "2026-10-01T00:00:00Z",
    locked_in_role: null,
    locked_in_at: null,
  };
}

/** Team Blue (tb) beats Team Red (tr) in one Bo1, every rostered player in it. */
function event(): { data: OffseasonEventData; rows: OffseasonStatRow[] } {
  const players = (["Blue", "Red"] as const).flatMap((side) => ROLES.map((role) => entrant(`${side} ${role}`, role)));
  const data: OffseasonEventData = {
    event: { id: "event", name: "Cup", status: "running", signups_open: false, yardstick_season: "S6", created_at: "" },
    entrants: [...players, entrant("Bench mid", "mid")],
    weeks: [{ id: "w1", event_id: "event", week_number: 1, status: "playing", elimination_per_role: 0, main_draft_id: null, elimination_draft_id: null, draft_at: null, games_at: null, created_at: "" }],
    entries: [],
    teams: [
      { id: "tb", week_id: "w1", tier: "main", name: "Team Blue", captain_entrant_id: "Blue top", draft_team_id: null, eliminated: false },
      { id: "tr", week_id: "w1", tier: "main", name: "Team Red", captain_entrant_id: "Red top", draft_team_id: null, eliminated: false },
    ],
    members: players.map((player) => ({ team_id: player.id.startsWith("Blue") ? "tb" : "tr", entrant_id: player.id, role: player.assigned_role!, price: 5 })),
    matches: [{ id: "m1", week_id: "w1", stage: "round_robin", sort_order: 1, team_a_id: "tb", team_b_id: "tr", best_of: 1, winner_team_id: "tb" }],
    games: [{ id: "g1", match_id: "m1", game_number: 1, riot_match_id: RIOT_MATCH, winner_team_id: "tb", ingested_at: "2026-10-20", ingest_error: null }],
  };
  const rows = (["Blue", "Red"] as const).flatMap((side) => ROLES.map((role) => statRow(`${side} ${role}`, "OS1", POSITION[role], side)));
  return { data, rows };
}

/** The game with `name`'s row played by someone else. */
function subbed(rows: OffseasonStatRow[], name: string, by: string, tag: string, role?: string): OffseasonStatRow[] {
  return rows.map((row) => (row.summoner_name === name ? { ...row, summoner_name: by, tag, role: role ?? row.role } : row));
}

describe("attributeSubs", () => {
  it("credits each sub to the missing player in their role", () => {
    const { data, rows } = event();
    const played = subbed(subbed(rows, "Blue mid", "Ringer", "XYZ"), "Blue adc", "Smurf", "ABC");
    const { rows: credited, subs } = attributeSubs(data, played);
    expect(subs).toEqual([
      { riotMatchId: RIOT_MATCH, matchId: "m1", teamId: "tb", entrantId: "Blue mid", playedBy: "Ringer#XYZ" },
      { riotMatchId: RIOT_MATCH, matchId: "m1", teamId: "tb", entrantId: "Blue adc", playedBy: "Smurf#ABC" },
    ]);
    const mid = credited.find((row) => row.played_by === "Ringer#XYZ")!;
    expect([mid.summoner_name, mid.tag, mid.kills]).toEqual(["Blue mid", "OS1", 6]);
    expect(credited.filter((row) => !row.played_by)).toEqual(played.filter((row) => !["Ringer", "Smurf"].includes(row.summoner_name)));
  });

  it("pairs a sub whose role Riot didn't report with the only player missing", () => {
    const { data, rows } = event();
    const { subs } = attributeSubs(data, subbed(rows, "Red support", "Stand In", "NA1", ""));
    expect(subs.map((sub) => [sub.entrantId, sub.teamId])).toEqual([["Red support", "tr"]]);
  });

  it("counts another entrant who subs in as a sub, and the win as the replaced player's", () => {
    const { data, rows } = event();
    const played = subbed(rows, "Blue mid", "Bench mid", "OS1");
    const { subs } = attributeSubs(data, played);
    expect(subs.map((sub) => [sub.entrantId, sub.playedBy])).toEqual([["Blue mid", "Bench mid#OS1"]]);
    const view = buildOffseasonView(data, played);
    expect(view.ratings.get("Blue mid")).toMatchObject({ wins: 1, losses: 0 });
    expect(view.ratings.get("Bench mid")).toMatchObject({ wins: 0, losses: 0, games: 0 });
  });

  it("leaves subs it can't tell apart, and games the event doesn't know", () => {
    const { data, rows } = event();
    const swapped = subbed(subbed(rows, "Blue mid", "One", "A", ""), "Blue adc", "Two", "B", "");
    expect(attributeSubs(data, swapped).subs).toEqual([]);

    const elsewhere = subbed(rows, "Blue mid", "Ringer", "XYZ").map((row) => ({ ...row, match_id: "NA1_9999999999" }));
    const { rows: untouched, subs } = attributeSubs(data, elsewhere);
    expect(subs).toEqual([]);
    expect(untouched).toEqual(elsewhere);
  });

  it("puts a sub's game into the replaced player's rating, not a stranger's", () => {
    const { data, rows } = event();
    const view = buildOffseasonView(data, subbed(rows, "Blue mid", "Ringer", "XYZ"));
    expect(view.ratings.get("Blue mid")).toMatchObject({ games: 1, wins: 1, losses: 0 });
    expect(view.ratings.get("Blue mid")!.overall).not.toBeNull();
    expect(view.ratings.get("Bench mid")).toMatchObject({ games: 0, wins: 0, losses: 0 });
    expect(view.stats.some((row) => row.summoner_name === "Ringer")).toBe(false);
    expect(view.subs).toHaveLength(1);
  });
});
