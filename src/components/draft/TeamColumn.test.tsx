import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import TeamColumn from "./TeamColumn";

afterEach(cleanup);

describe("TeamColumn", () => {
  it("labels a directly assigned player with the admin badge", () => {
    render(<TeamColumn
      team={{ id: "team-1", draft_id: "draft-1", name: "Team A", abbreviation: "TA", image_url: null, banner_color: "#083344", captain_profile_id: null,
        division: null, nomination_position: 1, budget_start: 100, points_remaining: 88 }}
      players={[{ id: "player-1", draft_id: "draft-1", display_name: "Mid One", role: "mid",
        rank: null, opgg_url: null, notes: null, team_id: "team-1", price: 12, acquisition: "admin" }]}
      isNominator={false}
      isMyTeam={false}
    />);
    expect(screen.getByText("ADM")).toBeTruthy();
  });

  it("supports individual and bulk collapse while starting expanded", () => {
    const team = {
      id: "team-1", draft_id: "draft-1", name: "Team A", abbreviation: "TA", image_url: null,
      banner_color: "#083344", captain_profile_id: null, division: null, nomination_position: 1,
      budget_start: 100, points_remaining: 88,
    };
    const players = [{
      id: "player-1", draft_id: "draft-1", display_name: "Mid One", role: "mid" as const,
      rank: null, opgg_url: null, notes: null, team_id: "team-1", price: 12, acquisition: "admin" as const,
    }];

    const { rerender } = render(
      <TeamColumn key="expanded" team={team} players={players} isNominator={false} isMyTeam={false} initialCollapsed={false} />,
    );

    expect(screen.getByText("Mid One")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Collapse team Team A" }));
    expect(screen.queryByText("Mid One")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Expand team Team A" }));
    expect(screen.getByText("Mid One")).toBeTruthy();

    rerender(
      <TeamColumn key="collapsed" team={team} players={players} isNominator={false} isMyTeam={false} initialCollapsed={true} />,
    );
    expect(screen.queryByText("Mid One")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Expand team Team A" }));
    expect(screen.getByText("Mid One")).toBeTruthy();
  });
});
