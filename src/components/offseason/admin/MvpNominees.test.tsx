import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WeekLine } from "@/lib/offseason/mvp";
import type { OffseasonEntrant, OffseasonWeek } from "@/lib/offseason/types";
import type { OffseasonAdminData } from "./shared";

const { setMvpNomineesAction } = vi.hoisted(() => ({ setMvpNomineesAction: vi.fn() }));
vi.mock("@/lib/offseason/actions", () => ({ setMvpNomineesAction }));

import MvpNominees from "./MvpNominees";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const week: OffseasonWeek = { id: "w1", event_id: "event", week_number: 1, status: "complete", elimination_per_role: 0, main_draft_id: null, elimination_draft_id: null, draft_at: null, games_at: null, created_at: "" };

function line(overall: number | null, games: number): WeekLine {
  return { overall, games, wins: 0, losses: 0, kills: 0, deaths: 0, assists: 0, kda: 0, csPerMin: null, damagePerMin: null, visionPerMin: null, champions: [] };
}

function data(nominees: string[] = []): OffseasonAdminData {
  const players = ["Ace", "Brick", "Comet", "Dud"];
  return {
    event: { id: "event", name: "Cup", status: "running", signups_open: false, yardstick_season: "S6", created_at: "" },
    entrants: players.map((id) => ({ id, display_name: id }) as OffseasonEntrant),
    weeks: [week],
    entries: [],
    teams: [{ id: "t1", week_id: "w1", tier: "main", name: "Team Ace", captain_entrant_id: "Ace", draft_team_id: null, eliminated: false }],
    members: (["top", "jungle", "mid", "adc"] as const).map((role, index) => ({ team_id: "t1", entrant_id: players[index], role, price: 1 })),
    matches: [],
    games: [],
    ratings: {},
    drafts: {},
    codes: [],
    subs: [],
    mvp: {
      nominees: nominees.map((entrant_id, index) => ({ week_id: "w1", entrant_id, position: index + 1 })),
      lines: { w1: { Ace: line(80, 3), Brick: line(91, 3), Comet: line(85, 2), Dud: line(null, 0) } },
    },
  };
}

describe("MvpNominees", () => {
  it("suggests the week's three best and saves them in order", async () => {
    setMvpNomineesAction.mockResolvedValue({ ok: true });
    render(<MvpNominees data={data()} week={week} />);
    expect(screen.getByText("91 OVR · 3 games")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Suggest top 3" }));
    expect(screen.getByText("3 picked: Brick, Comet, Ace")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save nominees" }));
    await waitFor(() => expect(setMvpNomineesAction).toHaveBeenCalledWith("w1", ["Brick", "Comet", "Ace"]));
    expect(await screen.findByText("Nominees saved.")).toBeTruthy();
  });

  it("needs at least two, and can clear saved nominees", async () => {
    setMvpNomineesAction.mockResolvedValue({ ok: true });
    render(<MvpNominees data={data(["Ace", "Dud"])} week={week} />);
    expect((screen.getByRole("checkbox", { name: "Nominate Ace" }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: "Nominate Dud" }));
    expect(screen.getByText(/Pick at least one more/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Save nominees" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: "Nominate Ace" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear nominees" }));
    await waitFor(() => expect(setMvpNomineesAction).toHaveBeenCalledWith("w1", []));
  });
});
