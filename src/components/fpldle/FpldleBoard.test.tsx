import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FpldleCandidate, FpldleFeedback, FpldleGame, FpldleSubmission } from "@/lib/fpldle/server";
import FpldleBoard from "./FpldleBoard";

const date = "2026-08-28";

function candidate(index: number): FpldleCandidate {
  return {
    slug: `player-${index}`,
    name: `Player ${index}`,
    tag: "NA1",
    team: `Team ${index}`,
    teamLogoUrl: `https://example.com/team-${index}.png`,
    position: "Mid",
    champion: "Ahri",
    overall: 80 + index,
    division: index % 2 === 0 ? "Lunari" : "Solari",
  };
}

function feedback(player: FpldleCandidate, isCorrect = false): FpldleFeedback {
  return {
    player: { slug: player.slug, name: player.name, tag: player.tag },
    team: isCorrect ? "match" : "miss",
    teamName: player.team,
    teamLogoUrl: player.teamLogoUrl,
    position: isCorrect ? "match" : "miss",
    positionName: player.position,
    champion: isCorrect ? "match" : "miss",
    championName: player.champion,
    overall: isCorrect ? "equal" : "higher",
    overallValue: player.overall,
    division: isCorrect ? "match" : "miss",
    divisionName: player.division,
    isCorrect,
  };
}

function game(candidates: FpldleCandidate[] = [candidate(1), candidate(2), candidate(3)]): FpldleGame {
  return {
    date,
    expiresAt: "2026-08-29T00:00:00.000Z",
    previousGuesses: [],
    candidates,
  };
}

function inputValue(input: unknown): string {
  return (input as { playerSlug: string }).playerSlug;
}

