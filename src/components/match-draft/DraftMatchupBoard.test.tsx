import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DraftMatchupBoard } from "./DraftMatchupBoard";
import { createDraftMatchupView } from "@/lib/match-draft/presentation";
import type { MatchDraftAction } from "@/lib/match-draft/types";

const action = (
  stepIndex: number,
  side: "blue" | "red",
  slot: number,
  champion: string | null,
  skipped = false,
): MatchDraftAction => ({
  stepIndex,
  side,
  kind: "ban",
  slot,
  champion,
  skipped,
});

const view = createDraftMatchupView({
  gameNumber: 1,
  blueTeam: { name: "Blue Team", abbreviation: "BLU" },
  redTeam: { name: "Red Team", abbreviation: "RED" },
  actions: [
    action(0, "blue", 1, "Aatrox"),
    action(1, "red", 1, "Ahri"),
    action(2, "blue", 2, "Amumu"),
    action(3, "red", 2, "Zed"),
    action(4, "blue", 3, null, true),
    action(5, "red", 3, "Zyra"),
    action(12, "red", 4, "Thresh"),
    action(13, "blue", 4, "Lulu"),
    action(14, "red", 5, "Jinx"),
    action(15, "blue", 5, "Sett"),
  ],
});

afterEach(cleanup);

describe("DraftMatchupBoard", () => {
  it("keeps all five bans in mirrored DOM order with explicit phase gaps", () => {
    render(
      <DraftMatchupBoard view={view} imageSize="md" layout="columns">
        <div>Pool</div>
      </DraftMatchupBoard>,
    );

    const blueStrip = screen.getByTestId("ban-strip-blue");
    const redStrip = screen.getByTestId("ban-strip-red");

    expect(within(blueStrip).getAllByTestId(/^ban-blue-/).map((tile) => tile.dataset.testid)).toEqual([
      "ban-blue-1",
      "ban-blue-2",
      "ban-blue-3",
      "ban-blue-4",
      "ban-blue-5",
    ]);
    expect(within(redStrip).getAllByTestId(/^ban-red-/).map((tile) => tile.dataset.testid)).toEqual([
      "ban-red-5",
      "ban-red-4",
      "ban-red-3",
      "ban-red-2",
      "ban-red-1",
    ]);
    expect(within(blueStrip).getByTestId("blue-ban-phase-gap").getAttribute("data-phase-break")).toBe("true");
    expect(within(redStrip).getByTestId("red-ban-phase-gap").getAttribute("data-phase-break")).toBe("true");
    expect(within(blueStrip).getByTestId("ban-blue-3").textContent).toContain("Skip");
    expect(within(blueStrip).getByTestId("ban-blue-4").textContent).toContain("Lulu");
  });

  it("keeps mirrored red ban actions attached to their original step", () => {
    const requestChange = vi.fn();
    const requestChangeFor = vi.fn(() => requestChange);

    render(
      <DraftMatchupBoard
        view={{ ...view, live: { currentStepIndex: 12, turnStartedAt: null, secondsLeft: null, clockRunning: true, blueReady: true, redReady: true } }}
        requestChangeFor={requestChangeFor}
      />,
    );

    const redStrip = screen.getByTestId("ban-strip-red");
    expect(within(redStrip).getByTestId("ban-red-4").className).toContain("border-gold");
    fireEvent.click(within(redStrip).getByRole("button", { name: "Request change to red ban 5" }));

    expect(requestChange).toHaveBeenCalledTimes(1);
    expect(requestChangeFor).toHaveBeenCalledWith(14);
  });
});
