import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import GuessTheCardBoard from "./GuessTheCardBoard";
import type { GuessTheCardGame, GuessTheCardReveal, GuessTheCardSubmission } from "@/lib/guess-the-card/server";

afterEach(() => cleanup());

const reveal: GuessTheCardReveal = {
  stage: "champion",
  role: "Mid",
  champion: { name: "Ahri", artUrl: null },
  combat: null,
  damage: null,
  economy: null,
  final: null,
  cardBack: null,
  canFlip: false,
};

const game: GuessTheCardGame = {
  date: "2099-02-08",
  expiresAt: "2099-02-09T00:00:00.000Z",
  league: "premier",
  canReset: true,
  adminTesting: true,
  candidates: [
    { slug: "wrong-player-na1", name: "Wrong Player", tag: "NA1", role: "Mid" },
    { slug: "right-player-na1", name: "Right Player", tag: "NA1", role: "Mid" },
  ],
  guesses: [{ slug: "wrong-player-na1", name: "Wrong Player", tag: "NA1", role: "Mid", correct: false }],
  status: "playing",
  reveal,
  reward: null,
};

describe("GuessTheCardBoard", () => {
  it("restores guesses, submits only a player reference, and replaces the game state", async () => {
    const completed = {
      ...game,
      guesses: [...game.guesses, { ...game.candidates[1], correct: true }],
      status: "won" as const,
      reveal: { ...reveal, stage: "final" as const, final: { slug: "right-player-na1", name: "Right Player", tag: "NA1", team: "FPL", date: "2099-02-08", result: "win" as const, side: "Blue", durationMin: 35 }, canFlip: false },
    };
    const submitGuess = vi.fn<(input: unknown) => Promise<GuessTheCardSubmission>>().mockResolvedValue({ ok: true, correct: true, game: completed });
    const resetPuzzle = vi.fn().mockResolvedValue({ date: game.date, league: game.league });

    render(<GuessTheCardBoard initialGame={game} submitGuess={submitGuess} resetPuzzle={resetPuzzle} />);

    expect(screen.getByText("Wrong Player#NA1")).toBeTruthy();
    expect(screen.getByRole("option", { name: /wrong player/i })).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByLabelText("Guess a player"), { target: { value: "right-player-na1" } });
    fireEvent.click(screen.getByRole("button", { name: /lock guess/i }));

    await waitFor(() => expect(submitGuess).toHaveBeenCalledWith({ league: "premier", puzzleDate: "2099-02-08", playerSlug: "right-player-na1" }));
    expect(await screen.findByText("Solved")).toBeTruthy();
    expect(screen.getAllByText("Right Player#NA1")).toHaveLength(2);
  });

  it("copies a spoiler-free result after game over", async () => {
    const lostGame: GuessTheCardGame = { ...game, guesses: game.candidates.map((candidate, index) => ({ ...candidate, correct: index === 1 })), status: "lost", reveal: { ...reveal, stage: "final", final: { slug: "right-player-na1", name: "Right Player", tag: "NA1", team: "FPL", date: "2099-02-08", result: "win", side: "Blue", durationMin: 35 } } };
    const clipboard = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: clipboard } });
    const resetPuzzle = vi.fn().mockResolvedValue({ date: game.date, league: game.league });

    render(<GuessTheCardBoard initialGame={lostGame} submitGuess={vi.fn()} resetPuzzle={resetPuzzle} />);
    fireEvent.click(screen.getByRole("button", { name: /copy result/i }));

    await waitFor(() => expect(clipboard).toHaveBeenCalledWith("Guess the Card 2/5 ⬜🟩"));
    expect(screen.getByText("Guess the Card 2/5 ⬜🟩")).toBeTruthy();
  });
});
