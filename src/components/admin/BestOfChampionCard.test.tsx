import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PlayerCardData } from "@/lib/cards/build";
import type { SeasonAward } from "@/lib/season-end/derive";
import BestOfChampionCard from "./BestOfChampionCard";

const card = {
  name: "Alice",
  tag: "NA1",
  teamName: "Wolves",
  role: "Mid",
  overall: 91,
  signature: { champion: "Ahri", games: 6 },
  autograph: "data:image/png;base64,live-ink",
} as PlayerCardData;

const award = (overrides: Partial<SeasonAward> = {}): SeasonAward => ({
  id: "best-of-champion",
  title: "Best of Champion",
  description: "One unique played champion per player.",
  group: "Best of Champions",
  scope: "player",
  partition: "league",
  status: "ready",
  winners: [],
  ...overrides,
});

const winner = (overrides: Partial<SeasonAward["winners"][number]> = {}) => ({
  name: "Alice#NA1",
  team: "Wolves",
  value: 88,
  games: 6,
  champion: "Azir",
  championGames: 2,
  title: "Best of Azir",
  evidence: { record: "2–0", kda: 8 },
  ...overrides,
});

describe("BestOfChampionCard", () => {
  it("uses assigned champion art, identity, and selected metadata without OVR", () => {
    render(
      <BestOfChampionCard
        award={award({ winners: [winner()] })}
        winner={winner()}
        playerCard={card}
        season="S5"
        league="premier"
        headingId="best-of-azir"
      />,
    );

    expect(screen.getByRole("heading", { name: "Best of Azir" })).toBeTruthy();
    expect(screen.getByTestId("best-of-card-art").getAttribute("style")).toContain("Azir_0.jpg");
    expect(screen.getByTestId("best-of-card-art").getAttribute("style")).toContain("/champion/centered/Azir_0.jpg");
    expect(screen.getByTestId("best-of-card-art").getAttribute("style")).toContain("background-size: cover");
    expect(screen.getByTestId("best-of-card-foil")).toBeTruthy();
    expect(screen.getByTestId("best-of-card-ornament").getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByText("Alice")).toBeTruthy();
    expect(screen.queryByText("OVR")).toBeNull();
    expect(screen.queryByLabelText(/overall/i)).toBeNull();
    expect(screen.getByRole("article").getAttribute("aria-label")).toBe("Best of Azir — Alice#NA1");
    expect(screen.getByText("S5 Premier")).toBeTruthy();
    expect(screen.getByText(/2–0 · 8 KDA · 88\/100 score · Wolves · 6 games/)).toBeTruthy();
    expect(screen.getByText("One unique played champion per player.")).toBeTruthy();
    expect(screen.queryByText("Season stories")).toBeNull();
  });

  it("keeps the assigned art and identity when the player card is missing", () => {
    render(
      <BestOfChampionCard
        award={award({ winners: [winner()] })}
        winner={winner()}
        season="A1"
        league="academy"
        headingId="best-of-azir-missing-player"
      />,
    );

    expect(screen.getByTestId("best-of-card-art").getAttribute("style")).toContain("Azir_0.jpg");
    expect(screen.getByText("Alice")).toBeTruthy();
    expect(screen.queryByLabelText(/overall/i)).toBeNull();
    expect(screen.getByText("A1 Academy")).toBeTruthy();
  });

  it("uses a neutral face when the winner has no champion", () => {
    render(
      <BestOfChampionCard
        award={award({ winners: [winner({ name: "Bob#NA1", champion: undefined, title: undefined })] })}
        winner={winner({ name: "Bob#NA1", champion: undefined, title: undefined })}
        headingId="best-of-champion-missing-art"
        season="S5"
        league="premier"
      />,
    );

    expect(screen.getByRole("heading", { name: "Best of Champion" })).toBeTruthy();
    expect(screen.getByTestId("best-of-card-art").getAttribute("style")).toBeNull();
    expect(screen.getByText("Bob")).toBeTruthy();
    expect(screen.queryByLabelText(/overall/i)).toBeNull();
  });

  it("keeps long player names in the identity region and the full account identity accessible", () => {
    const longWinner = winner({ name: "A player name that needs two lines#NA1" });
    render(
      <BestOfChampionCard
        award={award({ winners: [longWinner] })}
        winner={longWinner}
        season="S5"
        league="premier"
        headingId="best-of-long-name"
      />,
    );

    expect(screen.getByText("A player name that needs two lines")).toBeTruthy();
    expect(screen.getByText("Full player identity: A player name that needs two lines#NA1")).toBeTruthy();
  });

  it("keeps empty states neutral and omits a fake player, rating, signature, and collection label", () => {
    render(
      <BestOfChampionCard
        award={award({ status: "unearned", note: "No player has at least 5 games." })}
        season="S5"
        league="premier"
        headingId="best-of-empty"
      />,
    );

    expect(screen.getByRole("heading", { name: "Best of Champion" })).toBeTruthy();
    expect(screen.getByText("Not earned yet")).toBeTruthy();
    expect(screen.getByText("No player has at least 5 games.")).toBeTruthy();
    expect(screen.queryByText("Best of Champions")).toBeNull();
    expect(screen.queryByLabelText(/overall/i)).toBeNull();
    expect(screen.queryByTestId("best-of-autograph")).toBeNull();
  });

  it("renders optional ink only when the frozen signed copy supplies it", () => {
    const props = {
      award: award({ winners: [winner()] }),
      winner: winner(),
      playerCard: card,
      season: "S5" as const,
      league: "premier" as const,
      headingId: "best-of-signed",
    };

    const { rerender } = render(<BestOfChampionCard {...props} />);
    expect(screen.queryByTestId("best-of-autograph")).toBeNull();

    rerender(<BestOfChampionCard {...props} autograph="data:image/png;base64,frozen-ink" />);
    expect(screen.getByAltText("Alice#NA1's autograph")).toBeTruthy();
  });

  it("renders small division emblems and keeps heading IDs distinct for multiple winners", () => {
    render(
      <div>
        <BestOfChampionCard award={award({ winners: [winner()] })} winner={winner()} season="S5" league="premier" headingId="best-of-solari" division="Solari" />
        <BestOfChampionCard award={award({ winners: [winner({ name: "Bob#NA1", champion: "Ahri", title: "Best of Ahri" })] })} winner={winner({ name: "Bob#NA1", champion: "Ahri", title: "Best of Ahri" })} season="S5" league="premier" headingId="best-of-lunari" division="Lunari" />
      </div>,
    );

    expect(screen.getAllByRole("heading", { name: /Best of/ })).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "Best of Azir" }).id).toBe("best-of-solari");
    expect(screen.getByRole("heading", { name: "Best of Ahri" }).id).toBe("best-of-lunari");
    expect(screen.getByLabelText("Solari division")).toBeTruthy();
    expect(screen.getByLabelText("Lunari division")).toBeTruthy();
    expect(screen.getByText("SOLARI")).toBeTruthy();
    expect(screen.getByText("LUNARI")).toBeTruthy();
    expect(screen.queryByText("☀")).toBeNull();
    expect(screen.queryByText("☾")).toBeNull();
  });

  it("keeps a crop override local to the rendered card", () => {
    render(
      <BestOfChampionCard
        award={award({ winners: [winner()] })}
        winner={winner()}
        season="S5"
        league="premier"
        headingId="best-of-crop-override"
        crop={{ cropPositionX: 80, cropPositionY: 42, zoom: 1.1 }}
      />,
    );

    const art = screen.getByTestId("best-of-card-art");
    expect(art.getAttribute("style")).toContain("background-position: 80% 42%");
    expect(art.getAttribute("style")).toContain("--art-zoom: 1.1");
  });
});
