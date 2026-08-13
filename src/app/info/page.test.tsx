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
});
