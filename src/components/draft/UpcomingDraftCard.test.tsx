import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Draft } from "@/lib/draft/types";
import UpcomingDraftCard from "./UpcomingDraftCard";

afterEach(cleanup);

const draft: Draft = {
  id: "draft-academy",
  name: "Academy Draft",
  status: "setup",
  countdown_seconds: 60,
  round_minimums: [10, 5, 1],
  current_round: 1,
  current_nominator_team_id: null,
  paused_time_remaining: null,
  created_at: "2026-08-15T00:00:00.000Z",
  starts_at: "2026-08-17T00:00:00.000Z",
};

describe("UpcomingDraftCard", () => {
  it("links to the spectator preview and shows the scheduled draft", () => {
    render(<UpcomingDraftCard draft={draft} />);

    expect(screen.getByText("Academy Draft")).toBeTruthy();
    expect(screen.getByLabelText("Draft start countdown")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Preview draft board/i }).getAttribute("href")).toBe(
      "/draft/draft-academy"
    );
  });
});
