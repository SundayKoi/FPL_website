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
      screen.getByRole("link", { name: "League Structure" }).getAttribute("href"),
    ).toBe("#league-structure");
    expect(
      within(screen.getByRole("article", { name: "Rulebook resource" })).getByRole(
        "link",
        { name: /open resource/i },
      ).getAttribute("href"),
    ).toBe(
      "https://docs.google.com/document/d/1rtYs_uhNwp7lwMaUfprRLKlOy0UuXWTs/edit#heading=h.k95um6blnxq7",
    );
    expect(
      screen
        .getByRole("link", { name: /back to rulebook sections/i })
        .getAttribute("href"),
    ).toBe("#rulebook-sections");
  });
});
