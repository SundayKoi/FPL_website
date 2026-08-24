import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import SupportDevsPage from "./page";

describe("SupportDevsPage", () => {
  afterEach(cleanup);

  it("renders the standalone support page and PayPal destination", () => {
    render(<SupportDevsPage />);

    expect(screen.getByRole("heading", { name: "Support the Devs", level: 1 })).toBeTruthy();
    expect(screen.getByAltText("PayPal QR code for Zachari Bultman")).toBeTruthy();

    const paypalLink = screen.getByRole("link", { name: /support via paypal/i });
    expect(paypalLink.getAttribute("href")).toBe("https://www.paypal.com/paypalme/ZBultman");
    expect(paypalLink.getAttribute("target")).toBe("_blank");
  });

  it("offers both people's Venmo alongside PayPal", () => {
    render(<SupportDevsPage />);

    const zachari = screen.getByRole("link", { name: /venmo zachari/i });
    expect(zachari.getAttribute("href")).toBe("https://venmo.com/u/Zachari-Bultman");
    const matthew = screen.getByRole("link", { name: /venmo matthew/i });
    expect(matthew.getAttribute("href")).toBe("https://venmo.com/u/Mwolanski1");
    // target=_blank without noopener hands the new tab a window.opener
    // handle back to us.
    for (const link of [zachari, matthew]) {
      expect(link.getAttribute("rel")).toContain("noopener");
    }
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
