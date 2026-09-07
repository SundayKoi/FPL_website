import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import InfoPage from "./page";

describe("InfoPage", () => {
  afterEach(cleanup);

  it("links to the standalone Info destinations", async () => {
    render(await InfoPage());

    expect(screen.getByRole("heading", { name: "About the league", level: 1 })).toBeTruthy();
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

  it("links to the support page instead of repeating it", async () => {
    render(await InfoPage());

    // The identical support section used to render here AND on /support-devs.
    expect(screen.getByRole("link", { name: "Support the Devs" }).getAttribute("href")).toBe("/support-devs");
    expect(screen.queryByAltText("PayPal QR code for Zachari Bultman")).toBeNull();
    expect(screen.getByRole("link", { name: "Premium & Patron" }).getAttribute("href")).toBe("/membership");
  });
});
