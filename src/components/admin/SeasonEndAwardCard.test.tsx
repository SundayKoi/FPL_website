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
    expect(screen.getByText("Record breakers")).toBeTruthy();
    expect(screen.getByText("SEASON ARCHIVE")).toBeTruthy();
    expect(screen.getByTestId("award-card-art").getAttribute("style")).toContain("Ahri_0.jpg");
  });
});
