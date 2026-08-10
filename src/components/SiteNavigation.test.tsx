import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import SiteNavigation from "./SiteNavigation";

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
    expect(screen.getByRole("link", { name: /^Info$/ }).getAttribute("href")).toBe("/info");
    expect(screen.getByText("Account")).toBeTruthy();
  });
});
