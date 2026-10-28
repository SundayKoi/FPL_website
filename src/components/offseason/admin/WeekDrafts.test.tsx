import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EntryTier, OffseasonWeek } from "@/lib/offseason/types";
import type { OffseasonAdminData } from "./shared";

vi.mock("@/lib/offseason/actions", () => ({ importWeekDraftAction: vi.fn(), createWeekDraftAction: vi.fn() }));

import WeekDrafts from "./WeekDrafts";

afterEach(cleanup);

const base: OffseasonWeek = {
  id: "w3",
  event_id: "event",
  week_number: 3,
  status: "drafting",
  elimination_per_role: 4,
  main_draft_id: null,
  elimination_draft_id: null,
  draft_at: null,
  games_at: null,
  created_at: "",
};

function data(week: OffseasonWeek, tiers: EntryTier[]): OffseasonAdminData {
  return {
    event: { id: "event", name: "Cup", status: "running", signups_open: false, yardstick_season: "S6", created_at: "" },
    entrants: [],
    weeks: [week],
    entries: tiers.map((tier, n) => ({ week_id: week.id, entrant_id: `e${n}`, tier, captain_seat: null })),
    teams: [],
    members: [],
    matches: [],
    games: [],
    ratings: {},
    drafts: { "draft-main": { name: "Week 3 main", status: "setup" }, "draft-elim": { name: "Week 3 elimination", status: "setup" } },
    codes: [],
    subs: [],
    mvp: { nominees: [], lines: {} },
  };
}

describe("WeekDrafts", () => {
  it("offers the main draft once the elimination draft was created first", () => {
    const week = { ...base, elimination_draft_id: "draft-elim" };
    render(<WeekDrafts data={data(week, ["main", "elimination"])} week={week} />);
    expect(screen.getByText("Week 3 elimination")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create main draft" })).toBeTruthy();
  });

  it("offers the elimination draft once the main draft was created first", () => {
    const week = { ...base, main_draft_id: "draft-main" };
    render(<WeekDrafts data={data(week, ["main", "elimination"])} week={week} />);
    expect(screen.getByText("Week 3 main")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create elimination draft" })).toBeTruthy();
  });

  it("offers no draft for a tier the week does not have, or once the week is complete", () => {
    const mainOnly = { ...base, main_draft_id: "draft-main" };
    render(<WeekDrafts data={data(mainOnly, ["main"])} week={mainOnly} />);
    expect(screen.queryByRole("button", { name: /Create .* draft/ })).toBeNull();
    cleanup();
    const complete = { ...base, status: "complete" as const, elimination_draft_id: "draft-elim" };
    render(<WeekDrafts data={data(complete, ["main", "elimination"])} week={complete} />);
    expect(screen.queryByRole("button", { name: /Create .* draft/ })).toBeNull();
  });
});
