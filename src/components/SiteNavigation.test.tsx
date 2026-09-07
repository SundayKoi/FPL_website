import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SiteNavigation from "./SiteNavigation";

const { pathname, search } = vi.hoisted(() => ({
  pathname: { value: "/" },
  search: { value: "tab=Players" },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => pathname.value,
  useRouter: () => ({ push: () => undefined }),
  useSearchParams: () => new URLSearchParams(search.value),
}));

afterEach(() => {
  pathname.value = "/";
  search.value = "tab=Players";
  cleanup();
});

describe("SiteNavigation", () => {
  it("keeps Home in the brand and places My Team and Stats before League", () => {
    render(<SiteNavigation authSlot={<span>Account</span>} />);

    expect(screen.queryByRole("link", { name: /^Home$/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /fpl home/i })).toBeNull();
    expect(screen.getByRole("button", { name: /fpl, premier division, choose league/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /premier menu/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /academy menu/i })).toBeNull();
    // Four menus of four to six, and one personal page at the top level.
    expect(screen.queryByRole("link", { name: /^Stats$/ })).toBeNull();
    expect(screen.getByRole("link", { name: /^My Team$/ }).getAttribute("href")).toBe("/my-team");
    expect(screen.getByRole("button", { name: /league menu/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /cards menu/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /play menu/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /about menu/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /premium menu/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /info menu/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /^Cards$/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /^Premium$/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /^Betting$/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /^Sign Up$/ })).toBeNull();
    expect(screen.getByText("Account")).toBeTruthy();
  });

  it("hides the Admin link by default and shows it for staff, beside the avatar", () => {
    render(<SiteNavigation authSlot={<span>Account</span>} />);
    expect(screen.queryByRole("link", { name: /^Admin$/ })).toBeNull();
    cleanup();

    render(<SiteNavigation authSlot={<span>Account</span>} showAdmin />);
    expect(screen.getByRole("link", { name: /^Admin$/ }).getAttribute("href")).toBe("/admin");
    fireEvent.click(screen.getByRole("button", { name: /about menu/i }));
    expect(screen.queryByRole("menuitem", { name: /^Admin$/ })).toBeNull();
  });

  it("shows Broadcaster inside League independently from Admin", () => {
    render(<SiteNavigation authSlot={<span>Account</span>} showBroadcaster />);
    fireEvent.click(screen.getByRole("button", { name: /league menu/i }));
    expect(screen.getByRole("menuitem", { name: /^Broadcaster$/ }).getAttribute("href")).toBe("/broadcaster");
    expect(screen.queryByRole("link", { name: /^Admin$/ })).toBeNull();
    cleanup();

    render(<SiteNavigation authSlot={<span>Account</span>} showAdmin />);
    expect(screen.getByRole("link", { name: /^Admin$/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /league menu/i }));
    expect(screen.queryByRole("menuitem", { name: /^Broadcaster$/ })).toBeNull();
  });

  it("marks the active route with aria-current", () => {
    render(<SiteNavigation authSlot={<span>Account</span>} />);

    fireEvent.click(screen.getByRole("button", { name: /choose league/i }));
    expect(screen.getByRole("menuitem", { name: /^FPL, Premier division$/ }).getAttribute("aria-current")).toBe("page");
  });

  it("marks FPL'dle as a Play page, not a League destination", () => {
    pathname.value = "/academy/fpldle";
    render(<SiteNavigation authSlot={<span>Account</span>} />);

    expect(screen.getByRole("button", { name: /play menu/i }).getAttribute("aria-current")).toBe(
      "page",
    );
    fireEvent.click(screen.getByRole("button", { name: /league menu/i }));
    expect(screen.queryByRole("menuitem", { name: /^FPL'dle$/ })).toBeNull();
  });

  it("opens the About dropdown with the how-it-works pages", () => {
    render(<SiteNavigation authSlot={<span>Account</span>} />);

    const infoMenu = screen.getByRole("button", { name: /about menu/i });
    expect(infoMenu.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(infoMenu);

    expect(infoMenu.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("menuitem", { name: /^About the league$/ }).getAttribute("href")).toBe("/info");
    // Where a visitor looks for "how do I get in" — and where it was missing.
    expect(screen.getByRole("menuitem", { name: /^Premium & Patron$/ }).getAttribute("href")).toBe("/membership");
    expect(screen.getByRole("menuitem", { name: /^Betting dollars$/ }).getAttribute("href")).toBe("/economy");
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

  it("opens League with the active league destinations", () => {
    render(<SiteNavigation authSlot={<span>Account</span>} />);

    fireEvent.click(screen.getByRole("button", { name: /league menu/i }));
    expect(screen.getByRole("menuitem", { name: /^Players$/ }).getAttribute("href")).toBe("/players");
    expect(screen.getByRole("menuitem", { name: /^Teams$/ }).getAttribute("href")).toBe("/teams");
    expect(screen.getByRole("menuitem", { name: /^Schedule$/ }).getAttribute("href")).toBe("/schedule");
    expect(screen.getByRole("menuitem", { name: /^Stats$/ }).getAttribute("href")).toBe("/stats");
    // Both drafts under League: the auction that builds rosters and the pick/ban tool.
    expect(screen.getByRole("menuitem", { name: /^Auction Draft$/ }).getAttribute("href")).toBe("/draft");
    expect(screen.getByRole("menuitem", { name: /^Match Drafter$/ }).getAttribute("href")).toBe("/drafter");
    expect(screen.queryByRole("menuitem", { name: /^FPL'dle$/ })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: /^Broadcaster$/ })).toBeNull();

    cleanup();
    pathname.value = "/academy/players";
    render(<SiteNavigation authSlot={<span>Account</span>} showBroadcaster />);
    fireEvent.click(screen.getByRole("button", { name: /league menu/i }));
    expect(screen.getByRole("menuitem", { name: /^Players$/ }).getAttribute("href")).toBe("/academy/players");
    expect(screen.queryByRole("menuitem", { name: /^FPL'dle$/ })).toBeNull();
    expect(screen.getByRole("menuitem", { name: /^Broadcaster$/ }).getAttribute("href")).toBe("/broadcaster");
  });

  it("keeps the Premium HQ destination on the current league from the Play menu", () => {
    pathname.value = "/academy/players";
    render(<SiteNavigation authSlot={<span>Account</span>} />);
    fireEvent.click(screen.getByRole("button", { name: /play menu/i }));
    expect(screen.getByRole("menuitem", { name: /^Premium HQ$/ }).getAttribute("href")).toBe(
      "/premium?league=academy",
    );

    cleanup();
    pathname.value = "/premium";
    search.value = "league=academy";
    render(<SiteNavigation authSlot={<span>Account</span>} />);
    fireEvent.click(screen.getByRole("button", { name: /play menu/i }));
    expect(screen.getByRole("menuitem", { name: /^Premium HQ$/ }).getAttribute("href")).toBe(
      "/premium?league=academy",
    );
  });

  it("uses the larger desktop header and brand treatment", () => {
    const { container } = render(<SiteNavigation authSlot={<span>Account</span>} />);

    const headerRow = container.querySelector("header > div");
    expect(headerRow?.className).toContain("sm:px-8");
    expect(headerRow?.className).toContain("sm:py-4");
    expect(headerRow?.className).toContain("lg:px-10");

    const brandButton = screen.getByRole("button", { name: /fpl, premier division, choose league/i });
    expect(brandButton.className).toContain("gap-2");

    const logo = brandButton.querySelector("img");
    expect(logo?.getAttribute("width")).toBe("28");
    expect(logo?.getAttribute("height")).toBe("28");

    const leagueMenu = screen.getByRole("button", { name: /league menu/i });
    expect(leagueMenu.className).toContain("sm:text-sm");
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

    fireEvent.click(screen.getByRole("button", { name: /league menu/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /^Teams$/ }));
    expect(screen.getByRole("button", { name: /open menu/i })).toBeTruthy();
  });

  it("lists the daily games as Premium destinations of their own, in the current league", () => {
    render(<SiteNavigation authSlot={<span>Account</span>} />);
    fireEvent.click(screen.getByRole("button", { name: /play menu/i }));
    expect(screen.getByRole("menuitem", { name: /^FPL'dle$/ }).getAttribute("href")).toBe("/fpldle");
    expect(screen.getByRole("menuitem", { name: /^Higher or Lower$/ }).getAttribute("href")).toBe("/higher-lower");
    // Still in admin testing: a member must not be offered a game that
    // bounces them. Staff see it.
    expect(screen.queryByRole("menuitem", { name: /^Guess the Card$/ })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: /^Daily Games$/ })).toBeNull();
    cleanup();

    pathname.value = "/academy/schedule";
    render(<SiteNavigation authSlot={<span>Account</span>} />);
    fireEvent.click(screen.getByRole("button", { name: /play menu/i }));
    expect(screen.getByRole("menuitem", { name: /^FPL'dle$/ }).getAttribute("href")).toBe("/academy/fpldle");
  });

  it("puts Patrons in the Info menu", () => {
    render(<SiteNavigation authSlot={<span>Account</span>} />);
    fireEvent.click(screen.getByRole("button", { name: /about menu/i }));
    expect(screen.getByRole("menuitem", { name: /^Patrons$/ }).getAttribute("href")).toBe("/supporters");
  });

  it("offers site search from the header", () => {
    render(<SiteNavigation authSlot={<span>Account</span>} />);
    expect(screen.getByRole("button", { name: /search the site/i })).toBeTruthy();
  });
});
