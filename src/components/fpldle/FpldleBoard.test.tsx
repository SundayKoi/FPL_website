import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FpldleCandidate, FpldleFeedback, FpldleGame, FpldleStreakSnapshot, FpldleSubmission } from "@/lib/fpldle/server";
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
    canReset: true,
    previousGuesses: [],
    candidates,
    streaks: streaks(),
  };
}

function streaks(overrides: Partial<FpldleStreakSnapshot> = {}): FpldleStreakSnapshot {
  const personal = {
    profileId: "profile-1",
    username: "Tester",
    avatarUrl: "https://example.com/tester.png",
    currentStreak: 3,
    bestStreak: 5,
    rank: 1,
    isCurrentUser: true,
  };
  return {
    leaderboard: [personal],
    personal,
    ...overrides,
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
  it("shows the next reset in the browser's local timezone", async () => {
    render(<FpldleBoard game={game()} league="premier" submitGuess={vi.fn()} revealAnswer={vi.fn()} resetPuzzle={resetPuzzle()} />);

    await waitFor(() => {
      const reset = screen.getByTestId("fpldle-local-reset");
      expect(reset.textContent).not.toBe("Resets at your local time");
    });
  });

  it("offers a Premier and Academy puzzle toggle", () => {
    render(<FpldleBoard game={game()} league="premier" submitGuess={vi.fn()} revealAnswer={vi.fn()} resetPuzzle={resetPuzzle()} />);

    const toggle = screen.getByRole("group", { name: "FPL'dle league" });
    expect(within(toggle).getByRole("link", { name: "Premier" }).getAttribute("href")).toBe("/fpldle");
    expect(within(toggle).getByRole("link", { name: "Academy" }).getAttribute("href")).toBe("/academy/fpldle");
    expect(within(toggle).getByRole("link", { name: "Premier" }).getAttribute("aria-current")).toBe("page");
    expect(within(toggle).getByRole("link", { name: "Academy" }).getAttribute("aria-current")).toBeNull();

    cleanup();
    render(<FpldleBoard game={game()} league="academy" submitGuess={vi.fn()} revealAnswer={vi.fn()} resetPuzzle={resetPuzzle()} />);
    const academyToggle = screen.getByRole("group", { name: "FPL'dle league" });
    expect(within(academyToggle).getByRole("link", { name: "Academy" }).getAttribute("aria-current")).toBe("page");
    expect(within(academyToggle).getByRole("link", { name: "Premier" }).getAttribute("aria-current")).toBeNull();
  });

  it("hides the testing reset control from regular Premium members", () => {
    render(<FpldleBoard game={{ ...game(), canReset: false }} league="premier" submitGuess={vi.fn()} revealAnswer={vi.fn()} resetPuzzle={resetPuzzle()} />);

    expect(screen.queryByRole("button", { name: "Reset puzzle" })).toBeNull();
  });

  it("shows personal streak and positive leaderboard rows", () => {
    render(
      <FpldleBoard
        game={game([candidate(1)])}
        league="premier"
        submitGuess={vi.fn()}
        revealAnswer={vi.fn()}
        resetPuzzle={resetPuzzle()}
      />,
    );

    expect(screen.getByTestId("fpldle-current-streak").textContent).toContain("3");
    expect(screen.getByTestId("fpldle-best-streak").textContent).toContain("5");
    expect(screen.getByRole("heading", { name: "Top streaks" })).toBeTruthy();
    const currentRow = screen.getByTestId("fpldle-current-leaderboard-row");
    expect(currentRow.textContent).toContain("Tester");
    expect(currentRow.className).toContain("bg-coral/10");
  });

  it("shows empty leaderboard when no positive streaks exist", () => {
    render(
      <FpldleBoard
        game={{ ...game([candidate(1)]), streaks: { leaderboard: [], personal: null } }}
        league="academy"
        submitGuess={vi.fn()}
        revealAnswer={vi.fn()}
        resetPuzzle={resetPuzzle()}
      />,
    );
    expect(screen.getByRole("region", { name: "Top streaks" }).textContent).toContain("No active streaks yet.");
  });

  it("keeps current-user highlight when personal rank is outside top five", () => {
    const rows = Array.from({ length: 5 }, (_, index) => ({
      profileId: `leader-${index}`,
      username: `Leader ${index}`,
      avatarUrl: null,
      currentStreak: 10 - index,
      bestStreak: 10 - index,
      rank: index + 1,
      isCurrentUser: false,
    }));
    const personal = {
      profileId: "profile-1",
      username: "Tester",
      avatarUrl: null,
      currentStreak: 1,
      bestStreak: 1,
      rank: 6,
      isCurrentUser: true,
    };
    render(
      <FpldleBoard
        game={{ ...game([candidate(1)]), streaks: { leaderboard: [...rows, personal], personal } }}
        league="premier"
        submitGuess={vi.fn()}
        revealAnswer={vi.fn()}
        resetPuzzle={resetPuzzle()}
      />,
    );
    const currentRow = screen.getByTestId("fpldle-current-leaderboard-row");
    expect(currentRow.textContent).toContain("#6");
    expect(currentRow.className).toContain("bg-coral/10");
  });

  it("shows the substitute reminder at the top of the page", () => {
    render(<FpldleBoard game={game()} league="premier" submitGuess={vi.fn()} revealAnswer={vi.fn()} resetPuzzle={resetPuzzle()} />);

    expect(screen.getByRole("note").textContent).toContain("Possible players include substitutes (subs)");
    expect(screen.getByRole("complementary", { name: "FPL'dle reward" }).textContent).toContain("Normal users get $200 betting dollars; active patrons get $300");
    expect(screen.queryByRole("complementary", { name: "New feature announcement" })).toBeNull();
  });

  it("shows the same normal and patron reward rates in the reward card", () => {
    render(<FpldleBoard game={{ ...game(), patron: true }} league="premier" submitGuess={vi.fn()} revealAnswer={vi.fn()} resetPuzzle={resetPuzzle()} />);

    expect(screen.getByRole("complementary", { name: "FPL'dle reward" }).textContent).toContain("Normal users get $200 betting dollars; active patrons get $300");
  });

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

  it("closes player recommendations when clicking outside the search bar", () => {
    render(<FpldleBoard game={game()} league="premier" submitGuess={vi.fn()} revealAnswer={vi.fn()} resetPuzzle={resetPuzzle()} />);

    const input = screen.getByRole("combobox", { name: "Search players" });
    fireEvent.focus(input);
    expect(screen.getByRole("listbox")).toBeTruthy();

    fireEvent.pointerDown(screen.getByLabelText("FPL'dle guesses"));

    expect(screen.queryByRole("listbox")).toBeNull();
    expect(input.getAttribute("aria-expanded")).toBe("false");
  });

  it("filters by role and shows every available player in that role", () => {
    const candidates = [
      ...Array.from({ length: 12 }, (_, index) => ({ ...candidate(index + 1), position: "Mid" })),
      { ...candidate(13), position: "Top" },
    ];
    render(<FpldleBoard game={game(candidates)} league="premier" submitGuess={vi.fn()} revealAnswer={vi.fn()} resetPuzzle={resetPuzzle()} />);

    const input = screen.getByRole("combobox", { name: "Search players" });
    fireEvent.focus(input);
    const roleFilters = screen.getByRole("group", { name: "Filter players by role" });
    expect(within(roleFilters).getAllByRole("button")).toHaveLength(5);
    fireEvent.click(screen.getByRole("button", { name: "MID" }));

    expect(screen.getByRole("button", { name: "MID" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getAllByRole("option")).toHaveLength(12);
    expect(screen.getByRole("option", { name: /Player 12#NA1/ })).toBeTruthy();
    expect(screen.queryByRole("option", { name: /Player 13#NA1/ })).toBeNull();
  });

  it("searches, submits, and exposes text plus accessible clue labels", async () => {
    const candidates = [candidate(1), candidate(2)];
    const submitGuess = vi.fn<(input: unknown) => Promise<FpldleSubmission>>(async (input) => ({
      feedback: feedback(candidates.find((item) => item.slug === inputValue(input)) ?? candidates[0], true),
      reward: { amount: 200, balance: 1200, alreadyClaimed: false },
      streaks: null,
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
    expect(screen.getByText("+$200 betting dollars credited.")).toBeTruthy();
    expect(document.querySelector('img[src="https://example.com/team-2.png"]')).toBeTruthy();
  });

  it("updates personal streak and leaderboard after a win without reload", async () => {
    const candidates = [candidate(1), candidate(2)];
    const refreshed = {
      profileId: "profile-1",
      username: "Tester",
      avatarUrl: null,
      currentStreak: 4,
      bestStreak: 6,
      rank: 1,
      isCurrentUser: true,
    };
    const submitGuess = vi.fn<(input: unknown) => Promise<FpldleSubmission>>(async () => ({
      feedback: feedback(candidates[0], true),
      reward: null,
      streaks: { leaderboard: [refreshed], personal: refreshed },
    }));
    render(
      <FpldleBoard
        game={{ ...game(candidates), streaks: { leaderboard: [{ ...refreshed, currentStreak: 1, bestStreak: 2 }], personal: { ...refreshed, currentStreak: 1, bestStreak: 2 } } }}
        league="premier"
        submitGuess={submitGuess}
        revealAnswer={vi.fn()}
        resetPuzzle={resetPuzzle()}
      />,
    );

    const input = screen.getByRole("combobox", { name: "Search players" });
    fireEvent.change(input, { target: { value: "Player 1" } });
    fireEvent.click(screen.getByRole("option", { name: /Player 1#NA1/ }));
    const submit = screen.getByRole("button", { name: "Submit guess" });
    await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(submit);

    await waitFor(() => expect(screen.getByTestId("fpldle-current-streak").textContent).toContain("4"));
    expect(screen.getByTestId("fpldle-best-streak").textContent).toContain("6");
    expect(screen.getByTestId("fpldle-current-leaderboard-row").textContent).toContain("4");
  });

  it("removes a submitted player from autocomplete", async () => {
    const candidates = [candidate(1), candidate(2)];
    const submitGuess = vi.fn<(input: unknown) => Promise<FpldleSubmission>>(async (input) => ({
      feedback: feedback(candidates.find((item) => item.slug === inputValue(input)) ?? candidates[0]),
      reward: null,
      streaks: null,
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

  it("stops after five guesses and reveals the answer", async () => {
    const candidates = Array.from({ length: 6 }, (_, index) => candidate(index + 1));
    const submitGuess = vi.fn<(input: unknown) => Promise<FpldleSubmission>>(async (input) => ({
      feedback: feedback(candidates.find((item) => item.slug === inputValue(input)) ?? candidates[0]),
      reward: null,
      streaks: null,
    }));
    const revealAnswer = vi.fn(async () => ({ name: "Player 6", tag: "NA1" }));
    render(<FpldleBoard game={game(candidates)} league="premier" submitGuess={submitGuess} revealAnswer={revealAnswer} resetPuzzle={resetPuzzle()} />);

    const input = screen.getByRole("combobox", { name: "Search players" });
    const submit = screen.getByRole("button", { name: "Submit guess" });
    for (let index = 1; index <= 5; index += 1) {
      fireEvent.change(input, { target: { value: `Player ${index}` } });
      fireEvent.click(screen.getByRole("option", { name: new RegExp(`Player ${index}#NA1`) }));
      await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(false));
      fireEvent.click(submit);
      await waitFor(() => expect(submitGuess).toHaveBeenCalledTimes(index));
    }

    await waitFor(() => expect(revealAnswer).toHaveBeenCalledTimes(1));
    expect(screen.getByText("Out of guesses")).toBeTruthy();
    expect(screen.getByText("Answer: Player 6#NA1")).toBeTruthy();
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
