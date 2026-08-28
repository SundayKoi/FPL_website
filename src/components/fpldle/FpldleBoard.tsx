"use client";

import { useEffect, useMemo, useState, useTransition, type FormEvent } from "react";
import type {
  FpldleFeedback,
  FpldleGame,
  FpldleLeague,
  FpldlePlayerLabel,
  FpldleSubmission,
} from "@/lib/fpldle/server";

const MAX_GUESSES = 6;

type SubmitGuess = (input: unknown) => Promise<FpldleSubmission>;
type RevealAnswer = (input: unknown) => Promise<{ name: string; tag: string }>;
type GameStatus = "playing" | "won" | "lost";

type StoredProgress = {
  date: string;
  guesses: FpldleFeedback[];
  status: GameStatus;
  answer?: { name: string; tag: string } | null;
};

function clueText(value: FpldleFeedback["team"] | FpldleFeedback["overall"], kind: "exact" | "overall") {
  if (kind === "exact") return value === "match" ? "Match" : "Miss";
  if (value === "equal") return "Equal";
  return value === "higher" ? "↑ Higher" : "↓ Lower";
}

function clueLabel(
  label: string,
  value: FpldleFeedback["team"] | FpldleFeedback["overall"],
  kind: "exact" | "overall",
) {
  if (kind === "exact") return `${label}: ${value === "match" ? "exact match" : "miss"}`;
  if (value === "equal") return `${label}: equal`;
  return `${label}: target overall ${value === "higher" ? "higher" : "lower"}`;
}

function clueClass(value: FpldleFeedback["team"] | FpldleFeedback["overall"], kind: "exact" | "overall") {
  const isMatch = kind === "exact" ? value === "match" : value === "equal";
  return isMatch
    ? "border-mint/60 bg-mint/15 text-mint"
    : "border-line bg-navy/60 text-steel";
}

function formatCountdown(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
}

function shareSquare(value: FpldleFeedback["team"] | FpldleFeedback["overall"], kind: "exact" | "overall") {
  const isMatch = kind === "exact" ? value === "match" : value === "equal";
  if (isMatch) return "🟩";
  if (kind === "overall") return value === "higher" ? "⬆️" : "⬇️";
  return "⬜";
}

function GuessRow({ feedback }: { feedback: FpldleFeedback | null }) {
  if (!feedback) {
    return (
      <div className="grid grid-cols-[minmax(10rem,1.4fr)_repeat(4,minmax(5.25rem,1fr))] gap-2 rounded border border-line/60 bg-navy/30 p-2 text-sm text-steel">
        <span className="flex items-center px-2">—</span>
        {Array.from({ length: 4 }, (_, index) => (
          <span key={index} className="flex min-h-12 items-center justify-center rounded border border-line/40 px-1">
            —
          </span>
        ))}
      </div>
    );
  }

  const cells = [
    { label: "Team", value: feedback.team, kind: "exact" as const },
    { label: "Position", value: feedback.position, kind: "exact" as const },
    { label: "Best champion", value: feedback.champion, kind: "exact" as const },
    { label: "Overall", value: feedback.overall, kind: "overall" as const },
  ];
  return (
    <div className="grid grid-cols-[minmax(10rem,1.4fr)_repeat(4,minmax(5.25rem,1fr))] gap-2 rounded border border-line bg-panel p-2 text-sm">
      <span className="flex min-h-12 items-center px-2 font-semibold text-white">
        <span>{feedback.player.name}</span>
        <span className="ml-1 text-xs font-normal text-steel">#{feedback.player.tag}</span>
      </span>
      {cells.map((cell) => (
        <span
          key={cell.label}
          aria-label={clueLabel(cell.label, cell.value, cell.kind)}
          className={`flex min-h-12 items-center justify-center rounded border px-1 text-center text-xs font-semibold sm:text-sm ${clueClass(cell.value, cell.kind)}`}
        >
          {clueText(cell.value, cell.kind)}
        </span>
      ))}
    </div>
  );
}

