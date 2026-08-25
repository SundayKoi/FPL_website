import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import TopCards from "./TopCards";
import type { PlayerCardData } from "@/lib/cards/build";

const card = (name: string, overall: number, over: Partial<PlayerCardData> = {}): PlayerCardData =>
  ({
    slug: name.toLowerCase(),
    name,
    overall,
    role: "BOTTOM",
    tier: { key: "diamond", label: "Diamond" },
    teamAbbr: "WLD",
    teamName: "Wolves",
    ...over,
  }) as PlayerCardData;

describe("TopCards", () => {
  afterEach(cleanup);

  it("ranks by overall rather than trusting the caller's order", () => {
    render(<TopCards cards={[card("Bo", 71), card("Ari", 92), card("Cy", 80)]} />);
    const names = screen.getAllByRole("link").map((link) => link.textContent ?? "");
    expect(names[1]).toContain("Ari");
    expect(names[2]).toContain("Cy");
    expect(names[3]).toContain("Bo");
  });

  it("links each card to its own page", () => {
    render(<TopCards cards={[card("Ari", 92)]} />);
    expect(screen.getByRole("link", { name: /Ari/ }).getAttribute("href")).toBe("/card/ari");
  });

  it("takes the Academy hub when told to", () => {
    render(<TopCards cards={[card("Ari", 92)]} basePath="/academy/cards" />);
    expect(screen.getByRole("link", { name: /all cards/i }).getAttribute("href")).toBe("/academy/cards");
  });

  it("renders nothing at all when the week produced no cards", () => {
    // Rather than an empty panel on the homepage — a week with no games is
    // not a thing worth taking up space to announce.
    const { container } = render(<TopCards cards={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("spells UTILITY as SUPPORT, like the rest of the site", () => {
    render(<TopCards cards={[card("Ari", 92, { role: "UTILITY" })]} />);
    expect(screen.getByText(/SUPPORT/)).toBeTruthy();
  });

  it("shows only the top five", () => {
    const many = Array.from({ length: 9 }, (_, i) => card(`P${i}`, 90 - i));
    render(<TopCards cards={many} />);
    // Five cards plus the "All cards" link.
    expect(screen.getAllByRole("link")).toHaveLength(6);
  });
});
