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
  it("redirects non-admin callers to Premium HQ", async () => {
    getGuessTheCardGame.mockRejectedValue(new GuessTheCardError("FORBIDDEN", "Admin testing only."));

    await GuessTheCardPage();

    expect(redirect).toHaveBeenCalledWith("/premium");
  });

  it("keeps data warm-up failures inside the game page", async () => {
    getGuessTheCardGame.mockRejectedValue(new GuessTheCardError("NO_CANDIDATES", "No complete games."));

    render(await GuessTheCardPage());

    expect(screen.getByTestId("guess-the-card-unavailable")).toBeTruthy();
  });
});
