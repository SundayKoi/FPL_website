import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Draft } from "@/lib/draft/types";
import DraftDirectory from "./DraftDirectory";

function draft(overrides: Partial<Draft> = {}): Draft {
  return {
    id: "draft-season-5",
    name: "FPL Season 5",
    status: "setup",
    countdown_seconds: 60,
    round_minimums: [10, 5, 1],
    current_round: 1,
    current_nominator_team_id: null,
    paused_time_remaining: null,
    created_at: "2026-08-15T00:00:00.000Z",
    starts_at: "2026-08-16T00:00:00.000Z",
    ...overrides,
  };
}

afterEach(cleanup);

describe("DraftDirectory", () => {
  it("links each draft card to its existing board", () => {
    render(<DraftDirectory drafts={[draft({ id: "summer-auction", name: "Summer Auction", status: "live" })]} />);

    expect(screen.getByRole("heading", { name: "Draft Central", level: 1 })).toBeTruthy();
    expect(screen.getByRole("link", { name: /summer auction/i }).getAttribute("href")).toBe(
      "/draft/summer-auction"
    );
    expect(screen.getByText("live")).toBeTruthy();
  });

  it("renders both configured upcoming drafts with independent countdown cards", () => {
    render(
      <DraftDirectory
        drafts={[
          draft(),
          draft({ id: "draft-academy", name: "Academy Draft", starts_at: "2026-08-17T00:00:00.000Z" }),
        ]}
      />
    );

    expect(screen.getAllByText("FPL Season 5")).toHaveLength(2);
    expect(screen.getAllByText("Academy Draft")).toHaveLength(2);
    expect(screen.getAllByLabelText("Draft start countdown")).toHaveLength(2);
  });

  it("keeps unscheduled drafts in the draft list with their board links", () => {
    render(<DraftDirectory drafts={[draft({ starts_at: null, status: "complete" })]} />);

    expect(screen.getByText("FPL Season 5")).toBeTruthy();
    expect(screen.getByRole("link", { name: /FPL Season 5/i }).getAttribute("href")).toBe(
      "/draft/draft-season-5"
    );
  });
});
