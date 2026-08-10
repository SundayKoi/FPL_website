import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import TeamColumn from "./TeamColumn";

describe("TeamColumn", () => {
  it("labels a directly assigned player with the admin badge", () => {
    render(<TeamColumn
      team={{ id: "team-1", draft_id: "draft-1", name: "Team A", captain_profile_id: null,
        nomination_position: 1, budget_start: 100, points_remaining: 88 }}
      players={[{ id: "player-1", draft_id: "draft-1", display_name: "Mid One", role: "mid",
        rank: null, opgg_url: null, notes: null, team_id: "team-1", price: 12, acquisition: "admin" }]}
      isNominator={false}
      isMyTeam={false}
    />);
    expect(screen.getByText("ADM")).toBeTruthy();
  });
});