export default function FpldleBoard({
  game,
  league,
  submitGuess,
  revealAnswer,
}: {
  game: FpldleGame;
  league: FpldleLeague;
  submitGuess: SubmitGuess;
  revealAnswer: RevealAnswer;
}) {
  const storageKey = `fpldle:${league}:${game.date}`;
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<FpldlePlayerLabel | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [guesses, setGuesses] = useState<FpldleFeedback[]>([]);
  const [status, setStatus] = useState<GameStatus>("playing");
  const [answer, setAnswer] = useState<{ name: string; tag: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shared, setShared] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [remaining, setRemaining] = useState(() => new Date(game.expiresAt).getTime() - Date.now());
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const stored = window.localStorage.getItem(storageKey);
        if (stored) {
          const progress = JSON.parse(stored) as StoredProgress;
          if (
            progress.date === game.date &&
            Array.isArray(progress.guesses) &&
            progress.guesses.length <= MAX_GUESSES &&
            (progress.status === "playing" || progress.status === "won" || progress.status === "lost")
          ) {
            setGuesses(progress.guesses);
            setStatus(progress.status);
            if (progress.answer) setAnswer(progress.answer);
          }
        }
      } catch {
        // Storage can be unavailable in privacy mode; play remains usable.
      }
      setLoaded(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [game.date, storageKey]);

  useEffect(() => {
    if (!loaded) return;
    try {
      const progress: StoredProgress = { date: game.date, guesses, status, answer };
      window.localStorage.setItem(storageKey, JSON.stringify(progress));
    } catch {
      // Storage is a recovery aid, not a reason to block a live puzzle.
    }
  }, [answer, game.date, guesses, loaded, status, storageKey]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setRemaining(new Date(game.expiresAt).getTime() - Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [game.expiresAt]);

  const guessedSlugs = useMemo(() => new Set(guesses.map((guess) => guess.player.slug)), [guesses]);
  const filteredCandidates = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return game.candidates
      .filter((candidate) => !guessedSlugs.has(candidate.slug))
      .filter((candidate) => {
        if (!normalized) return true;
        return `${candidate.name}#${candidate.tag}`
          .toLocaleLowerCase()
          .includes(normalized);
      })
      .slice(0, 8);
  }, [game.candidates, guessedSlugs, query]);

  const chooseCandidate = (candidate: FpldlePlayerLabel) => {
    setSelected(candidate);
    setQuery(`${candidate.name}#${candidate.tag}`);
    setListOpen(false);
    setError(null);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!loaded || pending || status !== "playing" || guesses.length >= MAX_GUESSES) return;
    if (!selected) {
      setError("Choose a player first.");
      return;
    }
    if (guessedSlugs.has(selected.slug)) {
      setError("Already guessed. Choose another player.");
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        const result = await submitGuess({ league, puzzleDate: game.date, playerSlug: selected.slug });
        const nextGuesses = [...guesses, result.feedback];
        setGuesses(nextGuesses);
        setSelected(null);
        setQuery("");
        if (result.feedback.isCorrect) {
          setStatus("won");
        } else if (nextGuesses.length >= MAX_GUESSES) {
          setStatus("lost");
          try {
            const revealed = await revealAnswer({
              league,
              puzzleDate: game.date,
              guesses: nextGuesses.map((guess) => guess.player.slug),
            });
            setAnswer(revealed);
          } catch {
            // Loss state still stands if answer reveal is unavailable.
          }
        }
      } catch (submissionError) {
        setError(submissionError instanceof Error ? submissionError.message : "Guess could not be submitted.");
      }
    });
  };

  const copyShareGrid = async () => {
    const grid = guesses
      .map((guess) =>
        [
          shareSquare(guess.team, "exact"),
          shareSquare(guess.position, "exact"),
          shareSquare(guess.champion, "exact"),
          shareSquare(guess.overall, "overall"),
        ].join(""),
      )
      .join("\n");
    const text = `FPL'dle ${league === "academy" ? "Academy" : "Premier"} ${game.date}\n${grid}`;
    try {
      await navigator.clipboard.writeText(text);
      setShared(true);
      window.setTimeout(() => setShared(false), 1800);
    } catch {
      setError("Share grid could not be copied.");
    }
  };

  const boardRows = Array.from({ length: MAX_GUESSES }, (_, index) => guesses[index] ?? null);
  const finished = status !== "playing";

  return (
    <main className="bg-hash mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-10 text-white sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="label-dash">Premium daily puzzle · {league === "academy" ? "Academy" : "Premier"}</span>
          <h1 className="type-display mt-2 text-4xl sm:text-5xl">FPL&apos;dle</h1>
          <p className="mt-3 max-w-2xl text-sm text-steel">
            Find today&apos;s player in six guesses. Team, position, best champion, and card overall give you the trail.
          </p>
        </div>
        <div className="rounded border border-line bg-panel px-4 py-3 text-right">
          <span className="block text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-steel">Next puzzle</span>
          <span className="font-mono text-xl text-gold" aria-live="polite">{formatCountdown(remaining)}</span>
          <span className="block text-xs text-steel">UTC reset</span>
        </div>
      </header>

      <section className="card-brand p-4 sm:p-6">
        <div className="mb-3 grid grid-cols-[minmax(10rem,1.4fr)_repeat(4,minmax(5.25rem,1fr))] gap-2 px-2 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-steel">
          <span>Guess</span>
          <span className="text-center">Team</span>
          <span className="text-center">Position</span>
          <span className="text-center">Best champion</span>
          <span className="text-center">Overall</span>
        </div>
        <div className="flex flex-col gap-2" aria-label="FPL'dle guesses">
          {boardRows.map((feedback, index) => <GuessRow key={feedback?.player.slug ?? `empty-${index}`} feedback={feedback} />)}
        </div>
      </section>

      <section className="card-brand p-4 sm:p-6">
        {!finished ? (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <label htmlFor="fpldle-player" className="label-dash">Choose player</label>
            <div className="relative">
              <input
                id="fpldle-player"
                role="combobox"
                aria-label="Search players"
                aria-autocomplete="list"
                aria-controls="fpldle-player-list"
                aria-expanded={listOpen}
                autoComplete="off"
                className="input-brand w-full px-4 py-3"
                placeholder="Search name, team, position, or champion"
                value={query}
                onFocus={() => setListOpen(true)}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setSelected(null);
                  setListOpen(true);
                  setError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && listOpen && filteredCandidates[0]) {
                    event.preventDefault();
                    chooseCandidate(filteredCandidates[0]);
                  }
                  if (event.key === "Escape") setListOpen(false);
                }}
              />
              {listOpen ? (
                <div id="fpldle-player-list" role="listbox" className="absolute z-10 mt-1 max-h-72 w-full overflow-auto rounded border border-line bg-navy p-1 shadow-xl">
                  {filteredCandidates.length > 0 ? filteredCandidates.map((candidate) => (
                    <button
                      key={candidate.slug}
                      type="button"
                      role="option"
                      aria-selected={selected?.slug === candidate.slug}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => chooseCandidate(candidate)}
                      className="flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm hover:bg-panel focus-visible:bg-panel focus-visible:outline-none"
                    >
                      <span className="font-semibold text-white">{candidate.name}<span className="ml-1 text-xs font-normal text-steel">#{candidate.tag}</span></span>
                    </button>
                  )) : <span className="block px-3 py-2 text-sm text-steel">No players found.</span>}
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" className="btn-coral rounded px-5 py-2.5" disabled={pending || !loaded || !selected}>
                {pending ? "Checking…" : "Submit guess"}
              </button>
              <span className="text-xs text-steel">{MAX_GUESSES - guesses.length} guesses remaining</span>
            </div>
            {error ? <p role="alert" className="text-sm text-coral">{error}</p> : null}
          </form>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="label-dash">Puzzle complete</span>
              <p className="type-display mt-1 text-2xl">{status === "won" ? `Solved in ${guesses.length}` : "Out of guesses"}</p>
              {status === "lost" ? (
                <p className="mt-1 text-sm text-steel">Answer: {answer ? `${answer.name}#${answer.tag}` : "answer reveal unavailable"}</p>
              ) : <p className="mt-1 text-sm text-steel">New puzzle at 00:00 UTC.</p>}
            </div>
            {guesses.length > 0 ? <button type="button" onClick={() => void copyShareGrid()} className="rounded border border-line px-4 py-2 text-xs font-semibold uppercase tracking-wide text-steel hover:border-coral hover:text-white">{shared ? "Copied" : "Copy share grid"}</button> : null}
          </div>
        )}
      </section>

      <p className="text-center text-xs text-steel">Green means exact. Misses stay neutral. Overall arrows point toward the target.</p>
    </main>
  );
}
