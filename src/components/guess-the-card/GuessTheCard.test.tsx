import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import GuessTheCard from "./GuessTheCard";
import type { GuessTheCardReveal } from "@/lib/guess-the-card/reveal";

afterEach(() => cleanup());

const startReveal: GuessTheCardReveal = {
  stage: "role",
  role: "Mid",
  champion: null,
  combat: null,
  damage: null,
  economy: null,
  final: null,
  cardBack: null,
  canFlip: false,
};

const completedReveal: GuessTheCardReveal = {
  stage: "final",
  role: "Mid",
  champion: { name: "Ahri", artUrl: "https://cdn.example/ahri.jpg" },
  combat: { kills: 8, deaths: 2, assists: 11, kda: 9.5, killParticipationPct: 72 },
  damage: { total: 24000, perMin: 600, sharePct: 28 },
  economy: { cs: 280, csPerMin: 7, gold: 14000, goldPerMin: 350, csAt10: 82, goldAt10: 3200 },
  final: {
    slug: "target-na1",
    name: "Target Player",
    tag: "NA1",
    team: "New Origins",
    date: "2030-01-01",
    result: "win",
    side: "Blue",
    durationMin: 40,
  },
  cardBack: {
    visionScore: 31,
    objectives: 3,
    damageTaken: 12000,
    damageMitigated: 6000,
    healing: 900,
    multikills: { doubles: 2, triples: 1, quadras: 0, pentas: 0 },
    soloKills: 2,
    turretDamage: 1800,
    objectiveDamage: 2400,
  },
  canFlip: true,
};

describe("GuessTheCard", () => {
  it("keeps the player anonymous and champion art hidden at the start", () => {
    render(<GuessTheCard reveal={startReveal} />);

    expect(screen.getByTestId("guess-the-card-card")).toBeTruthy();
    expect(screen.getByText("?????#????")).toBeTruthy();
    expect(screen.getByText("Mid")).toBeTruthy();
    expect(screen.getByText("🔒 Combat")).toBeTruthy();
    expect(screen.queryByAltText("Ahri splash art")).toBeNull();
    expect(screen.queryByRole("link", { name: /view player card/i })).toBeNull();
  });

  it("shows the final identity, player-card link, and completed back", () => {
    render(<GuessTheCard reveal={completedReveal} />);

    expect(screen.getByText("Target Player#NA1")).toBeTruthy();
    expect(screen.getByAltText("Ahri splash art")).toBeTruthy();
    expect(screen.getByRole("link", { name: /view player card/i }).getAttribute("href")).toBe("/card/target-na1");

    fireEvent.click(screen.getByRole("button", { name: /show Guess the Card back/i }));
    expect(screen.getByText("Completed game stats")).toBeTruthy();
    expect(screen.getByText("Vision score")).toBeTruthy();
    expect(screen.getByText("31.0")).toBeTruthy();
  });
});
