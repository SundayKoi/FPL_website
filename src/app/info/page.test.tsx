import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import InfoPage from "./page";

describe("InfoPage", () => {
  afterEach(cleanup);

  it("renders all requested resources and the Rulebook navigation", () => {
    render(<InfoPage />);

    expect(screen.getByRole("heading", { name: "Payment", level: 2 })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "MasterDoc", level: 2 })).toBeTruthy();
    expect(
      within(screen.getByRole("article", { name: "Rulebook resource" })).getByRole(
        "heading",
        { name: "Rulebook", level: 2 },
      ),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: /1\. league structure/i })
        .getAttribute("href"),
    ).toBe("#league-structure");
  });
});
