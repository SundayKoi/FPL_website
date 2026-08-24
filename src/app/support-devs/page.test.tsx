import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import SupportDevsPage from "./page";

describe("SupportDevsPage", () => {
  afterEach(cleanup);

  it("renders the standalone support page and PayPal QR code without a standalone donation link", () => {
    render(<SupportDevsPage />);

    expect(screen.getByRole("heading", { name: "Support the Devs", level: 1 })).toBeTruthy();
    expect(screen.getByAltText("PayPal QR code for Zachari Bultman")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /support via paypal/i })).toBeNull();
  });

  it("keeps each Venmo link under its developer card", () => {
    render(<SupportDevsPage />);

    const zachari = within(screen.getByAltText("Dribb avatar").closest("article")!).getByRole("link", {
      name: "Venmo Zachari Bultman",
    });
    expect(zachari.getAttribute("href")).toBe("https://venmo.com/u/Zachari-Bultman");
    const matthew = within(screen.getByAltText("Spies avatar").closest("article")!).getByRole("link", {
      name: "Venmo Matthew Wolanski",
    });
    expect(matthew.getAttribute("href")).toBe("https://venmo.com/u/Matthew-Wolanski");
    // target=_blank without noopener hands the new tab a window.opener
    // handle back to us.
    for (const link of [zachari, matthew]) {
      expect(link.getAttribute("rel")).toContain("noopener");
    }
    expect(screen.queryByRole("link", { name: "Venmo Zachari" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Venmo Matthew" })).toBeNull();
  });

  it("italicises what the donations pay for", () => {
    const { container } = render(<SupportDevsPage />);

    const note = [...container.querySelectorAll("p")].find((paragraph) =>
      /donations will be used to cover website costs/i.test(paragraph.textContent ?? ""),
    );
    expect(note).toBeTruthy();
    expect(note?.className).toContain("italic");
  });

  it("shows the developers with their Discord handles and avatars", () => {
    render(<SupportDevsPage />);

    expect(screen.getByRole("heading", { name: "Meet the Devs", level: 2 })).toBeTruthy();
    expect(screen.getByText("Dribb")).toBeTruthy();
    expect(screen.getByText("@dribb")).toBeTruthy();
    expect(screen.getByAltText("Dribb avatar")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Venmo Zachari Bultman" }).getAttribute("href")).toBe(
      "https://venmo.com/u/Zachari-Bultman",
    );
    expect(screen.getByText("Spies")).toBeTruthy();
    expect(screen.getByText("@spiesss")).toBeTruthy();
    expect(screen.getByAltText("Spies avatar")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Venmo Matthew Wolanski" }).getAttribute("href")).toBe(
      "https://venmo.com/u/Matthew-Wolanski",
    );
  });
});
