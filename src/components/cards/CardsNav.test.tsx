import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import CardsNav, { cardsNavGroups } from "./CardsNav";

describe("cardsNavGroups", () => {
  it("points every card destination at the league it was given", () => {
    // The Academy hub has its own copy of every page.
    const hrefs = cardsNavGroups({ base: "/academy/cards" }).flatMap((g) => g.items.map((i) => i.href));
    for (const href of hrefs) expect(href.startsWith("/academy/cards")).toBe(true);
  });

  it("keeps player claims out of the card navigation", () => {
    const labels = cardsNavGroups({ base: "/cards" })
      .flatMap((g) => g.items.map((i) => i.label));

    expect(labels).not.toContain("Claims");
  });
});

describe("CardsNav", () => {
  afterEach(cleanup);

  it("groups destinations by what someone came to do", () => {
    render(<CardsNav base="/cards" />);
    for (const group of ["Browse", "Collect", "Play"]) {
      expect(screen.getByText(group)).toBeTruthy();
    }
  });

  it("gives every destination a line saying what it is", () => {
    // The old row was nine labels and no explanation; the label should not
    // have to carry the whole meaning.
    render(<CardsNav base="/cards" />);
    const links = screen.getAllByRole("link");
    expect(links.length).toBeGreaterThan(6);
    for (const link of links) {
      // label + blurb, so more than just the name and the arrow
      expect((link.textContent ?? "").trim().length).toBeGreaterThan(15);
    }
  });

  it("keeps Moments in the Browse group, where looking happens", () => {
    render(<CardsNav base="/cards" />);
    const browse = screen.getByText("Browse").closest("section")!;
    expect(within(browse).getByRole("link", { name: /moments/i })).toBeTruthy();
  });

  it("does not render a claims link", () => {
    render(<CardsNav base="/cards" />);
    expect(screen.queryByRole("link", { name: /claims/i })).toBeNull();
  });
});
