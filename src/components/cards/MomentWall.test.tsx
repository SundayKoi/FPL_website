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
    expect(screen.getByText(/Week of Aug 24/)).toBeTruthy();
  });

  it("renders a moment with no champion recorded", () => {
    render(<MomentWall moments={[moment({ champion: null })]} />);
    expect(screen.getByText("PENTAKILL")).toBeTruthy();
  });
});
