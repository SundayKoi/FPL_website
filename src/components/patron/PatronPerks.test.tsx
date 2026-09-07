import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import PatronPerks from "./PatronPerks";

afterEach(cleanup);

describe("PatronPerks", () => {
  it("shows the recurring reward headline and fairness note in the full card", () => {
    render(<PatronPerks />);

    expect(screen.getByText("50% more recurring rewards")).toBeTruthy();
    expect(screen.getByText(/\/daily, \/weekly, Daily Stu, FPL'dle/)).toBeTruthy();
    expect(screen.getByText("Patronage increases listed recurring wallet rewards. It never changes betting odds, pack odds, ratings, match results, Fantasy scoring, or Gauntlet placement.")).toBeTruthy();
  });

  it("links the design-table perk to the skin-line preview", () => {
    render(<PatronPerks />);

    expect(screen.getByText("A seat at the design table")).toBeTruthy();
    const links = screen.getAllByRole("link", { name: /have a look/i }).map((link) => link.getAttribute("href"));
    expect(links).toContain("/skin-lines");
    // The patrons' expedition links to the board it opens on.
    expect(screen.getByText("The Gilded Road")).toBeTruthy();
    expect(links).toContain("/cards/expeditions");
  });

  it("includes the same headline perk in the compact cards preview", () => {
    render(<PatronPerks variant="compact" />);

    expect(screen.getByText("50% more recurring rewards")).toBeTruthy();
    expect(screen.getByRole("link", { name: /all \d+ perks/i })).toBeTruthy();
  });
});
