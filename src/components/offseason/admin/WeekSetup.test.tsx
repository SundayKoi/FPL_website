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

import WeekSetup, { DraftCreator } from "./WeekSetup";

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
  draft_at: null,
  games_at: null,
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

function data(overrides: Record<string, number> = {}): OffseasonAdminData {
  // Eight players a role: ratings 90, 80, ... 20 in team order.
  const entrants = [0, 1, 2, 3, 4, 5, 6, 7].flatMap((team) => ROLES.map((role, r) => entrant(`${role}-${team}`, role, team * 5 + r)));
  const ratings = Object.fromEntries(
    entrants.map((player) => [
      player.id,
      { overall: overrides[player.id] ?? 90 - Number(player.id.split("-")[1]) * 10, games: 3, wins: 1, losses: 2 },
    ]),
  );
  return { event: { id: "event", name: "Cup", status: "running", signups_open: false, yardstick_season: "S6", created_at: "" }, entrants, weeks: [week], entries: [], teams: [], members: [], matches: [], games: [], ratings, drafts: {}, codes: [], subs: [] };
}

describe("WeekSetup", () => {
  it("puts the bottom four of each role in the elimination tier, captained by the best of each role, and locks the week", async () => {
    setWeekEntriesAction.mockResolvedValue({ ok: true });
    // In the bottom four, mid-5 (48) outrates top-4, jungle-4 and adc-4 (45).
    // The top four overall would captain two mids; by role only mid-4 does.
    render(<WeekSetup data={data({ "mid-5": 48, "top-4": 45, "jungle-4": 45, "adc-4": 45, "support-4": 44 })} week={week} />);

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
    // The main tier is captained by its highest rated overall, the -0 players.
    // The elimination tier is captained by the best of each of its roles, the
    // -4 players, less the lowest rated of those five (support-4).
    const captains = (tier: string) => entries.filter((entry) => entry.tier === tier && entry.captain_seat).map((entry) => entry.entrant_id);
    expect(captains("main")).toHaveLength(4);
    expect(captains("main").every((id) => id.endsWith("-0"))).toBe(true);
    expect(captains("elimination").sort()).toEqual(["adc-4", "jungle-4", "mid-4", "top-4"]);
  });

  it("suggests elimination captains by role", () => {
    render(<WeekSetup data={data({ "mid-5": 48 })} week={week} />);
    fireEvent.click(screen.getByRole("button", { name: "Propose tiers and captains" }));
    expect(screen.getByRole("button", { name: "Suggest best per role" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Suggest top rated" })).toHaveLength(1);
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

describe("DraftCreator", () => {
  // Two locked main captains, seated jungle-0 then top-0.
  const locked = () => {
    const base = data();
    return {
      ...base,
      entries: [
        { week_id: "w3", entrant_id: "jungle-0", tier: "main" as const, captain_seat: 1 },
        { week_id: "w3", entrant_id: "top-0", tier: "main" as const, captain_seat: 2 },
        { week_id: "w3", entrant_id: "mid-1", tier: "main" as const, captain_seat: null },
      ],
    };
  };

  it("takes a cost for each captain, each at least 1 and leaving a point for every other role", async () => {
    createWeekDraftAction.mockResolvedValue({ ok: true });
    render(<DraftCreator data={locked()} week={week} tier="main" disabled={false} />);
    const create = screen.getByRole("button", { name: "Create main draft" }) as HTMLButtonElement;
    expect(screen.getAllByLabelText(/^Cost for /).map((input) => input.getAttribute("aria-label"))).toEqual(["Cost for jungle-0", "Cost for top-0"]);
    expect(create.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("Cost for jungle-0"), { target: { value: "20" } });
    expect(create.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Cost for top-0"), { target: { value: "0" } });
    expect(create.disabled).toBe(true);
    expect(screen.getByText(/Each captain costs at least 1 point/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Cost for top-0"), { target: { value: "97" } });
    expect(create.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("Cost for top-0"), { target: { value: "12" } });
    expect(create.disabled).toBe(false);
    fireEvent.click(create);
    await waitFor(() =>
      expect(createWeekDraftAction).toHaveBeenCalledWith("w3", "main", {
        budget: 100,
        countdownSeconds: 15,
        captainCosts: { "jungle-0": 20, "top-0": 12 },
      }),
    );
  });

  it("copies the first captain's cost to everyone", () => {
    render(<DraftCreator data={locked()} week={week} tier="main" disabled={false} />);
    fireEvent.change(screen.getByLabelText("Cost for jungle-0"), { target: { value: "15" } });
    fireEvent.click(screen.getByRole("button", { name: "Use 15 for all" }));
    expect((screen.getByLabelText("Cost for top-0") as HTMLInputElement).value).toBe("15");
    expect((screen.getByRole("button", { name: "Create main draft" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("waits for the tier's captains to be locked", () => {
    render(<DraftCreator data={data()} week={week} tier="elimination" disabled={false} />);
    expect(screen.getByText(/Lock this tier's captains first/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Create elimination draft" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
