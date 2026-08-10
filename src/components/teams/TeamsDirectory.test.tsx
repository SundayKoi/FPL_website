import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PLACEHOLDER_TEAMS } from "./placeholderTeams";
import TeamsDirectory from "./TeamsDirectory";

afterEach(cleanup);

describe("TeamsDirectory", () => {
  it("renders the twelve preview teams with complete role rows", () => {
    render(
      <TeamsDirectory
        draftName={null}
        isPreview
        teams={PLACEHOLDER_TEAMS}
      />,
    );

    expect(screen.getByRole("heading", { name: "Teams" })).toBeTruthy();
    expect(screen.getByText("PREVIEW DATA")).toBeTruthy();

    const cards = screen.getAllByRole("article");
    expect(cards).toHaveLength(12);
    for (const card of cards) {
      expect(within(card).getByText("TOP")).toBeTruthy();
      expect(within(card).getByText("JG")).toBeTruthy();
      expect(within(card).getByText("MID")).toBeTruthy();
      expect(within(card).getByText("ADC")).toBeTruthy();
      expect(within(card).getByText("SUP")).toBeTruthy();
      expect(within(card).getByText(/Captain/)).toBeTruthy();
      expect(within(card).getByText(/Remaining budget/)).toBeTruthy();
    }
  });

  it("renders the selected draft label and supplied controls", () => {
    render(
      <TeamsDirectory
        draftName="Split 5"
        isPreview={false}
        teams={[PLACEHOLDER_TEAMS[0]]}
        adminControls={<label htmlFor="draft">Display draft</label>}
        rosterContent={<p>Editing enabled</p>}
      />,
    );

    expect(screen.getByText("Split 5")).toBeTruthy();
    expect(screen.queryByText("PREVIEW DATA")).toBeNull();
    expect(screen.getByText("Display draft")).toBeTruthy();
    expect(screen.getByText("Editing enabled")).toBeTruthy();
  });
});
