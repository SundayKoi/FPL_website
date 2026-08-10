import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import SiteNavigation from "./SiteNavigation";

describe("SiteNavigation", () => {
  it("links to Home and Draft Central while marking unavailable areas", () => {
    render(<SiteNavigation authSlot={<span>Account</span>} />);

    expect(screen.getByRole("link", { name: "Home", exact: true }).getAttribute("href")).toBe("/");
    expect(screen.getByRole("link", { name: "Draft", exact: true }).getAttribute("href")).toBe(
      "/#draft-central",
    );
    expect(screen.getAllByText("Coming soon")).toHaveLength(3);
    expect(screen.getByText("Account")).toBeTruthy();
  });
});
