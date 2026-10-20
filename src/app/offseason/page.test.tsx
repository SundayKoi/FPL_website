import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LolRole } from "@/lib/draft/types";
import type { OffseasonStatRow } from "@/lib/offseason/ratings";
import type { OffseasonEntrant, OffseasonEventData } from "@/lib/offseason/types";
import { buildOffseasonView } from "@/lib/offseason/view";

const { loadOffseasonPage, notFound } = vi.hoisted(() => ({
  loadOffseasonPage: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));
vi.mock("@/lib/offseason/page", () => ({ loadOffseasonPage }));
// What the pages read beyond the event: MVP results, the viewer's own votes,
// card signatures and the tournament codes the viewer may read.
const db = vi.hoisted(() => ({
  mvpRows: [] as unknown[],
  myVotes: [] as unknown[],
  signatures: [] as unknown[],
  codes: [] as unknown[],
  codesFail: false,
  nominees: [] as unknown[],
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => ({
    rpc: async () => ({ data: db.mvpRows, error: null }),
    from: (table: string) => ({
      select: () => ({
        eq: async () => ({ data: db.myVotes, error: null }),
        in: async () =>
          table === "offseason_match_codes"
            ? db.codesFail
              ? { data: null, error: { message: "boom" } }
              : { data: db.codes, error: null }
            : {
                data: table === "offseason_signatures" ? db.signatures : table === "offseason_mvp_nominees" ? db.nominees : [],
                error: null,
              },
      }),
    }),
  }),
}));
vi.mock("next/navigation", () => ({ notFound, useRouter: () => ({ refresh: vi.fn() }) }));

import OffseasonPage from "./page";
import OffseasonPlayerPage from "./players/[id]/page";
import OffseasonSchedulePage from "./schedule/page";
import OffseasonStatsPage from "./stats/page";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  db.mvpRows = [];
  db.myVotes = [];
  db.signatures = [];
  db.codes = [];
  db.codesFail = false;
  db.nominees = [];
});

const ROLES: LolRole[] = ["top", "jungle", "mid", "adc", "support"];

function entrant(id: string, role: LolRole, overrides: Partial<OffseasonEntrant> = {}): OffseasonEntrant {
  return {
    id,
    event_id: "event",
    profile_id: null,
    display_name: id,
    riot_id: `${id}#OS1`,
    opgg_url: "javascript:alert(1)",
    current_rank: "Gold 1",
    primary_role: role,
    secondary_role: null,
    assigned_role: role,
    status: "active",
    eliminated_week: null,
    signed_up_at: `2026-10-01T00:00:0${ROLES.indexOf(role)}Z`,
    locked_in_role: null,
    locked_in_at: null,
    ...overrides,
  };
}

function fixture(): OffseasonEventData {
  const blue = ROLES.map((role) => entrant(`Blue ${role}`, role));
  const red = ROLES.map((role) => entrant(`Red ${role}`, role));
  return {
    event: { id: "event", name: "Offseason Cup", status: "running", signups_open: false, yardstick_season: "S6", created_at: "" },
    entrants: [...blue, ...red, entrant("Gone mid", "mid", { status: "eliminated", eliminated_week: 3 })],
    weeks: [{ id: "w1", event_id: "event", week_number: 1, status: "playing", elimination_per_role: 0, main_draft_id: "d1", elimination_draft_id: null, draft_at: "2026-10-19T00:00:00Z", games_at: "2026-10-20T00:00:00Z", created_at: "" }],
    entries: [],
    teams: [
      { id: "tb", week_id: "w1", tier: "main", name: "Team Blue", captain_entrant_id: "Blue top", draft_team_id: null, eliminated: false },
      { id: "tr", week_id: "w1", tier: "main", name: "Team Red", captain_entrant_id: "Red top", draft_team_id: null, eliminated: false },
    ],
    members: [
      ...blue.map((player) => ({ team_id: "tb", entrant_id: player.id, role: player.assigned_role!, price: 5 })),
      ...red.map((player) => ({ team_id: "tr", entrant_id: player.id, role: player.assigned_role!, price: 5 })),
    ],
    matches: [{ id: "m1", week_id: "w1", stage: "round_robin", sort_order: 1, team_a_id: "tb", team_b_id: "tr", best_of: 1, winner_team_id: "tb" }],
    games: [{ id: "g1", match_id: "m1", game_number: 1, riot_match_id: "NA1_1000000001", winner_team_id: "tb", ingested_at: "2026-10-20", ingest_error: null }],
  };
}

