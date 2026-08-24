import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import InfoPage from "./page";

describe("InfoPage", () => {
  afterEach(cleanup);

  it("links to the standalone Info destinations", async () => {
    render(await InfoPage());

    expect(screen.getByRole("heading", { name: "Info", level: 1 })).toBeTruthy();
    expect(screen.getByRole("link", { name: "League Links" }).getAttribute("href")).toBe(
      "/league-links",
    );
    expect(screen.getByRole("link", { name: "Rulebook" }).getAttribute("href")).toBe(
      "/rulebook",
    );
    expect(screen.getByRole("link", { name: "Sign Up" }).getAttribute("href")).toBe(
      "/signup",
    );
  });

  it("shows the support-the-devs destination with the PayPal QR code and developer links", async () => {
    render(await InfoPage());

    expect(screen.getByRole("heading", { name: "Support the Devs", level: 2 })).toBeTruthy();
    expect(screen.getByAltText("PayPal QR code for Zachari Bultman")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /support via paypal/i })).toBeNull();
    expect(screen.getByRole("link", { name: "Venmo Zachari Bultman" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Venmo Matthew Wolanski" })).toBeTruthy();
  });
});