function resetPuzzle() {
  return vi.fn(async () => ({ date, league: "premier" as const }));
}

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("FpldleBoard", () => {
  it("places the player chooser above guess history", () => {
    render(<FpldleBoard game={game()} league="premier" submitGuess={vi.fn()} revealAnswer={vi.fn()} resetPuzzle={resetPuzzle()} />);

    const sections = Array.from(screen.getByRole("main").querySelectorAll("section"));
    expect(sections[0]?.querySelector('[role="combobox"]')).toBeTruthy();
    expect(sections[1]?.querySelector('[aria-label="FPL\'dle guesses"]')).toBeTruthy();
  });

  it("uses a wide aligned board without horizontal overflow", () => {
    render(<FpldleBoard game={game()} league="premier" submitGuess={vi.fn()} revealAnswer={vi.fn()} resetPuzzle={resetPuzzle()} />);

    const main = screen.getByRole("main");
    const header = screen.getByText("Team").parentElement;
    const firstRow = screen.getByLabelText("FPL'dle guesses").firstElementChild;
    expect(main.className).toContain("max-w-[1800px]");
    expect(main.querySelector(".overflow-x-auto")).toBeNull();
    expect(header?.className).toContain("grid-cols-[minmax(0,1.4fr)_repeat(5,minmax(0,1fr))]");
    expect(firstRow?.className).toContain("grid-cols-[minmax(0,1.4fr)_repeat(5,minmax(0,1fr))]");
  });

  it("groups player previews by role", () => {
    const candidates = [
      { ...candidate(1), position: "Top" },
      { ...candidate(2), position: "Jungle" },
      { ...candidate(3), position: "Mid" },
      { ...candidate(4), position: "ADC" },
      { ...candidate(5), position: "Support" },
    ];
    render(<FpldleBoard game={game(candidates)} league="premier" submitGuess={vi.fn()} revealAnswer={vi.fn()} resetPuzzle={resetPuzzle()} />);

    fireEvent.focus(screen.getByRole("combobox", { name: "Search players" }));

    expect(screen.getByRole("group", { name: "TOP" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "JG" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "MID" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "ADC" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "SUP" })).toBeTruthy();
  });

  it("searches, submits, and exposes text plus accessible clue labels", async () => {
    const candidates = [candidate(1), candidate(2)];
    const submitGuess = vi.fn<(input: unknown) => Promise<FpldleSubmission>>(async (input) => ({
      feedback: feedback(candidates.find((item) => item.slug === inputValue(input)) ?? candidates[0], true),
    }));
    const revealAnswer = vi.fn(async () => ({ name: "Answer", tag: "NA1" }));
    render(<FpldleBoard game={game(candidates)} league="premier" submitGuess={submitGuess} revealAnswer={revealAnswer} resetPuzzle={resetPuzzle()} />);

    const input = screen.getByRole("combobox", { name: "Search players" });
    const submit = screen.getByRole("button", { name: "Submit guess" });
    fireEvent.change(input, { target: { value: "Player 2" } });
    fireEvent.click(screen.getByRole("option", { name: /Player 2#NA1/ }));
    await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(submit);

    await waitFor(() => expect(submitGuess).toHaveBeenCalledWith({
      league: "premier",
      puzzleDate: date,
      playerSlug: "player-2",
    }));
    expect(screen.getByText("Player 2")).toBeTruthy();
    expect(screen.getByLabelText("Team: Team 2; exact match")).toBeTruthy();
    expect(screen.getByLabelText("Role: Mid; exact match")).toBeTruthy();
    expect(screen.getByLabelText("Best champion: Ahri; exact match")).toBeTruthy();
    expect(screen.getByLabelText("Overall: 82; equal")).toBeTruthy();
    expect(screen.getByLabelText("Division: Lunari; exact match")).toBeTruthy();
    expect(document.querySelector('img[src="https://example.com/team-2.png"]')).toBeTruthy();
  });

  it("removes a submitted player from autocomplete", async () => {
    const candidates = [candidate(1), candidate(2)];
    const submitGuess = vi.fn<(input: unknown) => Promise<FpldleSubmission>>(async (input) => ({
      feedback: feedback(candidates.find((item) => item.slug === inputValue(input)) ?? candidates[0]),
    }));
    render(<FpldleBoard game={game(candidates)} league="academy" submitGuess={submitGuess} revealAnswer={vi.fn()} resetPuzzle={resetPuzzle()} />);

    const input = screen.getByRole("combobox", { name: "Search players" });
    const submit = screen.getByRole("button", { name: "Submit guess" });
    fireEvent.change(input, { target: { value: "Player 1" } });
    fireEvent.click(screen.getByRole("option", { name: /Player 1#NA1/ }));
    await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(submit);
    await waitFor(() => expect(submitGuess).toHaveBeenCalledTimes(1));

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Player 1" } });
    expect(screen.queryByRole("option", { name: /Player 1#NA1/ })).toBeNull();
  });

  it("stops after six guesses and reveals the answer", async () => {
    const candidates = Array.from({ length: 7 }, (_, index) => candidate(index + 1));
    const submitGuess = vi.fn<(input: unknown) => Promise<FpldleSubmission>>(async (input) => ({
      feedback: feedback(candidates.find((item) => item.slug === inputValue(input)) ?? candidates[0]),
    }));
    const revealAnswer = vi.fn(async () => ({ name: "Player 7", tag: "NA1" }));
    render(<FpldleBoard game={game(candidates)} league="premier" submitGuess={submitGuess} revealAnswer={revealAnswer} resetPuzzle={resetPuzzle()} />);

    const input = screen.getByRole("combobox", { name: "Search players" });
    const submit = screen.getByRole("button", { name: "Submit guess" });
    for (let index = 1; index <= 6; index += 1) {
      fireEvent.change(input, { target: { value: `Player ${index}` } });
      fireEvent.click(screen.getByRole("option", { name: new RegExp(`Player ${index}#NA1`) }));
      await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(false));
      fireEvent.click(submit);
      await waitFor(() => expect(submitGuess).toHaveBeenCalledTimes(index));
    }

    await waitFor(() => expect(revealAnswer).toHaveBeenCalledTimes(1));
    expect(screen.getByText("Out of guesses")).toBeTruthy();
    expect(screen.getByText("Answer: Player 7#NA1")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Submit guess" })).toBeNull();
  });

  it("recovers guesses and a revealed answer from date-and-league storage", async () => {
    const player = candidate(1);
    const stored: { date: string; guesses: FpldleFeedback[]; status: "lost"; answer: { name: string; tag: string } } = {
      date,
      guesses: [feedback(player)],
      status: "lost",
      answer: { name: "Recovered Answer", tag: "NA1" },
    };
    window.localStorage.setItem(`fpldle:academy:${date}`, JSON.stringify(stored));

    render(<FpldleBoard game={game([player])} league="academy" submitGuess={vi.fn()} revealAnswer={vi.fn()} resetPuzzle={resetPuzzle()} />);

    await waitFor(() => {
      const answerLines = screen.getAllByText(
        (_, element) => element?.tagName === "P" && (element.textContent?.includes("Recovered Answer#NA1") ?? false),
      );
      expect(answerLines).toHaveLength(1);
    });
    expect(screen.getByText("Player 1")).toBeTruthy();
    expect(screen.queryByRole("combobox", { name: "Search players" })).toBeNull();
  });

  it("lets an admin reset the puzzle and clears same-day browser progress", async () => {
    const reset = resetPuzzle();
    window.localStorage.setItem(`fpldle:premier:${date}`, JSON.stringify({ date, guesses: [], status: "playing" }));

    render(<FpldleBoard game={game()} league="premier" submitGuess={vi.fn()} revealAnswer={vi.fn()} resetPuzzle={reset} />);
    fireEvent.click(screen.getByRole("button", { name: "Reset puzzle" }));

    await waitFor(() => expect(reset).toHaveBeenCalledWith({ league: "premier", puzzleDate: date }));
    expect(window.localStorage.getItem(`fpldle:premier:${date}`)).toBeNull();
  });
});
