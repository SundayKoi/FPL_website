import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Draft, Player, Team } from "@/lib/draft/types";
import DraftSetupPreview from "./DraftSetupPreview";

const setupDraft: Draft = {
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
};

const team: Team = {
  id: "team-a",
  draft_id: setupDraft.id,
  name: "Team Alpha",
  captain_profile_id: "profile-a",
  captain_profile_id_2: null,
  abbreviation: "ALP",
  image_url: null,
  banner_color: "#f0b429",
  division: null,
  nomination_position: 1,
  budget_start: 100,
  points_remaining: 100,
};

const player: Player = {
  id: "player-top",
  draft_id: setupDraft.id,
  display_name: "Top Prospect",
  role: "top",
  rank: "Diamond I",
  opgg_url: null,
  notes: null,
  team_id: null,
  price: null,
  acquisition: null,
};

const assignedPlayer: Player = {
  ...player,
  id: "player-assigned-top",
  display_name: "Assigned Top",
  rank: "Master I",
  team_id: team.id,
  price: 0,
  acquisition: "captain",
};

afterEach(cleanup);

describe("DraftSetupPreview", () => {
  it("renders a read-only scheduled preview without draft controls", () => {
    render(<DraftSetupPreview draft={setupDraft} teams={[team]} players={[player, assignedPlayer]} />);

    expect(screen.getByText(/spectator preview/i)).toBeTruthy();
    expect(screen.getByText("Team Alpha")).toBeTruthy();
    expect(screen.getByText("#1 · ALP")).toBeTruthy();
    expect(screen.getByText("Top Prospect")).toBeTruthy();
    expect(screen.getByText("Diamond I")).toBeTruthy();
    expect(screen.getByText("Assigned Top")).toBeTruthy();
    expect(screen.getByText(/Master I/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /bid|nominate/i })).toBeNull();
  });

  it("shows both primary and second-captain setup indicators when the second captain is assigned", () => {
    render(
      <DraftSetupPreview
        draft={setupDraft}
        teams={[{ ...team, captain_profile_id_2: "profile-b" }]}
        players={[player, assignedPlayer]}
      />
    );

    expect(screen.getByText("Captain assigned")).toBeTruthy();
    expect(screen.getByText("Second captain assigned")).toBeTruthy();
    expect(screen.queryByText(/profile-b/i)).toBeNull();
  });

  it("keeps the pending primary-captain status when no primary captain is assigned", () => {
    render(
      <DraftSetupPreview
        draft={setupDraft}
        teams={[{ ...team, captain_profile_id: null, captain_profile_id_2: null }]}
        players={[player, assignedPlayer]}
      />
    );

    expect(screen.getByText("Captain pending")).toBeTruthy();
    expect(screen.queryByText("Second captain assigned")).toBeNull();
  });

  it("shows available players above the team cards", () => {
    render(<DraftSetupPreview draft={setupDraft} teams={[team]} players={[player, assignedPlayer]} />);

    const poolHeading = screen.getByRole("heading", { name: "Available players" });
    const teamsHeading = screen.getByRole("heading", { name: "Draft order & budgets" });
    expect(poolHeading.compareDocumentPosition(teamsHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("sorts each role column by rank with unranked players last", () => {
    const emeraldTop: Player = {
      ...player,
      id: "player-top-emerald",
      display_name: "Emerald Entry",
      rank: "E1",
    };
    const diamondTwoTop: Player = {
      ...player,
      id: "player-top-diamond-two",
      display_name: "Diamond Two",
      rank: "D2",
    };
    const diamondOneTop: Player = {
      ...player,
      id: "player-top-diamond-one",
      display_name: "Diamond One",
      rank: "D1",
    };
    const unrankedTop: Player = {
      ...player,
      id: "player-top-unranked",
      display_name: "Unranked Prospect",
      rank: null,
    };

    render(
      <DraftSetupPreview
        draft={setupDraft}
        teams={[team]}
        players={[emeraldTop, diamondTwoTop, unrankedTop, diamondOneTop, assignedPlayer]}
      />,
    );

    const topColumn = screen.getByRole("heading", { name: "Top" }).closest("section");
    const rows = within(topColumn as HTMLElement).getAllByRole("listitem");

    expect(rows.map((row) => row.textContent)).toEqual([
      "Diamond OneD1",
      "Diamond TwoD2",
      "Emerald EntryE1",
      "Unranked ProspectUnranked",
    ]);
  });

  it("breaks equal ranks alphabetically by display name", () => {
    const zuluTop: Player = {
      ...player,
      id: "player-top-zulu",
      display_name: "Zulu Top",
      rank: "D1",
    };
    const alphaTop: Player = {
      ...player,
      id: "player-top-alpha",
      display_name: "Alpha Top",
      rank: "D1",
    };

    render(
      <DraftSetupPreview
        draft={setupDraft}
        teams={[team]}
        players={[zuluTop, alphaTop, assignedPlayer]}
      />,
    );

    const topColumn = screen.getByRole("heading", { name: "Top" }).closest("section");
    const rows = within(topColumn as HTMLElement).getAllByRole("listitem");

    expect(rows.map((row) => row.textContent)).toEqual([
      "Alpha TopD1",
      "Zulu TopD1",
    ]);
  });
});
