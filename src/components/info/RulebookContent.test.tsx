import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import RulebookContent from "./RulebookContent";

describe("RulebookContent", () => {
  afterEach(cleanup);

  it("renders the title and major section anchors", () => {
    render(<RulebookContent />);

    expect(
      screen.getByRole("heading", { name: /official rulebook/i, level: 1 }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("heading", { name: "1. League Structure", level: 2 })
        .getAttribute("id"),
    ).toBe("league-structure");
    expect(
      screen
        .getByRole("heading", { name: "12. Admin Discretion", level: 2 })
        .getAttribute("id"),
    ).toBe("admin-discretion");
  });

  it("preserves representative source wording", () => {
    render(<RulebookContent />);

    expect(
      screen.getByText(
        /The FPL is a franchise-based league featuring multiple established organizations\./i,
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(/Matches occur weekly on Mondays at 8:00 PM EST\./i),
    ).toBeTruthy();
    expect(
      screen.getByText(
        /All decisions regarding conduct violations are final and binding\./i,
      ),
    ).toBeTruthy();
  });

  it("omits signup sections from the on-page Rulebook", () => {
    render(<RulebookContent />);

    expect(screen.queryByRole("heading", { name: "Player Sign-Ups" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Captain Sign-Ups" })).toBeNull();
    expect(screen.queryByText("https://forms.gle/rKdxaVfXnvAhD8wQA")).toBeNull();
    expect(screen.queryByText("https://forms.gle/MrzDgQ51K7KyEt4q6")).toBeNull();
  });
});
