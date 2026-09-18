import { fireEvent, render, screen } from "@testing-library/react";
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
  it("renders an ordinary winner as a collectible face", () => {
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
    expect(screen.queryByText("SEASON ARCHIVE")).toBeNull();
    expect(screen.getByTestId("award-card-face").className).toContain("face");
    expect(screen.getByTestId("award-card-art").querySelector("img")?.getAttribute("src")).toContain("/champion/centered/Ahri_0.jpg");
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
            value: 5,
            games: 7,
            division: "Solari",
            champion: "Azir",
            championGames: 7,
            title: "Best of Azir",
            evidence: { bestOf: { wins: 5, losses: 2, winRate: 100 * 5 / 7, meanPerformance: 88.4, seasonGames: 8, championGames: 7 } },
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
    expect(screen.queryByLabelText(/overall/i)).toBeNull();
    expect(screen.getByLabelText("Solari division")).toBeTruthy();
    expect(screen.queryByText("☀")).toBeNull();
    expect(screen.getByText("S5 Premier")).toBeTruthy();
    expect(screen.getByText(/Award record · 5–2 · 71% WR · 7 games/)).toBeTruthy();
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
          note: "No player has at least 5 games.",
          winners: [],
        }}
        season="S5"
        league="premier"
        index={0}
        cards={[]}
      />,
    );

    expect(screen.getByText("Not earned yet")).toBeTruthy();
    expect(screen.getByText("No player has at least 5 games.")).toBeTruthy();
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

  it("keeps extended evidence accessible outside the fixed-ratio face", () => {
    const detail = "This evidence includes the full structured context for a long award result.";
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
          winners: [{ name: "Alice#NA1", team: "Wolves", value: 10, games: 6, detail }],
        }}
        season="S5"
        league="premier"
        index={0}
        cards={[card]}
      />,
    );

    const face = screen.getByTestId("award-card-face");
    expect(screen.getByText("Full evidence")).toBeTruthy();
    expect(screen.getByText(new RegExp(detail))).toBeTruthy();
    expect(face.textContent).not.toContain(detail);
  });

  it("renders Jungle–Mid Connection with two independently labelled panels", () => {
    render(
      <SeasonEndAwardCard
        award={{
          id: "jungle-mid-connection",
          title: "Jungle–Mid Connection",
          description: "Best pair",
          group: "Teamwork",
          scope: "pair",
          partition: "division",
          mode: "rate",
          unit: "%",
          status: "ready",
          winners: [{
            name: "Jungle#NA1 + Mid#NA1",
            team: "Wolves",
            value: 80,
            games: 5,
            evidence: { duo: {
              formulaVersion: "duo-impact-v1",
              weights: { kill_participation_pct: 0.35, kda: 0.25, damage_per_min: 0.2, vision_score_per_min: 0.2 },
              componentScores: { kill_participation_pct: 80, kda: 80, damage_per_min: 80, vision_score_per_min: 80 },
              members: [
                { playerKey: "jungle#na1", name: "Jungle#NA1", role: "JUNGLE", games: 5, wins: 4, losses: 1, winRate: 80, rawAverages: { kill_participation_pct: 60, kda: 3, damage_per_min: 500, vision_score_per_min: 1 }, componentScores: { kill_participation_pct: 80, kda: 80, damage_per_min: 80, vision_score_per_min: 80 }, champion: { championId: "Ahri", champion: "Ahri", games: 3, wins: 2, losses: 1, winRate: 66.67 } },
                { playerKey: "mid#na1", name: "Mid#NA1", role: "MIDDLE", games: 5, wins: 4, losses: 1, winRate: 80, rawAverages: { kill_participation_pct: 60, kda: 3, damage_per_min: 500, vision_score_per_min: 1 }, componentScores: { kill_participation_pct: 80, kda: 80, damage_per_min: 80, vision_score_per_min: 80 }, champion: { championId: "Azir", champion: "Azir", games: 4, wins: 3, losses: 1, winRate: 75 } },
              ],
              games: 5,
              wins: 4,
              losses: 1,
              winRate: 80,
            } },
          }],
        }}
        season="S5"
        league="premier"
        index={0}
        cards={[]}
      />,
    );

    expect(screen.getAllByTestId("award-card-pair-panel")).toHaveLength(2);
    expect(screen.queryByText("Best pair")).toBeNull();
    expect(screen.getByRole("img", { name: /Jungle#NA1, Jungle, Ahri/ })).toBeTruthy();
    expect(screen.getByRole("img", { name: /Mid#NA1, Mid, Azir/ })).toBeTruthy();
    expect(screen.getByText("Jungle#NA1")).toBeTruthy();
    expect(screen.getByText("Mid#NA1")).toBeTruthy();
  });

  it("renders Bot–Support Connection with Duo Impact disclosure and ordered panels", () => {
    render(
      <SeasonEndAwardCard
        award={{
          id: "bot-support-connection",
          title: "Bot–Support Connection",
          description: "Best pair",
          group: "Teamwork",
          scope: "pair",
          partition: "division",
          status: "ready",
          winners: [{
            name: "Bot#NA1 + Support#NA1",
            team: "Wolves",
            value: 81.6,
            games: 6,
            playerKeys: ["bot#na1", "support#na1"],
            evidence: {
              duo: {
                formulaVersion: "duo-impact-v1",
                weights: { kill_participation_pct: .35, kda: .25, damage_per_min: .2, vision_score_per_min: .2 },
                componentScores: { kill_participation_pct: 90, kda: 80, damage_per_min: 75, vision_score_per_min: 70 },
                members: [
                  { playerKey: "bot#na1", name: "Bot#NA1", role: "BOTTOM", games: 6, wins: 4, losses: 2, winRate: 4 / 6 * 100, rawAverages: { kill_participation_pct: 70, kda: 4.2, damage_per_min: 700, vision_score_per_min: 1 }, componentScores: { kill_participation_pct: 90, kda: 80, damage_per_min: 75, vision_score_per_min: 70 }, champion: { championId: "Jinx", champion: "Jinx", games: 6, wins: 4, losses: 2, winRate: 4 / 6 * 100 } },
                  { playerKey: "support#na1", name: "Support#NA1", role: "UTILITY", games: 6, wins: 4, losses: 2, winRate: 4 / 6 * 100, rawAverages: { kill_participation_pct: 75, kda: 3.4, damage_per_min: 250, vision_score_per_min: 2 }, componentScores: { kill_participation_pct: 90, kda: 80, damage_per_min: 75, vision_score_per_min: 70 }, champion: { championId: "Lulu", champion: "Lulu", games: 6, wins: 4, losses: 2, winRate: 4 / 6 * 100 } },
                ],
                games: 6,
                wins: 4,
                losses: 2,
                winRate: 4 / 6 * 100,
              },
            },
          }],
        }}
        season="S5"
        league="premier"
        index={0}
        cards={[]}
      />,
    );

    expect(screen.getByText("82 / 100")).toBeTruthy();
    expect(screen.getByText("· Duo Impact")).toBeTruthy();
    expect(screen.getByText("4–2 together · 6 games")).toBeTruthy();
    expect(screen.getByText("Duo Impact breakdown")).toBeTruthy();
    expect(screen.getAllByTestId("award-card-pair-panel")).toHaveLength(2);
    expect(screen.getByRole("img", { name: /Bot#NA1, Bot, Jinx/ })).toBeTruthy();
    expect(screen.getByRole("img", { name: /Support#NA1, Support, Lulu/ })).toBeTruthy();
    expect(screen.getAllByRole("listitem").some((item) => item.textContent?.includes("Kill participation · 35% · 90 / 100"))).toBe(true);
    expect(screen.getAllByRole("listitem").some((item) => item.textContent?.includes("KP 70% · KDA 4.2"))).toBe(true);
  });

  it("renders Top–Jungle Connection with the same pair-card treatment", () => {
    render(
      <SeasonEndAwardCard
        award={{
          id: "top-jungle-connection",
          title: "Top–Jungle Connection",
          description: "Best pair",
          group: "Teamwork",
          scope: "pair",
          partition: "division",
          status: "ready",
          winners: [{
            name: "Top#NA1 + Jungle#NA1",
            team: "Wolves",
            value: 78,
            games: 5,
            pairMembers: [
              { playerKey: "top#na1", name: "Top#NA1", role: "Top", champion: { id: "Ahri", name: "Ahri", games: 3, wins: 2, winRate: 2 / 3 } },
              { playerKey: "jungle#na1", name: "Jungle#NA1", role: "Jungle", champion: { id: "Azir", name: "Azir", games: 4, wins: 3, winRate: 3 / 4 } },
            ],
          }],
        }}
        season="S5"
        league="premier"
        index={0}
        cards={[]}
      />,
    );

    expect(screen.getAllByTestId("award-card-pair-panel")).toHaveLength(2);
    expect(screen.getByRole("img", { name: /Top#NA1, Top, Ahri/ })).toBeTruthy();
    expect(screen.getByRole("img", { name: /Jungle#NA1, Jungle, Azir/ })).toBeTruthy();
    expect(screen.queryByText("Best pair")).toBeNull();
  });

  it("omits the description from an empty duo card too", () => {
    render(
      <SeasonEndAwardCard
        award={{
          id: "top-jungle-connection",
          title: "Top–Jungle Connection",
          description: "Best pair",
          group: "Teamwork",
          scope: "pair",
          partition: "division",
          status: "unearned",
          winners: [],
        }}
        season="S5"
        league="premier"
        index={0}
        cards={[]}
      />,
    );

    expect(screen.getByText("No qualifying pair yet.")).toBeTruthy();
    expect(screen.queryByText("Best pair")).toBeNull();
  });

  it.each(["fortress", "dragon-hoard", "speedrunners", "marathon-winners", "clean-sweep"] as const)("uses a scoped team logo for %s without requiring a complete roster or champion fallback", (awardId) => {
    render(
      <SeasonEndAwardCard
        award={{
          id: awardId,
          title: awardId,
          description: "Most dragons",
          group: "Teamwork",
          scope: "team",
          partition: "division",
          mode: "perGame",
          unit: "dragons/game",
          status: "ready",
          winners: [{ name: "Wolves", team: "Wolves", value: 3, games: 6 }],
        }}
        season="S5"
        league="premier"
        index={0}
        cards={[]}
        teamIdentities={{
          wolves: { name: "Wolves", abbreviation: "WOL", imageUrl: "https://example.test/wolves.svg", bannerColor: "#123456" },
        }}
      />,
    );

    const art = screen.getByTestId("award-card-art");
    expect(art.querySelector("img")?.getAttribute("src")).toBe("https://example.test/wolves.svg");
    expect(art.textContent).not.toContain("Wolves");
    expect(art.querySelector("img")?.getAttribute("src")).not.toContain("champion");
  });

  it("shows a team monogram when the logo is missing or fails", () => {
    render(
      <SeasonEndAwardCard
        award={{
          id: "fortress",
          title: "Fortress",
          description: "Fewest towers lost",
          group: "Teamwork",
          scope: "team",
          partition: "division",
          status: "ready",
          winners: [{ name: "Wolves", team: "Wolves", value: 1, games: 6 }],
        }}
        season="S5"
        league="premier"
        index={0}
        cards={[]}
        teamIdentities={{
          wolves: { name: "Wolves", abbreviation: "WOL", imageUrl: "https://example.test/missing.svg", bannerColor: null },
        }}
      />,
    );

    const art = screen.getByTestId("award-card-art");
    fireEvent.error(art.querySelector("img")!);
    expect(art.querySelector("img")).toBeNull();
    expect(screen.getByText("WOL")).toBeTruthy();
    expect(art.textContent).not.toContain("Wolves");
  });
});
