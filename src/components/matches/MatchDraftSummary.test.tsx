import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import MatchDraftSummary, { sideRows, type DraftSummaryGame } from "./MatchDraftSummary";

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

describe("pick order", () => {
  /** Blue took Ahri FIRST and Sett THIRD, but the captains confirmed a role
   *  order that lists Sett (top) before Ahri (mid). Position in the row
   *  therefore says nothing about when a champion was taken. */
  const reordered = game({
    actions: [
      { stepIndex: 6, side: "blue", kind: "pick", slot: 1, champion: "Ahri" },
      { stepIndex: 9, side: "blue", kind: "pick", slot: 2, champion: "Lulu" },
      { stepIndex: 10, side: "blue", kind: "pick", slot: 3, champion: "Sett" },
    ],
    positions: { blue: ["Sett", null, "Ahri", null, "Lulu"] },
  });

  it("numbers each pick by when it was taken, not where it sits", () => {
    const { bans, picks, pickNumbers } = sideRows(reordered, "blue");
    void bans;
    expect(picks[0]).toBe("Sett");
    expect(pickNumbers[0]).toBe(3);
    expect(picks[2]).toBe("Ahri");
    expect(pickNumbers[2]).toBe(1);
  });

  it("leaves a slot with no pick unnumbered", () => {
    expect(sideRows(reordered, "blue").pickNumbers[1]).toBeNull();
  });

  it("renders the number beside the champion", () => {
    render(<MatchDraftSummary games={[reordered]} />);
    // Sett was pick 3 and leads the confirmed row.
    expect(screen.getAllByText("3").length).toBeGreaterThan(0);
  });

  it("anchors the section so the schedule can link straight to it", () => {
    const { container } = render(<MatchDraftSummary games={[reordered]} />);
    expect(container.querySelector("#draft")).toBeTruthy();
  });
});

describe("a full 20-action draft, shaped as the database stores one", () => {
  // The minimal fixtures above prove the mapping; this proves it against
  // the real thing — every step present, both sides, all five positions
  // filled, exactly what apply_match_draft_action writes.
  const SIDES = [
    "blue","red","blue","red","blue","red",
    "blue","red","red","blue","blue","red",
    "red","blue","red","blue",
    "red","blue","blue","red",
  ] as const;
  const KINDS = [
    "ban","ban","ban","ban","ban","ban",
    "pick","pick","pick","pick","pick","pick",
    "ban","ban","ban","ban",
    "pick","pick","pick","pick",
  ] as const;
  const SLOTS = [1,1,2,2,3,3, 1,1,2,2,3,3, 4,4,5,5, 4,4,5,5];

  const full = game({
    actions: SLOTS.map((slot, index) => ({
      stepIndex: index,
      side: SIDES[index],
      kind: KINDS[index],
      slot,
      champion: `${SIDES[index]}-${KINDS[index]}-${slot}`,
      playerName: null,
    })),
    // Blue's five picks, deliberately NOT in draft order.
    positions: {
      blue: ["blue-pick-3", "blue-pick-5", "blue-pick-1", "blue-pick-4", "blue-pick-2"],
      red: ["red-pick-1", "red-pick-2", "red-pick-3", "red-pick-4", "red-pick-5"],
    },
  });

  it("numbers every pick on both sides", () => {
    expect(sideRows(full, "blue").pickNumbers).toEqual([3, 5, 1, 4, 2]);
    expect(sideRows(full, "red").pickNumbers).toEqual([1, 2, 3, 4, 5]);
  });

  it("renders a badge for each of the ten picks", () => {
    const { container } = render(<MatchDraftSummary games={[full]} />);

    expect(container.querySelectorAll("[title^='Pick ']")).toHaveLength(10);
  });

  it("keeps bans out of the numbering", () => {
    // Ten picks, ten badges — a ban that leaked in would push it higher.
    expect(sideRows(full, "blue").bans).toHaveLength(5);
    expect(sideRows(full, "blue").pickNumbers.filter((n) => n !== null)).toHaveLength(5);
  });
});
