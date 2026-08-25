import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SiteNavigation from "./SiteNavigation";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams("tab=Players"),
}));

afterEach(() => {
  cleanup();
});

describe("SiteNavigation", () => {
  it("keeps Home in the logo and exposes player-first navigation", () => {
    render(<SiteNavigation authSlot={<span>Account</span>} />);

    expect(screen.queryByRole("link", { name: /^Home$/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /fpl home/i })).toBeNull();
    expect(screen.getByRole("button", { name: /fpl, choose league/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /premier menu/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /academy menu/i })).toBeNull();
    for (const name of ["Players", "Teams", "Schedule", "Stats", "My Team"]) {
      expect(within(screen.getByRole("navigation", { name: "Primary" })).getByRole("link", { name })).toBeTruthy();
    }
    expect(screen.getByRole("button", { name: /play menu/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /info menu/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /premium menu/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Players" }).getAttribute("href")).toBe("/players");
    expect(screen.queryByRole("link", { name: /^Betting$/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /^Sign Up$/ })).toBeNull();
    expect(screen.getByText("Account")).toBeTruthy();
  });

  it("hides the Admin link by default and shows it for staff", () => {
    render(<SiteNavigation authSlot={<span>Account</span>} />);
    expect(screen.queryByRole("link", { name: /^Admin$/ })).toBeNull();
    cleanup();

    render(<SiteNavigation authSlot={<span>Account</span>} showAdmin />);
    fireEvent.click(screen.getByRole("button", { name: /info menu/i }));
    expect(screen.getByRole("menuitem", { name: /^Admin$/ }).getAttribute("href")).toBe("/admin");
  });

  it("shows Broadcaster independently from Admin", () => {
    render(<SiteNavigation authSlot={<span>Account</span>} showBroadcaster />);
    fireEvent.click(screen.getByRole("button", { name: /info menu/i }));
    expect(screen.getByRole("menuitem", { name: /^Broadcaster$/ }).getAttribute("href")).toBe("/broadcaster");
    expect(screen.queryByRole("link", { name: /^Admin$/ })).toBeNull();
    cleanup();

    render(<SiteNavigation authSlot={<span>Account</span>} showAdmin />);
    expect(screen.queryByRole("link", { name: /^Admin$/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /^Broadcaster$/ })).toBeNull();
  });

  it("marks the active route with aria-current", () => {
    render(<SiteNavigation authSlot={<span>Account</span>} />);

    fireEvent.click(screen.getByRole("button", { name: /choose league/i }));
    expect(screen.getByRole("menuitem", { name: /^FPL$/ }).getAttribute("aria-current")).toBe("page");
  });

  it("opens the Info dropdown with the Sign Up link", () => {
    render(<SiteNavigation authSlot={<span>Account</span>} />);

    const infoMenu = screen.getByRole("button", { name: /info menu/i });
    expect(infoMenu.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(infoMenu);

    expect(infoMenu.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("menuitem", { name: /^Info$/ }).getAttribute("href")).toBe("/info");
    expect(screen.getByRole("menuitem", { name: /^Sign Up$/ }).getAttribute("href")).toBe("/signup");
    expect(screen.getByRole("menuitem", { name: /^League Links$/ }).getAttribute("href")).toBe(
      "/league-links",
    );
    expect(screen.getByRole("menuitem", { name: /^Rulebook$/ }).getAttribute("href")).toBe(
      "/rulebook",
    );
    expect(screen.getByRole("menuitem", { name: /^Support the Devs$/ }).getAttribute("href")).toBe(
      "/support-devs",
    );

    fireEvent.click(infoMenu);
    expect(infoMenu.getAttribute("aria-expanded")).toBe("false");
  });

  it("opens Play with draft destinations", () => {
    render(<SiteNavigation authSlot={<span>Account</span>} />);

    fireEvent.click(screen.getByRole("button", { name: /play menu/i }));
    expect(screen.getByRole("menuitem", { name: /^Auction Draft$/ }).getAttribute("href")).toBe("/draft");
    expect(screen.getByRole("menuitem", { name: /^Match Drafter$/ }).getAttribute("href")).toBe("/drafter");
  });

  it("opens the Premium dropdown with internal and external destinations", () => {
    render(<SiteNavigation authSlot={<span>Account</span>} />);

    fireEvent.click(screen.getByRole("button", { name: /premium menu/i }));

    expect(screen.getByRole("menuitem", { name: /^Betting$/ }).getAttribute("href")).toBe("/betting");
    expect(screen.getByRole("menuitem", { name: /^Banger Board$/ }).getAttribute("href")).toBe("/bangers");
    expect(screen.getByRole("menuitem", { name: /^Player Cards$/ }).getAttribute("href")).toBe("/cards");

    const draftLeagueLink = screen.getByRole("menuitem", { name: /^Draft League$/ });
    expect(draftLeagueLink.getAttribute("href")).toBe("https://www.draftleague.lol/");
    expect(draftLeagueLink.getAttribute("target")).toBe("_blank");
    expect(draftLeagueLink.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("closes a dropdown with Escape, a link selection, or an outside click", () => {
    render(<SiteNavigation authSlot={<span>Account</span>} />);

    const premiumMenu = screen.getByRole("button", { name: /premium menu/i });
    fireEvent.click(premiumMenu);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(premiumMenu.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(premiumMenu);
    fireEvent.click(screen.getByRole("menuitem", { name: /^Betting$/ }));
    expect(premiumMenu.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(premiumMenu);
    fireEvent.pointerDown(document.body);
    expect(premiumMenu.getAttribute("aria-expanded")).toBe("false");
  });

  it("uses the larger desktop header and brand treatment", () => {
    const { container } = render(<SiteNavigation authSlot={<span>Account</span>} />);

    const headerRow = container.querySelector("header > div");
    expect(headerRow?.className).toContain("sm:px-8");
    expect(headerRow?.className).toContain("sm:py-4");
    expect(headerRow?.className).toContain("lg:px-10");

    const brandButton = screen.getByRole("button", { name: /fpl, choose league/i });
    expect(brandButton.className).toContain("gap-2");

    const logo = brandButton.querySelector("img");
    expect(logo?.getAttribute("width")).toBe("28");
    expect(logo?.getAttribute("height")).toBe("28");

    const playMenu = screen.getByRole("button", { name: /play menu/i });
    expect(playMenu.className).toContain("sm:text-sm");
  });

  it("toggles the mobile menu open and closed via the hamburger button", () => {
    render(<SiteNavigation authSlot={<span>Account</span>} />);

    const toggle = screen.getByRole("button", { name: /open menu/i });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(toggle);

    const opened = screen.getByRole("button", { name: /close menu/i });
    expect(opened.getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(opened);
    expect(screen.getByRole("button", { name: /open menu/i }).getAttribute("aria-expanded")).toBe(
      "false",
    );
  });

  it("closes the menu when a nav link is chosen", () => {
    render(<SiteNavigation authSlot={<span>Account</span>} />);

    fireEvent.click(screen.getByRole("button", { name: /open menu/i }));
    expect(screen.getByRole("button", { name: /close menu/i })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /play menu/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /^Auction Draft$/ }));
    expect(screen.getByRole("button", { name: /open menu/i })).toBeTruthy();
  });
});
