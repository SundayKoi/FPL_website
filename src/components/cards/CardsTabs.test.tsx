import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import CardsTabs from "./CardsTabs";

const { pathname } = vi.hoisted(() => ({ pathname: { value: "/cards" } }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.value }));

afterEach(() => {
  pathname.value = "/cards";
  cleanup();
});

function tabs() {
  return within(screen.getByRole("navigation", { name: "Cards" }));
}

describe("CardsTabs", () => {
  it("shows the six tabs on every cards page, with the current one marked", () => {
    pathname.value = "/cards/packs";
    render(<CardsTabs league="premier" />);
    const names = ["Home", "My Collection", "Packs", "Browse", "Market", "Play"];
    for (const name of names) expect(tabs().getByRole("link", { name })).toBeTruthy();
    expect(tabs().getByRole("link", { name: "Packs" }).getAttribute("aria-current")).toBe("page");
    expect(tabs().getByRole("link", { name: "Home" }).getAttribute("aria-current")).toBeNull();
  });

  it("opens the sub-tabs of the tab you are on, and marks the page", () => {
    // Trades is a Market page now, not a destination of its own.
    pathname.value = "/cards/trades";
    render(<CardsTabs league="premier" />);
    expect(tabs().getByRole("link", { name: "Market" }).getAttribute("aria-current")).toBe("page");
    expect(tabs().getByRole("link", { name: "Trade offers" }).getAttribute("aria-current")).toBe("page");
    expect(tabs().getByRole("link", { name: "Listings" }).getAttribute("href")).toBe("/cards/market");
  });

  it("shows no second row where a tab has nothing under it", () => {
    render(<CardsTabs league="premier" />);
    expect(tabs().queryByRole("link", { name: "All cards" })).toBeNull();
  });

  it("leaves switching league to the header, so a cards page has one switcher", () => {
    pathname.value = "/cards/moments";
    render(<CardsTabs league="premier" />);
    expect(screen.queryByRole("group", { name: "League" })).toBeNull();
    expect(tabs().queryByRole("link", { name: "Academy" })).toBeNull();
  });

  it("builds academy links from the academy base", () => {
    pathname.value = "/academy/cards/fantasy";
    render(<CardsTabs league="academy" />);
    expect(tabs().getByRole("link", { name: "My Collection" }).getAttribute("href")).toBe("/academy/cards/collection");
    expect(tabs().getByRole("link", { name: "Play" }).getAttribute("aria-current")).toBe("page");
    expect(tabs().queryByRole("link", { name: "Gauntlet" })).toBeNull();
  });

  it("shows the wallet at the end of the bar when signed in, and nothing when not", () => {
    render(<CardsTabs league="premier" balance={1250} />);
    expect(screen.getByTestId("cards-balance").textContent).toContain("1,250");
    expect(screen.getByTestId("cards-balance").getAttribute("href")).toBe("/betting");
    cleanup();
    render(<CardsTabs league="premier" balance={null} />);
    expect(screen.queryByTestId("cards-balance")).toBeNull();
  });

  it("badges Market and Trade offers with the offers waiting", () => {
    pathname.value = "/cards/market";
    render(<CardsTabs league="premier" offers={3} />);
    expect(screen.getAllByLabelText("3 trade offers waiting")).toHaveLength(2);
    cleanup();
    render(<CardsTabs league="premier" offers={0} />);
    expect(screen.queryByLabelText(/trade offers waiting/)).toBeNull();
  });
});
