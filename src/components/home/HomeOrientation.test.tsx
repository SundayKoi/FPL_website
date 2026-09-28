import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HomeOrientation from "./HomeOrientation";
import type { FixtureRow } from "@/lib/schedule/types";

const fixture: FixtureRow = {
  id: "f1",
  season: "S5",
  stage: "week_1",
  division: null,
  team_a: "New Origins",
  team_b: "DoV Twisted",
  scheduled_at: "2030-01-01T01:00:00Z",
  best_of: 3,
  score_a: null,
  score_b: null,
  sort_order: 1,
  created_at: "2029-12-01T00:00:00Z",
};

describe("HomeOrientation", () => {
  it("names this week's game and links the two doors everyone can open", () => {
    render(<HomeOrientation league="premier" viewer="signed-out" fixture={fixture} seasonLabel="S5" />);
    expect(screen.getByRole("link", { name: /new origins vs dov twisted/i }).getAttribute("href")).toBe("/schedule");
    expect(screen.getByText(/\d:\d\d [AP]M ET$/)).toBeTruthy();
    const doors = screen.getByRole("navigation", { name: "Start here" });
    expect(within(doors).getByRole("link", { name: /see the schedule/i }).getAttribute("href")).toBe("/schedule");
    expect(within(doors).getByRole("link", { name: /browse the cards/i }).getAttribute("href")).toBe("/cards/browse");
  });

  it("shows the result instead of a kickoff once the game is played", () => {
    render(<HomeOrientation league="premier" viewer="signed-out" fixture={{ ...fixture, score_a: 2, score_b: 1 }} />);
    expect(screen.getByText("Latest result")).toBeTruthy();
    expect(screen.getByRole("link", { name: /2–1/ })).toBeTruthy();
  });

  it("follows the league for its doors and its map", () => {
    render(<HomeOrientation league="academy" viewer="signed-out" fixture={null} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/academy/i);
    const doors = screen.getByRole("navigation", { name: "Start here" });
    expect(within(doors).getByRole("link", { name: /see the schedule/i }).getAttribute("href")).toBe("/academy/schedule");
    expect(within(doors).getByRole("link", { name: /browse the cards/i }).getAttribute("href")).toBe("/academy/cards/browse");
    expect(within(doors).getByRole("link", { name: /sign in/i }).getAttribute("href")).toBe("/login");
    const map = screen.getByRole("navigation", { name: "Site map" });
    expect(within(map).getByRole("link", { name: /daily games/i }).getAttribute("href")).toBe("/academy/fpldle");
  });

  it("gives a premium member four shortcuts to what they came to do", () => {
    render(<HomeOrientation league="academy" viewer="premium" fixture={null} />);
    expect(screen.queryByRole("navigation", { name: "Start here" })).toBeNull();
    const shortcuts = screen.getByRole("navigation", { name: "Your shortcuts" });
    const links = within(shortcuts).getAllByRole("link");
    expect(links.map((link) => [link.querySelector("span")?.textContent, link.getAttribute("href")])).toEqual([
      ["My team", "/academy/my-team"],
      ["This week's matches", "/academy/schedule"],
      ["Open today's pack", "/academy/cards/packs"],
      ["Today's FPL'dle", "/academy/fpldle"],
    ]);
  });

  it("gives a signed-in member without Premium the free shortcuts and the way in", () => {
    render(<HomeOrientation league="premier" viewer="member" fixture={null} />);
    const shortcuts = screen.getByRole("navigation", { name: "Your shortcuts" });
    expect(within(shortcuts).getByRole("link", { name: /my team/i }).getAttribute("href")).toBe("/my-team");
    expect(within(shortcuts).getByRole("link", { name: /browse the cards/i }).getAttribute("href")).toBe("/cards/browse");
    expect(within(shortcuts).getByRole("link", { name: /get/i }).getAttribute("href")).toBe("/membership");
    // Nothing a member cannot open is offered as a shortcut.
    expect(within(shortcuts).queryByRole("link", { name: /today's pack/i })).toBeNull();
  });
});
