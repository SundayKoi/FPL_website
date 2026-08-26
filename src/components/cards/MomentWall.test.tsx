import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import MomentWall from "./MomentWall";
import type { LeagueMoment } from "@/lib/cards/queries";

function moment(overrides: Partial<LeagueMoment> = {}): LeagueMoment {
  return {
    id: 1,
    weekStart: "2026-08-24",
    slug: "ari-na1",
    summonerName: "Ari",
    teamName: "Wolves",
    champion: "Jinx",
    role: "BOTTOM",
    triggerKey: "pentakill",
    title: "PENTAKILL",
    headline: "Five in a row · 12/1/4",
    gameDate: "2026-08-24T02:00:00Z",
    opponent: "Cakesters",
    durationMin: 31.7,
    ...overrides,
  };
}

describe("MomentWall", () => {
  afterEach(cleanup);

  it("explains the emptiness rather than showing a blank wall", () => {
    render(<MomentWall moments={[]} />);
    expect(screen.getByText(/no moments yet/i)).toBeTruthy();
  });

  it("shows the title, the real stat line, and a link to the player", () => {
    render(<MomentWall moments={[moment()]} />);

    expect(screen.getByText("PENTAKILL")).toBeTruthy();
    expect(screen.getByText("Five in a row · 12/1/4")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ari" }).getAttribute("href")).toBe("/card/ari-na1");
  });

  it("dates the week in UTC so the label can't slide back a day", () => {
    render(<MomentWall moments={[moment()]} />);
    expect(screen.getByText(/Aug 24/)).toBeTruthy();
  });

  it("shows the provenance row: opponent and game clock", () => {
    render(<MomentWall moments={[moment()]} />);
    expect(screen.getByText(/vs Cakesters/)).toBeTruthy();
    expect(screen.getByText(/31:42/)).toBeTruthy();
  });

  it("degrades by omission on a copy frozen before the redesign", () => {
    render(<MomentWall moments={[moment({ opponent: null, durationMin: null })]} />);
    // No clock and no opponent — never a fake one; the team fills in.
    expect(screen.queryByText(/31:42/)).toBeNull();
    expect(screen.getByText(/Wolves · Aug 24/)).toBeTruthy();
  });

  it("renders a moment with no champion recorded", () => {
    render(<MomentWall moments={[moment({ champion: null })]} />);
    expect(screen.getByText("PENTAKILL")).toBeTruthy();
    // No champion means no splash; the family backdrop carries the card
    // rather than a broken image.
    expect(document.querySelector("img")).toBeNull();
  });

  it("prints the champion's splash when one is recorded", () => {
    const { container } = render(<MomentWall moments={[moment()]} />);
    const splash = container.querySelector("img");
    expect(splash?.getAttribute("src")).toContain("Jinx");
    // Decorative — the champion is already named in the meta line, so a
    // screen reader shouldn't hear it twice.
    expect(splash?.getAttribute("alt")).toBe("");
  });

  it("stamps the season on the plate when the page knows it", () => {
    render(<MomentWall moments={[moment()]} season="S5" />);
    expect(screen.getByText(/S5 Moment/)).toBeTruthy();
  });

  it("omits the season rather than printing a blank one", () => {
    render(<MomentWall moments={[moment()]} />);
    expect(screen.getByText("Moment")).toBeTruthy();
  });
});
