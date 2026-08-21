import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import TeamRecentDrafts, { type TeamDraftRow } from "./TeamRecentDrafts";

afterEach(cleanup);

const row: TeamDraftRow = {
  fixtureId: "fx-1",
  opponent: "Dribb",
  won: true,
  score: "2–1",
  stageLabel: "Week 4",
  picks: ["Ahri", "Zed", "Jinx", "Lulu", "Ornn"],
  bans: ["Aatrox", "Annie", null, "Amumu", "Akali"],
  confirmed: true,
};

describe("TeamRecentDrafts", () => {
  it("renders nothing when there are no drafted series", () => {
    const { container } = render(<TeamRecentDrafts rows={[]} />);
    expect(container.innerHTML).toBe("");
  });

  it("shows the result, opponent, champion chips, and a match link", () => {
    render(<TeamRecentDrafts rows={[row]} />);

    expect(screen.getByText(/W 2–1/)).toBeTruthy();
    expect(screen.getByText("Dribb")).toBeTruthy();
    expect(screen.getByText(/role order/)).toBeTruthy();
    // 5 picks + 4 named bans render champion icons; the skipped ban shows a
    // dashed placeholder instead of an image.
    expect(screen.getAllByRole("img").length).toBe(9);
    expect(screen.getByTitle("Ahri")).toBeTruthy();
    expect(screen.getByRole("link", { name: /match/i }).getAttribute("href")).toBe("/match/fx-1");
  });

  it("marks unreported results with a dash", () => {
    render(<TeamRecentDrafts rows={[{ ...row, won: null, score: null }]} />);
    expect(screen.getByText("–")).toBeTruthy();
  });
});
