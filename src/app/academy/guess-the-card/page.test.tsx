import { cleanup, render, screen } from "@testing-library/react";
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
  it("keeps the Academy route behind the admin test gate, and says so instead of bouncing", async () => {
    getGuessTheCardGame.mockRejectedValue(new GuessTheCardError("FORBIDDEN", "Admin testing only."));

    render(await AcademyGuessTheCardPage());

    expect(redirect).not.toHaveBeenCalled();
    expect(screen.getByTestId("access-wall")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("still in testing");
  });

  it("asks a signed-out visitor to sign in", async () => {
    getGuessTheCardGame.mockRejectedValue(new GuessTheCardError("FORBIDDEN", "Sign in with Discord to test Guess the Card."));

    render(await AcademyGuessTheCardPage());

    expect(screen.getByTestId("access-wall").getAttribute("data-reason")).toBe("signed-out");
    expect(screen.getByRole("link", { name: /sign in with discord/i }).getAttribute("href")).toBe("/login?redirect=/academy/guess-the-card");
  });
});
