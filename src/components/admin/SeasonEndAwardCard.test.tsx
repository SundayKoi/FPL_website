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
          description: "Most kills per game",
          group: "Record breakers",
          scope: "player",
          partition: "division",
          mode: "perGame",
          unit: "kills/game",
          status: "ready",
          winners: [{ name: "Alice#NA1", team: "Wolves", value: 10, games: 6, total: 60, perGame: 10 }],
        }}
        season="S5"
        league="premier"
        index={0}
        cards={[card]}
      />,
    );

    expect(screen.getByRole("heading", { name: "Body Count" })).toBeTruthy();
    expect(screen.getByText("Most kills per game")).toBeTruthy();
    expect(screen.getByText("Record breakers")).toBeTruthy();
    expect(screen.getByText("kills/game")).toBeTruthy();
    expect(screen.getByText("60 total · Wolves · 6 games")).toBeTruthy();
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
          partition: "division",
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

  it.each(["pair", "team"] as const)("uses the same division treatment for %s awards", (scope) => {
    render(
      <SeasonEndAwardCard
        award={{
          id: scope === "pair" ? "jungle-mid-connection" : "dragon-hoard",
          title: scope === "pair" ? "Jungle–Mid Connection" : "Dragon Hoard",
          description: "A Teamwork award",
          group: "Teamwork",
          scope,
          partition: "division",
          mode: "perGame",
          unit: "dragons/game",
          status: "ready",
          divisionStatuses: {
            Solari: { status: "ready" },
            Lunari: { status: "unavailable", note: "Lunari fixtures are incomplete." },
          },
          winners: [{ name: "Alice#NA1", team: "Wolves", value: 2, games: 6, division: "Solari" }],
        }}
        season="S5"
        league="premier"
        index={0}
        cards={[card]}
      />,
    );

    expect(screen.getByLabelText("Solari division")).toBeTruthy();
    expect(screen.getByLabelText("Lunari division")).toBeTruthy();
    expect(screen.getByText("Lunari fixtures are incomplete.")).toBeTruthy();
  });

  it("routes Best of through the full-art renderer without inheriting live autograph ink", () => {
    render(
      <SeasonEndAwardCard
        award={{
          id: "best-of-champion",
          title: "Best of Champion",
          description: "One unique played champion per player.",
          group: "Best of Champions",
          scope: "player",
          partition: "league",
          status: "ready",
          winners: [{
            name: "Alice#NA1",
            team: "Wolves",
            value: 88,
            games: 6,
            champion: "Azir",
            championGames: 2,
            title: "Best of Azir",
            evidence: { record: "2–0", kda: 8 },
          }],
        }}
        season="S5"
        league="premier"
        index={0}
        cards={[card]}
      />,
    );

    expect(screen.getByRole("heading", { name: "Best of Azir" })).toBeTruthy();
    expect(screen.getByTestId("best-of-card-art").getAttribute("style")).toContain("Azir_0.jpg");
    expect(screen.getByLabelText("Overall unavailable")).toBeTruthy();
    expect(screen.getByText("S5 Premier")).toBeTruthy();
    expect(screen.getByText(/2–0 · 8 KDA · 88\/100 score · Wolves · 6 games/)).toBeTruthy();
    expect(screen.getByText("One unique played champion per player.")).toBeTruthy();
    expect(screen.queryByTestId("best-of-autograph")).toBeNull();
    expect(screen.queryByText("Season stories")).toBeNull();
  });

  it("keeps Best of empty states actionable without repeating the assignment description", () => {
    render(
      <SeasonEndAwardCard
        award={{
          id: "best-of-champion",
          title: "Best of Champion",
          description: "This explanation should not be rendered on the card.",
          group: "Best of Champions",
          scope: "player",
          partition: "league",
          status: "unearned",
          note: "No champion performances reached 70/100.",
          winners: [],
        }}
        season="S5"
        league="premier"
        index={0}
        cards={[]}
      />,
    );

    expect(screen.getByText("Not earned yet")).toBeTruthy();
    expect(screen.getByText("No champion performances reached 70/100.")).toBeTruthy();
    expect(screen.getByText("This explanation should not be rendered on the card.")).toBeTruthy();
    expect(screen.queryByLabelText(/division$/)).toBeNull();
    expect(screen.queryByText("Season stories")).toBeNull();
  });

  it("keeps the generic Season stories face treatment for non-best-of awards", () => {
    render(
      <SeasonEndAwardCard
        award={{
          id: "late-bloomer",
          title: "Late Bloomer",
          description: "Highest performance in the final third.",
          group: "Season stories",
          scope: "player",
          partition: "division",
          status: "ready",
          winners: [{ name: "Alice#NA1", team: "Wolves", value: 84, games: 6, division: "Solari" }],
        }}
        season="S5"
        league="premier"
        index={0}
        cards={[card]}
      />,
    );

    expect(screen.getByText("Season stories")).toBeTruthy();
    expect(screen.getByText("Highest performance in the final third.")).toBeTruthy();
  });
});
