import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RosterTeamView } from "@/lib/draft/types";
import { PLACEHOLDER_TEAMS } from "./placeholderTeams";
import TeamRosterCard from "./TeamRosterCard";

afterEach(cleanup);

describe("TeamRosterCard", () => {
  it("renders the team image and no point or budget stats", () => {
    const team = { ...PLACEHOLDER_TEAMS[0], imageUrl: "https://img.test/team.png" };

    render(<TeamRosterCard team={team} />);

    const image = screen.getByRole("img", { name: `${team.name} logo` });
    expect(image).toBeTruthy();
    expect(image.className).toContain("h-24");
    expect(screen.getByText(team.abbreviation)).toBeTruthy();
    expect(screen.queryByText("Roster")).toBeNull();
    expect(screen.queryByText(/pts/)).toBeNull();
    expect(screen.queryByText(/Remaining budget/)).toBeNull();
  });

  it("uses a saved banner color when one is available", () => {
    const team = { ...PLACEHOLDER_TEAMS[0], bannerColor: "#123456" };

    render(<TeamRosterCard team={team} />);

    expect(screen.getByRole("group", { name: `${team.name} banner` }).getAttribute("style")).toContain(
      "background-color: rgb(18, 52, 86);"
    );
  });

  it("renders the team abbreviation when no image is available", () => {
    const team = PLACEHOLDER_TEAMS[0];

    render(<TeamRosterCard team={team} />);

    expect(screen.getByText(team.abbreviation)).toBeTruthy();
    expect(screen.queryByRole("img", { name: `${team.name} logo` })).toBeNull();
    expect(screen.queryByText(/pts/)).toBeNull();
    expect(screen.queryByText(/Remaining budget/)).toBeNull();
  });

  it("marks the captain row as locked and only makes other rows draggable", () => {
    render(<TeamRosterCard team={PLACEHOLDER_TEAMS[0]} editable />);

    const card = screen.getByRole("article", { name: PLACEHOLDER_TEAMS[0].name });
    const rows = within(card).getAllByRole("listitem");
    expect(rows).toHaveLength(5);
    expect(rows[0].getAttribute("draggable")).toBe("false");
    expect(within(rows[0]).getByLabelText("Captain, cannot be traded")).toBeTruthy();
    expect(rows[1].getAttribute("draggable")).toBe("true");
    expect(within(rows[1]).getByRole("button", { name: /Swap with/ })).toBeTruthy();
  });

  it("shows a free-agency badge while keeping free-agency rows draggable", () => {
    const onKeyboardSwap = vi.fn();
    const team: RosterTeamView = {
      ...PLACEHOLDER_TEAMS[0],
      players: [
        {
          id: "player-captain",
          role: "top",
          displayName: "Captain Player",
          price: 15,
          acquisition: "captain",
        },
        {
          id: "player-free-agency",
          role: "jungle",
          displayName: "Free Agent Player",
          price: 12,
          acquisition: "free_agency",
        },
        {
          id: "empty-mid",
          role: "mid",
          displayName: "Open slot",
          price: 0,
          acquisition: null,
          isEmpty: true,
        },
        {
          id: "empty-adc",
          role: "adc",
          displayName: "Open slot",
          price: 0,
          acquisition: null,
          isEmpty: true,
        },
        {
          id: "empty-support",
          role: "support",
          displayName: "Open slot",
          price: 0,
          acquisition: null,
          isEmpty: true,
        },
      ],
    };

    render(<TeamRosterCard team={team} editable onKeyboardSwap={onKeyboardSwap} />);

    const card = screen.getByRole("article", { name: team.name });
    const captainRow = within(card).getByText("Captain Player").closest("li")!;
    const freeAgencyRow = within(card).getByText("Free Agent Player").closest("li")!;

    expect(screen.getByText("C")).toBeTruthy();
    expect(screen.getByText("FA")).toBeTruthy();
    expect(captainRow.getAttribute("draggable")).toBe("false");
    expect(freeAgencyRow.getAttribute("draggable")).toBe("true");
    expect(within(freeAgencyRow).getByRole("button", { name: /Swap with Free Agent Player/ })).toBeTruthy();
    within(freeAgencyRow).getByRole("button", { name: /Swap with Free Agent Player/ }).click();
    expect(onKeyboardSwap).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "player-free-agency",
        displayName: "Free Agent Player",
        acquisition: "free_agency",
      }),
    );
  });
});
