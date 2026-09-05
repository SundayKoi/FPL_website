import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Player } from "@/lib/draft/types";
import { buildLineupSlots } from "@/lib/my-team/presentation";
import { MatchLineupComparison } from "./MatchLineupComparison";

function player(role: Player["role"], display_name: string, canonical_player_id: string | null = null): Player {
  return { id: role, draft_id: "draft", display_name, role, rank: null, opgg_url: null, notes: null, canonical_player_id, team_id: null, price: null, acquisition: null };
}

afterEach(cleanup);

describe("MatchLineupComparison", () => {
  it("renders five canonical role rows with both team names and the viewer marker", () => {
    const slots = buildLineupSlots({
      mine: [player("top", "My Top"), player("mid", "You Mid", "pool-1")],
      opponent: [player("top", "Their Top")],
      playerPoolId: "pool-1",
    });
    render(<MatchLineupComparison myTeamName="Meridian" opponentName="Academy Two" slots={slots} myMultiOpggUrl={null} opponentMultiOpggUrl={null} opponentUnavailable={false} />);

    expect(screen.getByRole("heading", { name: "Match lineups" })).toBeTruthy();
    expect(screen.getByText("Meridian")).toBeTruthy();
    expect(screen.getByText("Academy Two")).toBeTruthy();
    expect(screen.getAllByRole("row")).toHaveLength(6);
    expect(screen.getByText("You")).toBeTruthy();
    expect(screen.getAllByText("Open").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Not listed").length).toBeGreaterThan(0);
  });

  it("keeps own players visible when opponent roster lookup fails", () => {
    const slots = buildLineupSlots({ mine: [player("support", "Own Support")], opponent: null, playerPoolId: null });
    render(<MatchLineupComparison myTeamName="Meridian" opponentName="Academy Two" slots={slots} myMultiOpggUrl={null} opponentMultiOpggUrl={null} opponentUnavailable />);

    expect(screen.getByText("Own Support")).toBeTruthy();
    expect(screen.getAllByText("Unavailable")).toHaveLength(5);
  });

  it("opens team-level OP.GG links externally when available", () => {
    const slots = buildLineupSlots({ mine: [], opponent: [], playerPoolId: null });
    render(<MatchLineupComparison myTeamName="Meridian" opponentName="Academy Two" slots={slots} myMultiOpggUrl="https://op.gg/mine" opponentMultiOpggUrl="https://op.gg/theirs" opponentUnavailable={false} />);

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(2);
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["https://op.gg/mine", "https://op.gg/theirs"]);
    expect(links.map((link) => link.getAttribute("target"))).toEqual(["_blank", "_blank"]);
    expect(links.map((link) => link.getAttribute("rel"))).toEqual(["noreferrer", "noreferrer"]);
  });
});
