import { cleanup, render, screen } from "@testing-library/react";
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
    expect(screen.queryByRole("button", { name: /bid|nominate/i })).toBeNull();
  });

  it("shows available players above the team cards", () => {
    render(<DraftSetupPreview draft={setupDraft} teams={[team]} players={[player, assignedPlayer]} />);

    const poolHeading = screen.getByRole("heading", { name: "Available players" });
    const teamsHeading = screen.getByRole("heading", { name: "Draft order & budgets" });
    expect(poolHeading.compareDocumentPosition(teamsHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
