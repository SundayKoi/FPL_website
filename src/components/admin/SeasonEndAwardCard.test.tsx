import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PlayerCardData } from "@/lib/cards/build";
import SeasonEndAwardCard from "./SeasonEndAwardCard";

const card = {
  slug: "alice",
  name: "Alice",
  tag: "NA1",
  teamName: "Wolves",
  signature: { champion: "Ahri", games: 6 },
} as PlayerCardData;

describe("SeasonEndAwardCard", () => {
  it("restores the tall champion-art archive card for an award winner", () => {
    render(
      <SeasonEndAwardCard
        award={{
          id: "body-count",
          title: "Body Count",
          description: "Most kills",
          group: "Record breakers",
          scope: "player",
          mode: "total",
          unit: "kills",
          status: "ready",
          winners: [{ name: "Alice#NA1", team: "Wolves", value: 60, games: 6 }],
        }}
        season="S5"
        league="premier"
        index={0}
        cards={[card]}
      />,
    );

    expect(screen.getByRole("heading", { name: "Body Count" })).toBeTruthy();
    expect(screen.getByText("Most kills")).toBeTruthy();
    expect(screen.getByText("Record breakers")).toBeTruthy();
    expect(screen.getByText("SEASON ARCHIVE")).toBeTruthy();
    expect(screen.getByTestId("award-card-art").getAttribute("style")).toContain("Ahri_0.jpg");
  });

  it("renders one marked accolade card for each division of a player award", () => {
    render(
      <SeasonEndAwardCard
        award={{
          id: "body-count",
          title: "Body Count",
          description: "Most kills",
          group: "Record breakers",
          scope: "player",
          mode: "total",
          unit: "kills",
          status: "ready",
          divisionStatuses: {
            Solari: { status: "ready" },
            Lunari: { status: "ready" },
          },
          winners: [
            { name: "Alice#NA1", team: "Wolves", value: 60, games: 6, division: "Solari" },
            { name: "Bob#NA1", team: "Bears", value: 55, games: 6, division: "Lunari" },
          ],
        }}
        season="S5"
        league="premier"
        index={0}
        cards={[card]}
      />,
    );

    expect(screen.getAllByRole("heading", { name: "Body Count" })).toHaveLength(2);
    expect(screen.getByLabelText("Solari division").textContent).toContain("☀");
    expect(screen.getByLabelText("Lunari division").textContent).toContain("☾");
  });
});
