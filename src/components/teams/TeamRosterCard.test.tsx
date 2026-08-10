import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PLACEHOLDER_TEAMS } from "./placeholderTeams";
import TeamRosterCard from "./TeamRosterCard";

afterEach(cleanup);

describe("TeamRosterCard", () => {
  it("renders the team image and no point or budget stats", () => {
    const team = { ...PLACEHOLDER_TEAMS[0], imageUrl: "https://img.test/team.png" };

    render(<TeamRosterCard team={team} />);

    expect(screen.getByRole("img", { name: `${team.name} logo` })).toBeTruthy();
    expect(screen.queryByText(/pts/)).toBeNull();
    expect(screen.queryByText(/Remaining budget/)).toBeNull();
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
});
