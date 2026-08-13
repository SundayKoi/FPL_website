import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AdminBettingTabs from "./AdminBettingTabs";

const usePathname = vi.fn<() => string>(() => "/admin/betting");

vi.mock("next/navigation", () => ({
  usePathname: () => usePathname(),
}));

afterEach(() => {
  cleanup();
});

describe("AdminBettingTabs", () => {
  it("links every betting admin section", () => {
    render(<AdminBettingTabs />);

    expect(screen.getByRole("link", { name: /^Markets$/ }).getAttribute("href")).toBe(
      "/admin/betting",
    );
    expect(screen.getByRole("link", { name: /^Props$/ }).getAttribute("href")).toBe(
      "/admin/betting/props",
    );
    expect(screen.getByRole("link", { name: /^Pick'em$/ }).getAttribute("href")).toBe(
      "/admin/betting/pickems",
    );
    expect(screen.getByRole("link", { name: /^Catalog$/ }).getAttribute("href")).toBe(
      "/admin/betting/catalog",
    );
    expect(screen.getByRole("link", { name: /^Users$/ }).getAttribute("href")).toBe(
      "/admin/betting/users",
    );
    expect(screen.getByRole("link", { name: /^Seasons$/ }).getAttribute("href")).toBe(
      "/admin/betting/seasons",
    );
  });

  it("marks only the active tab, and Markets only on its exact route", () => {
    usePathname.mockReturnValue("/admin/betting/users");
    render(<AdminBettingTabs />);

    expect(screen.getByRole("link", { name: /^Users$/ }).getAttribute("aria-current")).toBe(
      "page",
    );
    // "Markets" lives at the section root — a sibling subpage must not activate it
    expect(screen.getByRole("link", { name: /^Markets$/ }).getAttribute("aria-current")).toBeNull();
  });
});
