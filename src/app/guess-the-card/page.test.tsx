import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import GuessTheCardPage from "./page";
import { GuessTheCardError } from "@/lib/guess-the-card/server";

vi.mock("server-only", () => ({}));

const { getGuessTheCardGame, redirect } = vi.hoisted(() => ({
  getGuessTheCardGame: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/lib/guess-the-card/server", async () => {
  const actual = await vi.importActual<typeof import("@/lib/guess-the-card/server")>("@/lib/guess-the-card/server");
  return { ...actual, getGuessTheCardGame };
});
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/components/guess-the-card/GuessTheCardBoard", () => ({ default: () => <div data-testid="guess-the-card-board" /> }));
vi.mock("@/components/guess-the-card/GuessTheCardUnavailable", () => ({ default: () => <div data-testid="guess-the-card-unavailable" /> }));
vi.mock("@/lib/guess-the-card/actions", () => ({
  resetGuessTheCardPuzzleAction: vi.fn(),
  submitGuessTheCardAction: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("GuessTheCardPage", () => {
  it("tells non-admin callers it is still in testing instead of bouncing them", async () => {
    getGuessTheCardGame.mockRejectedValue(new GuessTheCardError("FORBIDDEN", "Admin testing only."));

    render(await GuessTheCardPage());

    expect(redirect).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("still in testing");
    expect(screen.getByRole("link", { name: /back to premium hq/i }).getAttribute("href")).toBe("/premium");
  });

  it("keeps data warm-up failures inside the game page", async () => {
    getGuessTheCardGame.mockRejectedValue(new GuessTheCardError("NO_CANDIDATES", "No complete games."));

    render(await GuessTheCardPage());

    expect(screen.getByTestId("guess-the-card-unavailable")).toBeTruthy();
  });
});
