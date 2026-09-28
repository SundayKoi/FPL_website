import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import MobileTabBar from "./MobileTabBar";

const { pathname } = vi.hoisted(() => ({ pathname: { value: "/" } }));

vi.mock("next/navigation", () => ({ usePathname: () => pathname.value }));

afterEach(() => {
  pathname.value = "/";
});

const link = (name: string) => screen.getByRole("link", { name });

describe("MobileTabBar", () => {
  it("offers the five places most visits go", () => {
    render(<MobileTabBar />);
    const bar = screen.getByRole("navigation", { name: "Quick links" });
    expect(bar.className).toContain("md:hidden");
    expect(link("Home").getAttribute("href")).toBe("/");
    expect(link("League").getAttribute("href")).toBe("/schedule");
    expect(link("Cards").getAttribute("href")).toBe("/cards");
    expect(link("Games").getAttribute("href")).toBe("/premium");
    expect(link("My Team").getAttribute("href")).toBe("/my-team");
    expect(link("Home").getAttribute("aria-current")).toBe("page");
  });

  it("stays in the league you are looking at", () => {
    pathname.value = "/academy/standings";
    render(<MobileTabBar />);
    expect(link("Home").getAttribute("href")).toBe("/academy");
    expect(link("League").getAttribute("href")).toBe("/academy/schedule");
    expect(link("Cards").getAttribute("href")).toBe("/academy/cards");
    expect(link("Games").getAttribute("href")).toBe("/premium?league=academy");
    expect(link("League").getAttribute("aria-current")).toBe("page");
    expect(link("Home").getAttribute("aria-current")).toBeNull();
  });

  it("marks the section a deeper page belongs to", () => {
    pathname.value = "/cards/market/bounties";
    render(<MobileTabBar />);
    expect(link("Cards").getAttribute("aria-current")).toBe("page");
  });

  it("stays out of the way of full-screen tools", () => {
    for (const path of ["/admin", "/admin/analytics", "/broadcaster", "/draft/abc", "/drafter/xyz", "/match-draft/12"]) {
      pathname.value = path;
      const { unmount } = render(<MobileTabBar />);
      expect(screen.queryByRole("navigation", { name: "Quick links" }), path).toBeNull();
      unmount();
    }
    // The draft index is an ordinary page and keeps the bar.
    pathname.value = "/draft";
    render(<MobileTabBar />);
    expect(screen.getByRole("navigation", { name: "Quick links" })).toBeTruthy();
  });
});
