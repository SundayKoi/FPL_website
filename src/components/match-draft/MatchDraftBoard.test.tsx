import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import MatchDraftBoard from "./MatchDraftBoard";
import type { MatchDraftState } from "@/lib/match-draft/types";

afterEach(cleanup);

const state: MatchDraftState = {
  fixtureId: "fixture-1",
  gameNumber: 1,
  status: "drafting",
  layout: "stage",
  currentStepIndex: 6,
  turnStartedAt: "2026-08-19T15:00:00Z",
  blueTeam: { name: "Blue Team", abbreviation: "BLU", imageUrl: null },
  redTeam: { name: "Red Team", abbreviation: "RED", imageUrl: null },
  scheduledTeams: [
    { name: "Blue Team", abbreviation: "BLU", imageUrl: null },
    { name: "Red Team", abbreviation: "RED", imageUrl: null },
  ],
  canChooseSides: false,
  sideChoiceRequired: false,
  actions: [
    { stepIndex: 0, side: "blue", kind: "ban", slot: 1, champion: "Aatrox", playerName: null },
    { stepIndex: 6, side: "blue", kind: "pick", slot: 1, champion: "Ahri", playerName: "Blue Mid" },
  ],
  blockedChampions: ["Zeri"],
};

describe("MatchDraftBoard", () => {
  it("renders the stage layout with team abbreviations, champion names, player names, and timer", () => {
    const { container } = render(<MatchDraftBoard initialState={state} onSave={vi.fn()} />);

    expect(screen.getAllByText("BLU").length).toBeGreaterThan(0);
    expect(screen.getAllByText("RED").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Ahri").length).toBeGreaterThan(0);
    expect(container.querySelector('img[src="https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Ahri_0.jpg"]')).toBeTruthy();
    expect(container.querySelector('img[src="https://ddragon.leagueoflegends.com/cdn/16.16.1/img/champion/Ahri.png"]')).toBeTruthy();
    expect(screen.getByText("Blue Mid")).toBeTruthy();
    expect(screen.getByText("30s")).toBeTruthy();
    expect(screen.getByRole("button", { name: /stage layout/i }).getAttribute("aria-pressed")).toBe("true");
  });

  it("uses compact champion images by default and offers multiple size levels", () => {
    render(<MatchDraftBoard initialState={state} onSave={vi.fn()} />);

    expect(screen.getByRole("button", { name: /compact images/i }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("champion-pool-grid").getAttribute("data-size")).toBe("compact");

    fireEvent.click(screen.getByRole("button", { name: /large images/i }));

    expect(screen.getByRole("button", { name: /large images/i }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("champion-pool-grid").getAttribute("data-size")).toBe("large");
  });

  it("auto-fills a pick with that side's team abbreviation", () => {
    const onSave = vi.fn();
    render(<MatchDraftBoard initialState={{ ...state, actions: [] }} onSave={onSave} />);

    fireEvent.click(screen.getByRole("button", { name: "Amumu" }));

    const saved = onSave.mock.calls.at(-1)?.[0] as MatchDraftState;
    expect(saved.actions.find((action) => action.stepIndex === 6)?.playerName).toBe("BLU");
  });

  it("lets game two choose sides before the draft is locked", () => {
    const onSave = vi.fn();
    render(<MatchDraftBoard initialState={{ ...state, gameNumber: 2, canChooseSides: true, sideChoiceRequired: true, actions: [] }} onSave={onSave} />);

    expect(screen.getByRole("button", { name: "Aatrox" }).hasAttribute("disabled")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /red team blue side/i }));

    const saved = onSave.mock.calls[0][0] as MatchDraftState;
    expect(saved.blueTeam.abbreviation).toBe("RED");
    expect(saved.redTeam.abbreviation).toBe("BLU");
    expect(saved.sideChoiceRequired).toBe(false);
  });

  it("switches to the board layout", () => {
    render(<MatchDraftBoard initialState={state} onSave={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /board layout/i }));

    expect(screen.getByRole("button", { name: /board layout/i }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("region", { name: "Champion pool" })).toBeTruthy();
  });

  it("does not allow fearless-blocked champions to be selected", () => {
    render(<MatchDraftBoard initialState={{ ...state, actions: [] }} onSave={vi.fn()} />);

    const zeri = screen.getByRole("button", { name: /Zeri unavailable/i });
    expect(zeri.hasAttribute("disabled")).toBe(true);
  });
});
