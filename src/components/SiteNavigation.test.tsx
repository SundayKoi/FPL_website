import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SiteNavigation from "./SiteNavigation";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

afterEach(() => {
  cleanup();
});

describe("SiteNavigation", () => {
  it("links every primary tab to its own route", () => {
    render(<SiteNavigation authSlot={<span>Account</span>} />);

    expect(screen.getByRole("link", { name: /^Home$/ }).getAttribute("href")).toBe("/");
    expect(screen.getByRole("link", { name: /^Stats$/ }).getAttribute("href")).toBe("/stats");
    expect(screen.getByRole("link", { name: /^Players$/ }).getAttribute("href")).toBe("/players");
    expect(screen.getByRole("link", { name: /^Schedule$/ }).getAttribute("href")).toBe(
      "/schedule",
    );
    expect(screen.getByRole("link", { name: /^Draft$/ }).getAttribute("href")).toBe("/draft");
    expect(screen.getByRole("link", { name: /^Teams$/ }).getAttribute("href")).toBe("/teams");
    expect(screen.getByRole("link", { name: /^Betting$/ }).getAttribute("href")).toBe("/betting");
    expect(screen.getByRole("link", { name: /^Info$/ }).getAttribute("href")).toBe("/info");
    expect(screen.getByText("Account")).toBeTruthy();
  });

  it("marks the active route with aria-current", () => {
    render(<SiteNavigation authSlot={<span>Account</span>} />);

    expect(screen.getByRole("link", { name: /^Home$/ }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: /^Stats$/ }).getAttribute("aria-current")).toBeNull();
  });

  it("uses the larger desktop header and brand treatment", () => {
    const { container } = render(<SiteNavigation authSlot={<span>Account</span>} />);

    const headerRow = container.querySelector("header > div");
    expect(headerRow?.className).toContain("sm:px-8");
    expect(headerRow?.className).toContain("sm:py-4");
    expect(headerRow?.className).toContain("lg:px-10");

    const brandLink = screen.getByRole("link", { name: /fpl home/i });
    expect(brandLink.className).toContain("sm:gap-3");

    const logo = brandLink.querySelector("img");
    expect(logo?.getAttribute("width")).toBe("44");
    expect(logo?.getAttribute("height")).toBe("44");
    expect(brandLink.querySelector("span")?.className).toContain("sm:text-2xl");

    const statsLink = screen.getByRole("link", { name: /^Stats$/ });
    expect(statsLink.className).toContain("sm:text-sm");
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

    fireEvent.click(screen.getByRole("link", { name: /^Teams$/ }));
    expect(screen.getByRole("button", { name: /open menu/i })).toBeTruthy();
  });
});
