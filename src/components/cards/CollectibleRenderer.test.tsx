import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AccoladeCollectible, BestOfCollectible } from "@/lib/season-end/collectibles";
import CollectibleRenderer from "./CollectibleRenderer";

const bestOf: BestOfCollectible = {
  designId: "se-release-premier-s5-best-of-champion-alice-azir-solari",
  releaseId: "release",
  league: "premier",
  season: "S5",
  division: "Solari",
  schemaVersion: 1,
  artwork: {
    kind: "single",
    primaryUrl: "https://example.test/Azir_0.jpg",
    fallbackUrl: "https://example.test/Azir_splash.jpg",
    cropPositionX: 50,
    cropPositionY: 50,
    zoom: 1,
  },
  display: {
    title: "Best of Azir",
    subtitle: "Best of Champions",
    description: "Champion wins first.",
    headline: "5",
    evidence: "5–2 · 71% WR · 7 games",
    unit: "wins",
  },
  evidence: { awardId: "best-of-champion", winnerValue: 5, games: 7, source: "best-of" },
  baseSalvage: 30,
  kind: "best_of",
  player: { key: "alice#na1", name: "Alice", tag: "NA1", slug: "alice-na1" },
  champion: { id: "Azir", name: "Azir", games: 7, wins: 5, winRate: 71.4 },
  signatureEligible: true,
  source: { kind: "best-of-champion", awardId: "best-of-champion" },
};

const accolade: AccoladeCollectible = {
  designId: "se-release-premier-s5-accolade-body-count-alice-solari",
  releaseId: "release",
  league: "premier",
  season: "S5",
  division: "Solari",
  schemaVersion: 1,
  artwork: {
    kind: "single",
    primaryUrl: "https://example.test/Ahri_0.jpg",
    fallbackUrl: "https://example.test/Ahri_splash.jpg",
    cropPositionX: 50,
    cropPositionY: 50,
    zoom: 1,
  },
  display: {
    title: "Body Count",
    subtitle: "Record breakers",
    description: "Most kills per game.",
    headline: "10",
    evidence: "60 total · Wolves · 6 games",
    unit: "kills/game",
  },
  evidence: { awardId: "body-count", winnerValue: 10, games: 6, total: 60, source: "accolade" },
  baseSalvage: 30,
  kind: "accolade",
  subject: { kind: "player", player: { key: "alice#na1", name: "Alice", tag: "NA1", slug: "alice-na1" } },
  signatureEligible: false,
  source: { kind: "season-accolade", awardId: "body-count", scope: "player" },
};

describe("CollectibleRenderer", () => {
  it("uses the preview Best Of face for a frozen pack pull", () => {
    render(<CollectibleRenderer pull={{ design: bestOf, foil: true, foilType: "prisma", signed: false, autograph: null, guaranteedFoil: true, inventoryId: 1 }} />);

    expect(screen.getByTestId("best-of-card-ornament")).toBeTruthy();
    expect(screen.getByTestId("best-of-card-art").getAttribute("style")).toContain("Azir_0.jpg");
    expect(screen.getByText("Alice")).toBeTruthy();
    expect(screen.getByText("S5 Premier")).toBeTruthy();
    expect(screen.getByTestId("season-end-best_of-renderer").getAttribute("data-card-format")).toBe("standard");
  });

  it("uses the preview accolade face and frozen display values", () => {
    render(<CollectibleRenderer pull={{ design: accolade, foil: false, foilType: null, signed: false, autograph: null, guaranteedFoil: false, inventoryId: 2 }} />);

    expect(screen.getByTestId("award-card-face")).toBeTruthy();
    expect(screen.getByTestId("season-end-accolade-renderer").getAttribute("data-card-format")).toBe("standard");
    expect(screen.getByTestId("award-card-art").querySelector("img")?.getAttribute("src")).toContain("Ahri_0.jpg");
    expect(screen.getByText("Record breakers")).toBeTruthy();
    expect(screen.getByText("kills/game")).toBeTruthy();
    expect(screen.getByLabelText("Solari division")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Body Count" })).toBeTruthy();
  });

  it.each([
    ["Best Of", bestOf],
    ["Accolade", accolade],
  ] as const)("applies the shared compact storage treatment to %s cards", (_label, design) => {
    render(<CollectibleRenderer compact pull={{ design, foil: false, foilType: null, signed: false, autograph: null, guaranteedFoil: false, inventoryId: 3 }} />);

    const renderer = screen.getByTestId(`season-end-${design.kind}-renderer`);
    expect(renderer.getAttribute("data-card-format")).toBe("standard");
    expect(renderer.getAttribute("data-compact")).toBe("true");
  });
});
