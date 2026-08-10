import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import SiteNavigation from "./SiteNavigation";

describe("SiteNavigation", () => {
  it("links to Home and Draft Central while marking unavailable areas", () => {
    render(<SiteNavigation authSlot={<span>Account</span>} />);

    expect(screen.getByRole("link", { name: /^Home$/ }).getAttribute("href")).toBe("/");
    expect(screen.getByRole("link", { name: /^Draft$/ }).getAttribute("href")).toBe(
      "/#draft-central",
    );
    const stats = screen.getByText(/^Stats$/);
    const schedule = screen.getByText(/^Schedule$/);
    const info = screen.getByText(/^Info$/);

    expect(stats.closest("a")).toBeNull();
    expect(stats.closest("button")).toBeNull();
    expect(schedule.closest("a")).toBeNull();
    expect(schedule.closest("button")).toBeNull();
    expect(info.closest("a")).toBeNull();
    expect(info.closest("button")).toBeNull();

    expect(screen.queryByRole("link", { name: /^Stats/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Stats/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /^Schedule/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Schedule/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /^Info/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Info/i })).toBeNull();

    expect(screen.getAllByText("Coming soon")).toHaveLength(3);
    expect(screen.getByText("Account")).toBeTruthy();
  });
});
