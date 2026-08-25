import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import CardsNav, { cardsNavGroups } from "./CardsNav";

describe("cardsNavGroups", () => {
  it("points every destination at the league it was given", () => {
    // The Academy hub has its own copy of every page.
    const hrefs = cardsNavGroups({ base: "/academy/cards" }).flatMap((g) => g.items.map((i) => i.href));
    // Claims is the one league-agnostic page — staff approve both there.
    for (const href of hrefs) expect(href.startsWith("/academy/cards")).toBe(true);
  });

  it("hides claims from everyone but staff", () => {
    const labels = (showClaims: boolean) =>
      cardsNavGroups({ base: "/cards", showClaims }).flatMap((g) => g.items.map((i) => i.label));
    expect(labels(false)).not.toContain("Claims");
    expect(labels(true)).toContain("Claims");
  });

  it("badges claims only when some are actually waiting", () => {
    const claims = (pendingClaims: number) =>
      cardsNavGroups({ base: "/cards", showClaims: true, pendingClaims })
        .flatMap((g) => g.items)
        .find((i) => i.label === "Claims");
    expect(claims(0)?.badge).toBeUndefined();
    expect(claims(3)?.badge).toBe(3);
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

  it("shows the pending claim count on the badge", () => {
    render(<CardsNav base="/cards" showClaims pendingClaims={4} />);
    const claims = screen.getByRole("link", { name: /claims/i });
    expect(within(claims).getByText("4")).toBeTruthy();
  });
});
