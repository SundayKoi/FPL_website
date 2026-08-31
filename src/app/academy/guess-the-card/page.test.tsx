import { cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AcademyGuessTheCardPage from "./page";
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

describe("AcademyGuessTheCardPage", () => {
  it("keeps the Academy route behind the admin test gate", async () => {
    getGuessTheCardGame.mockRejectedValue(new GuessTheCardError("FORBIDDEN", "Admin testing only."));

    await AcademyGuessTheCardPage();

    expect(redirect).toHaveBeenCalledWith("/premium?league=academy");
  });
});
