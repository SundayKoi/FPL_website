import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PlayerPool from "./PlayerPool";

describe("PlayerPool", () => {
  it("renders the compact pool in one column per role", () => {
    render(
      <PlayerPool
        compact
        showFilters={false}
        teams={[]}
        players={[
          { id: "top", draft_id: "draft-1", display_name: "Top Player", role: "top", rank: null, opgg_url: null, notes: null, team_id: null, price: null, acquisition: null },
          { id: "jungle", draft_id: "draft-1", display_name: "Jungle Player", role: "jungle", rank: null, opgg_url: null, notes: null, team_id: null, price: null, acquisition: null },
          { id: "mid", draft_id: "draft-1", display_name: "Mid Player", role: "mid", rank: null, opgg_url: null, notes: null, team_id: null, price: null, acquisition: null },
          { id: "adc", draft_id: "draft-1", display_name: "ADC Player", role: "adc", rank: null, opgg_url: null, notes: null, team_id: null, price: null, acquisition: null },
          { id: "support", draft_id: "draft-1", display_name: "Support Player", role: "support", rank: null, opgg_url: null, notes: null, team_id: null, price: null, acquisition: null },
        ]}
      />,
    );

    for (const role of ["Top", "Jungle", "Mid", "ADC", "Support"]) {
      expect(screen.getByRole("heading", { name: role })).toBeTruthy();
    }
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "All" })).toBeNull();
  });
});