describe("offseason pages", () => {
  it("shows a placeholder before the event exists", async () => {
    loadOffseasonPage.mockResolvedValue({ view: null, userId: null, isStaff: false, ownEntry: null });
    render(await OffseasonPage());
    expect(screen.getByText(/has not been set up yet/i)).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Admin" })).toBeNull();
  });

  it("renders the week, standings and leaderboards", async () => {
    const view = buildOffseasonView(fixture(), []);
    loadOffseasonPage.mockResolvedValue({ view, userId: null, isStaff: true, ownEntry: null });
    render(await OffseasonPage());
    expect(screen.getByRole("heading", { name: "Offseason Cup" })).toBeTruthy();
    const week = screen.getByRole("heading", { name: "Week 1" }).closest("section")!;
    expect(within(week).getAllByText("Team Blue").length).toBeGreaterThan(0);
    expect(within(week).getByText("Round robin", { selector: "h3" })).toBeTruthy();
    // Staff set the week's times; they read in Eastern Time.
    expect(within(week).getByText("Sun, Oct 18, 8:00 PM EDT")).toBeTruthy();
    expect(within(week).getByText("Mon, Oct 19, 8:00 PM EDT")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Eliminated" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Admin" }).getAttribute("href")).toBe("/offseason/admin");
  });

  it("asks a player with a role to lock in, and leaves spectators alone once everyone has", async () => {
    const view = buildOffseasonView(fixture(), []);
    const me = view.entrants.find((player) => player.id === "Blue mid")!;
    loadOffseasonPage.mockResolvedValue({ view, userId: "me", isStaff: false, ownEntry: me });
    const { unmount } = render(await OffseasonPage());
    expect(screen.getByRole("button", { name: "Lock in as Mid" })).toBeTruthy();
    unmount();

    const done = fixture();
    done.entrants = done.entrants.map((player) => ({ ...player, locked_in_role: player.assigned_role, locked_in_at: "2026-10-02" }));
    loadOffseasonPage.mockResolvedValue({ view: buildOffseasonView(done, []), userId: null, isStaff: false, ownEntry: null });
    render(await OffseasonPage());
    expect(screen.queryByRole("heading", { name: "Lock in your role" })).toBeNull();
  });

  it("renders a player's page without trusting their op.gg link", async () => {
    const view = buildOffseasonView(fixture(), []);
    loadOffseasonPage.mockResolvedValue({ view, userId: null, isStaff: false, ownEntry: null });
    render(await OffseasonPlayerPage({ params: Promise.resolve({ id: "Blue mid" }) }));
    expect(screen.getByRole("heading", { name: "Blue mid" })).toBeTruthy();
    expect(screen.getByText(/Won 1–0/)).toBeTruthy();
    expect(screen.queryByRole("link", { name: /op\.gg/ })).toBeNull();
  });

  it("shows each match with its sides and who faces whom in every lane", async () => {
    loadOffseasonPage.mockResolvedValue({ view: buildOffseasonView(fixture(), []), userId: null, isStaff: false, ownEntry: null });
    render(await OffseasonSchedulePage());
    const week = screen.getByRole("heading", { name: "Week 1" }).closest("section")!;
    const match = within(week).getByText("Team Blue").closest("li")!;
    // Team A plays blue side, team B red.
    expect(within(match).getByText("Blue")).toBeTruthy();
    expect(within(match).getByText("Red")).toBeTruthy();
    expect(within(match).getByText("1 – 0")).toBeTruthy();
    const midLane = within(match).getByRole("link", { name: "Blue mid" }).closest("li")!;
    expect(within(midLane).getByRole("link", { name: "Red mid" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Schedule" }).getAttribute("aria-current")).toBe("page");
    expect(within(week).getByText("Sun, Oct 18, 8:00 PM EDT")).toBeTruthy();
  });

  it("groups a round robin's matches by game", async () => {
    const data = fixture();
    data.teams.push(
      { id: "tc", week_id: "w1", tier: "main", name: "Team Cyan", captain_entrant_id: null, draft_team_id: null, eliminated: false },
      { id: "td", week_id: "w1", tier: "main", name: "Team Dusk", captain_entrant_id: null, draft_team_id: null, eliminated: false },
    );
    const rr = (id: string, a: string, b: string, sort: number) => ({ id, week_id: "w1", stage: "round_robin" as const, sort_order: sort, team_a_id: a, team_b_id: b, best_of: 1 as const, winner_team_id: null });
    data.matches = [rr("m1", "tb", "tr", 1), rr("m2", "tc", "td", 2), rr("m3", "tb", "tc", 3), rr("m4", "tr", "td", 4)];
    data.games = [];
    loadOffseasonPage.mockResolvedValue({ view: buildOffseasonView(data, []), userId: null, isStaff: false, ownEntry: null });
    render(await OffseasonSchedulePage());
    expect(screen.getByRole("heading", { name: "Game 1" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Game 2" })).toBeTruthy();
    const first = screen.getByRole("list", { name: "Round robin game 1" });
    const second = screen.getByRole("list", { name: "Round robin game 2" });
    expect(within(first).getAllByText(/Team (Blue|Red|Cyan|Dusk)/).map((el) => el.textContent)).toEqual(["Team Blue", "Team Red", "Team Cyan", "Team Dusk"]);
    expect(within(second).getAllByText(/Team (Blue|Red|Cyan|Dusk)/).map((el) => el.textContent)).toEqual(["Team Blue", "Team Cyan", "Team Red", "Team Dusk"]);
  });

  it("explains an empty schedule", async () => {
    loadOffseasonPage.mockResolvedValue({ view: null, userId: null, isStaff: false, ownEntry: null });
    render(await OffseasonSchedulePage());
    expect(screen.getByText(/appears once the first week is drafted/)).toBeTruthy();
  });

  it("lets a member vote for the open week's MVP, but not for themselves", async () => {
    const data = fixture();
    data.entrants = data.entrants.map((player) => (player.id === "Blue mid" ? { ...player, profile_id: "me" } : player));
    const view = buildOffseasonView(data, []);
    db.mvpRows = [{ week_id: "w1", entrant_id: null, votes: 3, final: false }];
    db.myVotes = [{ week_id: "w1", entrant_id: "Red adc" }];
    db.nominees = [
      { week_id: "w1", entrant_id: "Red mid", position: 2 },
      { week_id: "w1", entrant_id: "Blue mid", position: 1 },
      { week_id: "w1", entrant_id: "Red adc", position: 3 },
    ];
    loadOffseasonPage.mockResolvedValue({ view, userId: "me", isStaff: false, ownEntry: view.entrantsById.get("Blue mid") });
    render(await OffseasonPage());
    const panel = screen.getByRole("heading", { name: "Week 1 MVP" }).closest("section")!;
    // Staff's nominees, in their order, and nobody else.
    expect(within(panel).getAllByRole("article").map((column) => column.getAttribute("aria-label"))).toEqual(["Blue mid", "Red mid", "Red adc"]);
    expect(within(panel).queryByRole("button", { name: "Vote for Red top" })).toBeNull();
    expect(within(panel).getByText(/3 votes so far/)).toBeTruthy();
    expect(within(panel).queryByRole("button", { name: "Vote for Blue mid" })).toBeNull();
    expect(within(panel).getByText("You")).toBeTruthy();
    expect(within(panel).getByRole("button", { name: "Vote for Red mid" })).toBeTruthy();
    expect(within(panel).getByRole("button", { name: "Your vote: Red adc" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("link", { name: "Sign your card" }).getAttribute("href")).toBe("/offseason/card");
  });

  it("says the nominees are coming when voting is open but staff haven't picked them", async () => {
    db.mvpRows = [{ week_id: "w1", entrant_id: null, votes: 0, final: false }];
    loadOffseasonPage.mockResolvedValue({ view: buildOffseasonView(fixture(), []), userId: "me", isStaff: true, ownEntry: null });
    render(await OffseasonPage());
    const panel = screen.getByRole("heading", { name: "Week 1 MVP" }).closest("section")!;
    expect(within(panel).getByText(/Staff are picking week 1's MVP nominees/)).toBeTruthy();
    expect(within(panel).getByRole("link", { name: "Pick them in the admin" }).getAttribute("href")).toBe("/offseason/admin");
    expect(within(panel).queryByRole("button")).toBeNull();
  });

  it("says MVP voting opens once a week being played is complete", async () => {
    loadOffseasonPage.mockResolvedValue({ view: buildOffseasonView(fixture(), []), userId: "me", isStaff: false, ownEntry: null });
    render(await OffseasonPage());
    const panel = screen.getByRole("heading", { name: "Week 1 MVP" }).closest("section")!;
    expect(within(panel).getByText("Voting opens once week 1's games are complete.")).toBeTruthy();
    expect(within(panel).queryByRole("button")).toBeNull();
  });

  it("names each closed week's MVP, ties included", async () => {
    db.mvpRows = [
      { week_id: "w1", entrant_id: "Red adc", votes: 4, final: true },
      { week_id: "w1", entrant_id: "Blue top", votes: 4, final: true },
      { week_id: "w1", entrant_id: "Blue mid", votes: 1, final: true },
    ];
    const data = fixture();
    data.weeks = data.weeks.map((week) => ({ ...week, status: "complete" as const }));
    loadOffseasonPage.mockResolvedValue({ view: buildOffseasonView(data, []), userId: null, isStaff: false, ownEntry: null });
    render(await OffseasonPage());
    expect(screen.queryByRole("heading", { name: "Week 1 MVP" })).toBeNull();
    const panel = screen.getByRole("heading", { name: "MVPs" }).closest("section")!;
    expect(within(panel).getAllByRole("link").map((link) => link.textContent)).toEqual(["Blue top", "Red adc"]);
    expect(within(panel).getByText(/4 of 9 votes each/)).toBeTruthy();
  });

  it("shows a player their own matches with a code for each game", async () => {
    const data = fixture();
    data.entrants = data.entrants.map((player) => (player.id === "Blue mid" ? { ...player, profile_id: "me" } : player));
    data.matches = data.matches.map((match) => ({ ...match, winner_team_id: null }));
    data.games = [];
    const view = buildOffseasonView(data, []);
    db.codes = [{ id: "c1", event_id: "event", seq: 1, code: "NA05109-abc", match_id: "m1", game_number: 1 }];
    loadOffseasonPage.mockResolvedValue({ view, userId: "me", isStaff: false, ownEntry: view.entrantsById.get("Blue mid") });
    render(await OffseasonPage());
    const panel = screen.getByRole("heading", { name: "Your matches" }).closest("section")!;
    expect(within(panel).getByText("Team Blue")).toBeTruthy();
    expect(within(panel).getByText("Team Red")).toBeTruthy();
    expect(within(panel).getByText("Round robin · Game 1")).toBeTruthy();
    expect(within(panel).getByText("NA05109-abc")).toBeTruthy();
    expect(within(panel).getByRole("button", { name: "Copy code for Team Red" })).toBeTruthy();
  });

  it("shows no codes to anyone who isn't playing, and says so when the codes fail to load", async () => {
    const data = fixture();
    data.matches = data.matches.map((match) => ({ ...match, winner_team_id: null }));
    data.games = [];
    const view = buildOffseasonView(data, []);
    db.codes = [{ id: "c1", event_id: "event", seq: 1, code: "NA05109-abc", match_id: "m1", game_number: 1 }];
    loadOffseasonPage.mockResolvedValue({ view, userId: "me", isStaff: true, ownEntry: null });
    const { unmount } = render(await OffseasonPage());
    expect(screen.queryByRole("heading", { name: "Your matches" })).toBeNull();
    expect(screen.queryByText("NA05109-abc")).toBeNull();
    unmount();

    db.codesFail = true;
    loadOffseasonPage.mockResolvedValue({ view, userId: "me", isStaff: false, ownEntry: view.entrantsById.get("Red top") });
    render(await OffseasonPage());
    const panel = screen.getByRole("heading", { name: "Your matches" }).closest("section")!;
    expect(within(panel).getByText(/didn't load/)).toBeTruthy();
  });

  it("offers a player the signing page from their own page", async () => {
    const data = fixture();
    data.entrants = data.entrants.map((player) => (player.id === "Blue mid" ? { ...player, profile_id: "me" } : player));
    loadOffseasonPage.mockResolvedValue({ view: buildOffseasonView(data, []), userId: "me", isStaff: false, ownEntry: null });
    render(await OffseasonPlayerPage({ params: Promise.resolve({ id: "Blue mid" }) }));
    expect(screen.getByRole("link", { name: "Sign your card" }).getAttribute("href")).toBe("/offseason/card");
    cleanup();

    render(await OffseasonPlayerPage({ params: Promise.resolve({ id: "Red mid" }) }));
    expect(screen.queryByRole("link", { name: /sign your card/i })).toBeNull();
  });

  it("credits a sub's game to the player they replaced, and says who played", async () => {
    const row = (name: string, role: string) =>
      ({ summoner_name: name, tag: name === "Ringer" ? "XYZ" : "OS1", role, champion: "Ahri", win: true, game_date: "2026-10-20", match_id: "NA1_1000000001", team_name: "Team Blue", team_side: "Blue", game_duration_min: 30, kills: 4, deaths: 1, assists: 9, cs: 200 }) as OffseasonStatRow;
    const view = buildOffseasonView(fixture(), [row("Blue top", "TOP"), row("Ringer", "MIDDLE")]);
    loadOffseasonPage.mockResolvedValue({ view, userId: null, isStaff: false, ownEntry: null });
    render(await OffseasonPlayerPage({ params: Promise.resolve({ id: "Blue mid" }) }));
    const games = screen.getByRole("heading", { name: "Games" }).closest("section")!;
    expect(within(games).getByText("(sub: Ringer#XYZ)")).toBeTruthy();
    expect(within(games).getByText("4 / 1 / 9")).toBeTruthy();
  });

  it("shows a player's season record before they have an Overall", async () => {
    // Week 1's one game went to Team Blue; nothing is ingested, so nobody is rated.
    loadOffseasonPage.mockResolvedValue({ view: buildOffseasonView(fixture(), []), userId: null, isStaff: false, ownEntry: null });
    render(await OffseasonPlayerPage({ params: Promise.resolve({ id: "Red top" }) }));
    const overall = screen.getByRole("heading", { name: "Overall" }).closest("section")!;
    expect(within(overall).getByText("Season record")).toBeTruthy();
    expect(within(overall).getByText("0–1")).toBeTruthy();
    expect(within(overall).getByText(/No rated games yet/)).toBeTruthy();
  });

  it("says the stats are waiting on ingested games", async () => {
    loadOffseasonPage.mockResolvedValue({ view: buildOffseasonView(fixture(), []), userId: null, isStaff: false, ownEntry: null });
    render(await OffseasonStatsPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole("link", { name: "Stats" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByText(/No games from the event have been ingested yet/)).toBeTruthy();
  });

  it("shows a week's players, leaders and best games", async () => {
    const row = (name: string, kills: number, win: boolean) =>
      ({ summoner_name: name, tag: "OS1", role: "MIDDLE", champion: "Ahri", win, game_date: "2026-10-20", match_id: "NA1_1000000001", team_name: name.startsWith("Blue") ? "Team Blue" : "Team Red", team_side: name.startsWith("Blue") ? "Blue" : "Red", game_duration_min: 30, kills, deaths: 2, assists: 5, cs: 200 }) as OffseasonStatRow;
    const view = buildOffseasonView(fixture(), [row("Blue mid", 9, true), row("Red mid", 3, false)]);
    loadOffseasonPage.mockResolvedValue({ view, userId: null, isStaff: false, ownEntry: null });
    render(await OffseasonStatsPage({ searchParams: Promise.resolve({ week: "1" }) }));
    expect(screen.getByRole("link", { name: "Week 1" }).getAttribute("aria-current")).toBe("page");
    const table = screen.getByRole("heading", { name: "Players" }).closest("section")!;
    expect(within(table).getByText("2 with games in week 1")).toBeTruthy();
    expect(within(table).getAllByText("Team Blue").length).toBeGreaterThan(0);
    const best = screen.getByRole("heading", { name: "Best games" }).closest("section")!;
    expect(within(best).getAllByText("9 / 2 / 5").length).toBe(2);
  });

  it("404s an unknown player", async () => {
    loadOffseasonPage.mockResolvedValue({ view: buildOffseasonView(fixture(), []), userId: null, isStaff: false, ownEntry: null });
    await expect(OffseasonPlayerPage({ params: Promise.resolve({ id: "nobody" }) })).rejects.toThrow("NOT_FOUND");
  });
});
