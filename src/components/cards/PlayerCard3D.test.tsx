import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { PlayerCardData } from "@/lib/cards/build";
import PlayerCard3D from "./PlayerCard3D";

afterEach(cleanup);

const card: PlayerCardData = {
  slug: "7gen-na1",
  name: "7gen",
  tag: "NA1",
  teamName: "Gamblers",
  role: "Bot",
  overall: 74,
  tier: { key: "platinum", label: "Platinum" },
  archetype: "Glass Cannon",
  signature: { champion: "Jhin", games: 4 },
  topChampions: [
    { champion: "Jhin", games: 4, wins: 3 },
    { champion: "Jinx", games: 2, wins: 1 },
  ],
  form: [false, true, true, true, true],
  subStats: [
    { key: "combat", label: "Combat", value: 82 },
    { key: "economy", label: "Economy", value: 61 },
    { key: "vision", label: "Vision", value: 43 },
    { key: "form", label: "Form", value: 88 },
    { key: "clutch", label: "Clutch", value: 68 },
  ],
  wins: 7,
  losses: 9,
  winratePct: 43.8,
  level: 16,
  pentas: 1,
  season: "S5",
};

describe("PlayerCard3D", () => {
  it("renders identity, tier, rating, archetype, signature, and stat bars", () => {
    render(<PlayerCard3D card={card} />);

    expect(screen.getAllByText("7gen").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Platinum").length).toBeGreaterThan(0);
    expect(screen.getByText("74")).toBeTruthy();
    expect(screen.getByText("Glass Cannon")).toBeTruthy();
    // Signature on the front, champion pool entry on the back.
    expect(screen.getAllByText("Jhin")).toHaveLength(2);
    expect(screen.getByText("Combat")).toBeTruthy();
    expect(screen.getByText("82")).toBeTruthy();
    expect(screen.getByText("PENTA ×1")).toBeTruthy();
    expect(screen.getAllByText(/7–9 · 44% WR/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("LVL 16").length).toBeGreaterThan(0);
  });

  it("shows the champion pool and form on the back", () => {
    render(<PlayerCard3D card={card} />);

    // Back face content is in the DOM (flip is pure CSS rotation).
    expect(screen.getByText("Champion pool")).toBeTruthy();
    expect(screen.getByText("Jinx")).toBeTruthy();
    expect(screen.getAllByText("W")).toHaveLength(4);
    expect(screen.getAllByText("L")).toHaveLength(1);
  });

  it("flips on click when interactive", () => {
    const { container } = render(<PlayerCard3D card={card} />);
    const button = screen.getByRole("button");
    const flipLayer = container.querySelector('[style*="450ms"]') as HTMLElement;

    expect(flipLayer.style.transform).toContain("rotateY(0deg)");
    fireEvent.click(button);
    expect(flipLayer.style.transform).toContain("rotateY(180deg)");
  });

  it("adds the holographic foil only for Emerald tier and above", () => {
    const { container, rerender } = render(<PlayerCard3D card={card} />);
    // Platinum: no foil.
    expect(container.querySelector('[data-testid="foil"]')).toBeNull();

    rerender(<PlayerCard3D card={{ ...card, overall: 90, tier: { key: "master", label: "Master" } }} />);
    expect(container.querySelector('[data-testid="foil"]')).toBeTruthy();
  });

  it("renders statically without a button when not interactive", () => {
    render(<PlayerCard3D card={card} interactive={false} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
