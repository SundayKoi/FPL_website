import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/", useSearchParams: () => new URLSearchParams() }));
vi.mock("./LeagueBrandChooser", () => ({ default: () => <span>FPL</span> }));
vi.mock("./SiteSearch", () => ({ default: () => null }));

import SiteNavigation from "./SiteNavigation";

afterEach(cleanup);

describe("SiteNavigation", () => {
  it("shows the league's menus in an ordinary season", () => {
    render(<SiteNavigation authSlot={null} />);
    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(within(nav).getByRole("link", { name: "My Team" })).toBeTruthy();
    expect(within(nav).getByRole("button", { name: "League menu" })).toBeTruthy();
    expect(within(nav).queryByRole("link", { name: "Offseason" })).toBeNull();
  });

  it("leads to the offseason alone while an event runs", () => {
    render(<SiteNavigation authSlot={null} offseasonOnly showAdmin />);
    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(within(nav).getByRole("link", { name: "Offseason" }).getAttribute("href")).toBe("/offseason");
    expect(within(nav).queryByRole("link", { name: "My Team" })).toBeNull();
    expect(within(nav).queryAllByRole("button")).toHaveLength(0);
    // Staff still reach the admin hub beside the avatar.
    expect(screen.getByRole("link", { name: "Admin" })).toBeTruthy();
  });
});
