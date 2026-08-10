import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import RulebookContent from "./RulebookContent";

describe("RulebookContent", () => {
  afterEach(cleanup);

  it("renders the Split 5 title and major section anchors", () => {
    render(<RulebookContent />);

    expect(
      screen.getByRole("heading", { name: /rulebook/i, level: 1 }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("heading", { name: "League Overview", level: 2 })
        .getAttribute("id"),
    ).toBe("league-overview");
    expect(
      screen
        .getByRole("heading", { name: "Additional Rules & Aspects of the League", level: 2 })
        .getAttribute("id"),
    ).toBe("additional-rules");
  });

  it("preserves representative source wording", () => {
    render(<RulebookContent />);

    expect(
      screen.getByText(
        /Welcome to the Franchise Premier League \(FPL\), a competitive, franchise-based League of Legends league designed to promote balanced teams and showcase emerging talent\./i,
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(/Matches follow the Fearless Format \(champions can only be played once a series\) and are played weekly on Mondays at 8:00pm est\./i),
    ).toBeTruthy();
    expect(
      screen.getByText(/All rules and guidelines are subject to interpretation by League Staff\./i),
    ).toBeTruthy();
  });

  it("omits signup sections from the on-page Rulebook", () => {
    render(<RulebookContent />);

    expect(screen.queryByRole("heading", { name: "Player Sign-Ups" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Captain Sign-Ups" })).toBeNull();
    expect(screen.queryByText("https://forms.gle/rKdxaVfXnvAhD8wQA")).toBeNull();
    expect(screen.queryByText("https://forms.gle/MrzDgQ51K7KyEt4q6")).toBeNull();
  });

  it("renders the Split 5 rules and the playoff figure", () => {
    render(<RulebookContent />);

    expect(screen.getByRole("heading", { name: "League Overview", level: 2 })).toBeTruthy();
    expect(screen.getByText(/150 ranked games \(S15 \+ S16\)/i)).toBeTruthy();
    expect(screen.getByText(/Each captain will get bids that will be placed blindly/i)).toBeTruthy();
    expect(screen.getByText(/Players can be removed from the league under strenuous circumstances/i)).toBeTruthy();
    expect(screen.getByText(/Founders: Rutledge, Jake, JayDK, & Repped/i)).toBeTruthy();
    expect(screen.getByRole("figure", { name: /gauntlet and playoff format/i })).toBeTruthy();
    expect(screen.getByRole("img", { name: /gauntlet and playoff bracket/i })).toBeTruthy();
  });
});
