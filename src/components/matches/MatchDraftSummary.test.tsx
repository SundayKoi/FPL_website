import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import MatchDraftSummary, { type DraftSummaryGame } from "./MatchDraftSummary";

afterEach(cleanup);

const game = (over: Partial<DraftSummaryGame> = {}): DraftSummaryGame => ({
  gameNumber: 1,
  blueTeamName: "Blue Team",
  redTeamName: "Red Team",
  winnerTeam: null,
  actions: [
    { stepIndex: 0, side: "blue", kind: "ban", slot: 1, champion: "Aatrox" },
    { stepIndex: 6, side: "blue", kind: "pick", slot: 1, champion: "Ahri" },
    { stepIndex: 7, side: "red", kind: "pick", slot: 1, champion: "Annie" },
  ],
  positions: null,
  ...over,
});

describe("MatchDraftSummary", () => {
  it("renders nothing when no game has any recorded action", () => {
    const { container } = render(<MatchDraftSummary games={[game({ actions: [] })]} />);
    expect(container.innerHTML).toBe("");
  });

  it("shows picks, bans, and the recorded winner", () => {
    const { container } = render(<MatchDraftSummary games={[game({ winnerTeam: "Blue Team" })]} />);

    expect(screen.getByText("Pick / ban")).toBeTruthy();
    expect(screen.getByText("Blue Team win")).toBeTruthy();
    expect(container.querySelector('img[alt="Ahri"]')).toBeTruthy();
    expect(container.querySelector('img[alt="Annie"]')).toBeTruthy();
    // The ban renders crossed out.
    expect(container.querySelector('img[alt="Aatrox"]')?.className).toContain("grayscale");
  });

  it("orders picks by confirmed roles when the captains set them", () => {
    render(
      <MatchDraftSummary
        games={[game({ positions: { blue: ["Ahri", null, null, null, null] } })]}
      />,
    );

    // Role labels only appear on a confirmed side.
    expect(screen.getByText("Top")).toBeTruthy();
  });
});
