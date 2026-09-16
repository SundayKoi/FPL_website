import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const { staff, load, redirect } = vi.hoisted(() => ({ staff: vi.fn(), load: vi.fn(), redirect: vi.fn(() => {throw new Error("redirect");}) }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => ({}) }));
vi.mock("@/lib/auth/staffTier", () => ({ fetchStaffTier: staff }));
vi.mock("@/lib/league/season", async importOriginal => ({ ...await importOriginal<object>(), fetchLeagueSeasons: async () => ({premier: "S5", academy: "A1"}) }));
vi.mock("@/lib/season-end/queries", () => ({loadSeasonEnd: load}));
vi.mock("next/navigation", () => ({redirect}));
import Page from "./page";
beforeEach(() => {
  vi.clearAllMocks();
  staff.mockResolvedValue({isAdmin: true, isOwner: false});
  load.mockResolvedValue({games: 6, players: 10, minGames: 5, complete: false, warnings: [], awards: [{id: "body-count", title: "Body Count", description: "Most kills", group: "Record breakers", mode: "total", status: "ready", winners: [{name: "Alice#NA1", team: "Wolves", games: 6, value: 60, total: 60, perGame: 10}]}]});
});
describe("season-end admin page", () => {
  it.each([{isAdmin: false, isOwner: false}, {isAdmin: false, isOwner: false, isBroadcaster: true}])("gates stats reads behind admin/owner access", async permissions => {
    staff.mockResolvedValue(permissions);
    await expect(Page({searchParams: Promise.resolve({})})).rejects.toThrow("redirect");
    expect(load).not.toHaveBeenCalled();
  });
  it("renders the winner's total and per-game figure with provisional context", async () => {
    render(await Page({searchParams: Promise.resolve({})}));
    expect(screen.getByRole("heading", {name: "Body Count"})).toBeTruthy();
    expect(screen.getByText("Alice#NA1")).toBeTruthy();
    expect(screen.getByText(/Season total · 10 per game/)).toBeTruthy();
    expect(screen.getByText(/Provisional leaders/)).toBeTruthy();
  });
  it("defaults to the selected league's season", async () => {
    render(await Page({searchParams: Promise.resolve({league: "academy"})}));
    expect(load).toHaveBeenCalledWith({}, "academy", "A1");
  });
  it("never loads a season from the other league", async () => {
    render(await Page({searchParams: Promise.resolve({league: "academy", season: "S5"})}));
    expect(load).not.toHaveBeenCalled(); expect(screen.getByRole("alert")).toBeTruthy();
  });
  it("shows read failure instead of an empty leaderboard or raw database error", async () => {
    load.mockRejectedValue(new Error("internal credentials detail"));
    render(await Page({searchParams: Promise.resolve({})}));
    expect(screen.getByRole("alert").textContent).toContain("could not be loaded completely");
    expect(screen.queryByText(/internal credentials/)).toBeNull();
  });
});
