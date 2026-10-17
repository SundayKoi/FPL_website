import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LolRole } from "@/lib/draft/types";
import type { OffseasonEntrant, OffseasonWeek } from "@/lib/offseason/types";
import type { OffseasonAdminData } from "./shared";

const { setWeekEntriesAction, createWeekDraftAction } = vi.hoisted(() => ({
  setWeekEntriesAction: vi.fn(),
  createWeekDraftAction: vi.fn(),
}));
vi.mock("@/lib/offseason/actions", () => ({ setWeekEntriesAction, createWeekDraftAction }));

import WeekSetup from "./WeekSetup";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const ROLES: LolRole[] = ["top", "jungle", "mid", "adc", "support"];
const week: OffseasonWeek = {
  id: "w3",
  event_id: "event",
  week_number: 3,
  status: "setup",
  elimination_per_role: 0,
  main_draft_id: null,
  elimination_draft_id: null,
  created_at: "",
};

function entrant(id: string, role: LolRole, n: number): OffseasonEntrant {
  return {
    id,
    event_id: "event",
    profile_id: `profile-${id}`,
    display_name: id,
    riot_id: `${id}#OS1`,
    opgg_url: null,
    current_rank: null,
    primary_role: role,
    secondary_role: null,
    assigned_role: role,
    status: "active",
    eliminated_week: null,
    signed_up_at: `2026-10-01T00:00:${String(n).padStart(2, "0")}Z`,
    locked_in_role: null,
    locked_in_at: null,
  };
}

function data(): OffseasonAdminData {
  // Eight players a role: ratings 90, 80, ... 20 in team order.
  const entrants = [0, 1, 2, 3, 4, 5, 6, 7].flatMap((team) => ROLES.map((role, r) => entrant(`${role}-${team}`, role, team * 5 + r)));
  const ratings = Object.fromEntries(
    entrants.map((player) => [player.id, { overall: 90 - Number(player.id.split("-")[1]) * 10, games: 3, wins: 1, losses: 2 }]),
  );
  return { event: { id: "event", name: "Cup", status: "running", signups_open: false, yardstick_season: "S6", created_at: "" }, entrants, weeks: [week], entries: [], teams: [], members: [], matches: [], games: [], ratings, drafts: {} };
}

describe("WeekSetup", () => {
  it("puts the bottom four of each role in the elimination tier, captained by its best, and locks the week", async () => {
    setWeekEntriesAction.mockResolvedValue({ ok: true });
    render(<WeekSetup data={data()} week={week} />);

    fireEvent.click(screen.getByRole("button", { name: "Propose tiers and captains" }));
    expect(screen.getByText("Main captains (4 teams)")).toBeTruthy();
    expect(screen.getByText("Elimination captains (4 teams)")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Lock tiers" }));
    await waitFor(() => expect(setWeekEntriesAction).toHaveBeenCalledTimes(1));
    const [weekId, entries] = setWeekEntriesAction.mock.calls[0] as [string, { entrant_id: string; tier: string; captain_seat: number | null }[]];
    expect(weekId).toBe("w3");
    expect(entries).toHaveLength(40);
    const tierOf = (id: string) => entries.find((entry) => entry.entrant_id === id)!;
    // The four lowest rated in every role drop into the elimination tier.
    expect(["mid-4", "mid-5", "mid-6", "mid-7"].map((id) => tierOf(id).tier)).toEqual(Array(4).fill("elimination"));
    expect(tierOf("mid-3").tier).toBe("main");
    // Each tier is captained by its own highest rated: the -0 players for the
    // main tier, the -4 players (best of the bottom four) for elimination.
    const captains = (tier: string) => entries.filter((entry) => entry.tier === tier && entry.captain_seat).map((entry) => entry.entrant_id);
    expect(captains("main")).toHaveLength(4);
    expect(captains("main").every((id) => id.endsWith("-0"))).toBe(true);
    expect(captains("elimination")).toHaveLength(4);
    expect(captains("elimination").every((id) => id.endsWith("-4"))).toBe(true);
  });

  it("keeps the elimination tier closed before week 3", () => {
    render(<WeekSetup data={data()} week={{ ...week, id: "w2", week_number: 2 }} />);
    expect((screen.getByRole("button", { name: "Propose tiers and captains" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("will not lock a week whose captains are missing", () => {
    render(<WeekSetup data={data()} week={week} />);
    expect(screen.getByText("8 main teams need 8 captains; 0 picked.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Lock tiers" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
