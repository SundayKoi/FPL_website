import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import PlayersPage from "./page";

describe("PlayersPage", () => {
  afterEach(cleanup);

  it("renders the Season 5 player directory", async () => {
    render(await PlayersPage());

    expect(screen.getByRole("heading", { name: "Players", level: 1 })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Season 5" })).toBeTruthy();
    for (const role of ["Top", "Jungle", "Mid", "ADC", "Support"]) {
      expect(screen.getByRole("heading", { name: role, level: 2 })).toBeTruthy();
    }
  });
});
