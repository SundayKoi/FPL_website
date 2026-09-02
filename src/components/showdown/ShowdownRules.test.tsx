import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BRACKETS, RAKE_CAP_BIG_BLINDS, STACK_SIZE } from "@/lib/showdown/config";
import { HAND_RANKS } from "@/lib/showdown/hands";
import ShowdownRules from "./ShowdownRules";

afterEach(cleanup);

describe("the Showdown rulebook", () => {
  it("prints every hand in the evaluator's own order", () => {
    render(<ShowdownRules />);
    const items = screen.getAllByRole("listitem").filter((node) => node.querySelector("b"));
    const labels = items.map((node) => node.querySelector("b")!.textContent);
    for (const rank of HAND_RANKS) expect(labels).toContain(rank.label);
    expect(labels.indexOf("High Card")).toBeLessThan(labels.indexOf("Foil Royal"));
  });

  it("reads the stakes, the cap and the rake from config, not from copy", () => {
    render(<ShowdownRules />);
    expect(screen.getAllByText(new RegExp(`stack cap ${BRACKETS.open.stackCap} overall`)).length).toBeGreaterThan(0);
    expect(screen.getByText(new RegExp(`\\$${BRACKETS.open.minBuyIn.toLocaleString("en-US")} to`))).toBeTruthy();
    expect(screen.getByText(new RegExp(`capped at ${RAKE_CAP_BIG_BLINDS} big blinds`))).toBeTruthy();
    expect(screen.getAllByText(new RegExp(`${STACK_SIZE} cards`)).length).toBeGreaterThan(0);
  });

  it("says a card is never at stake and patronage changes nothing", () => {
    render(<ShowdownRules />);
    expect(screen.getByText(/never won, lost or put up/)).toBeTruthy();
    expect(screen.getByText(/Patronage does not touch Showdown/)).toBeTruthy();
  });
});
