import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { PlayerCardData } from "@/lib/cards/build";
import CardsGallery from "./CardsGallery";

function makeCard(name: string, role: string, overall: number, standout = false): PlayerCardData {
  return {
    slug: `${name.toLowerCase()}-na1`,
    name,
    tag: "NA1",
    teamName: "Storm",
    teamImageUrl: null,
    role,
    overall,
    tier: { key: "gold", label: "Gold" },
    archetype: "Playmaker",
    signature: null,
    artSkin: 0,
    autograph: null,
    motto: null,
    serial: 0,
    collectionSize: 3,
    topChampions: [],
    form: [],
    subStats: [{ key: "combat", label: "Combat", value: 50 }],
    highlights: [],
    badges: [],
    standout,
    wins: 1,
    losses: 1,
    winratePct: 50,
    level: 10,
    pentas: 0,
    season: "S5",
  };
}

const cards = [
  makeCard("Chaseworthy", "Mid", 92, true),
  makeCard("Commonly", "Support", 62),
  makeCard("Toplander", "Top", 71),
];

afterEach(cleanup);

describe("CardsGallery", () => {
  it("names both jobs of the card page on every chip", () => {
    render(<CardsGallery cards={cards} />);

    // Standout strip + main grid; the crowned card appears in both.
    const chips = screen.getAllByRole("link", { name: "View & customize →" });
    expect(chips).toHaveLength(4);
    expect(screen.queryByText(/Share page/)).toBeNull();
    expect(chips[0].getAttribute("href")).toBe("/card/chaseworthy-na1");
  });

  it("filters the grid by name", () => {
    render(<CardsGallery cards={cards} />);

    fireEvent.change(screen.getByLabelText("Search players or teams"), { target: { value: "common" } });

    expect(screen.getByText("1 of 3 cards")).toBeTruthy();
    // The standout strip keeps its own chip; the grid is down to one.
    expect(screen.getAllByRole("link", { name: "View & customize →" })).toHaveLength(2);
  });
});

describe("CardsGallery sort", () => {
  it("reorders the wall by name or team without touching the Cards of the Week strip", () => {
    render(<CardsGallery cards={[makeCard("Chaseworthy", "Mid", 92, true), makeCard("Commonly", "Support", 62), makeCard("Bystander", "Top", 75)]} />);
    const wall = () =>
      screen
        .getAllByRole("button", { name: /player card/ })
        .map((node) => node.getAttribute("aria-label")?.split(" player card")[0]);
    // The strip shows the crowned card first, then the wall best-first.
    expect(wall()).toEqual(["Chaseworthy", "Chaseworthy", "Bystander", "Commonly"]);
    fireEvent.change(screen.getByRole("combobox", { name: "Sort" }), { target: { value: "name" } });
    expect(wall()).toEqual(["Chaseworthy", "Bystander", "Chaseworthy", "Commonly"]);
  });
});
