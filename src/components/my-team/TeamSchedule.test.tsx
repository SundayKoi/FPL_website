import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import TeamSchedule from "./TeamSchedule";

afterEach(cleanup);

const base = {
  season: "S5",
  stage: "week_1" as const,
  division: null,
  best_of: 3 as const,
  sort_order: 0,
  created_at: "2026-08-01T00:00:00Z",
};

describe("TeamSchedule", () => {
  it("shows upcoming fixtures before recent results and derives the team's score", () => {
    render(<TeamSchedule
      teamName="My Team"
      fixtures={[
        {
          ...base,
          id: "result",
          team_a: "Enemy Team",
          team_b: "My Team",
          scheduled_at: "2026-08-01T00:00:00Z",
          score_a: 1,
          score_b: 2,
        },
        {
          ...base,
          id: "upcoming",
          team_a: "My Team",
          team_b: "Next Team",
          scheduled_at: "2026-09-01T00:00:00Z",
          score_a: null,
          score_b: null,
        },
      ]}
    />);

    const text = screen.getByRole("region", { name: /team schedule/i }).textContent ?? "";
    expect(text.indexOf("Next Team")).toBeLessThan(text.indexOf("Enemy Team"));
    expect(screen.getByText("W 2–1")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("keeps a calm empty state when no fixtures are configured", () => {
    render(<TeamSchedule teamName="My Team" fixtures={[]} />);

    expect(screen.getByText(/no team fixtures are scheduled yet/i)).toBeTruthy();
  });
});
