"use client";

import { useEffect, useMemo, useState, useTransition, type FormEvent } from "react";
import type {
  FpldleFeedback,
  FpldleGame,
  FpldleLeague,
  FpldlePlayerPreview,
  FpldleSubmission,
} from "@/lib/fpldle/server";

const MAX_GUESSES = 5;
const ROLE_GROUPS = [
  { key: "top", label: "TOP" },
  { key: "jungle", label: "JG" },
  { key: "mid", label: "MID" },
  { key: "adc", label: "ADC" },
  { key: "support", label: "SUP" },
] as const;

type SubmitGuess = (input: unknown) => Promise<FpldleSubmission>;
type RevealAnswer = (input: unknown) => Promise<{ name: string; tag: string }>;
type ResetPuzzle = (input: unknown) => Promise<{ date: string; league: FpldleLeague }>;
type GameStatus = "playing" | "won" | "lost";

type StoredProgress = {
  date: string;
  guesses: FpldleFeedback[];
  status: GameStatus;
  answer?: { name: string; tag: string } | null;
};

function hasCurrentFeedbackShape(value: unknown): value is FpldleFeedback {
  if (typeof value !== "object" || value === null) return false;
  const feedback = value as Partial<FpldleFeedback>;
  return (
    typeof feedback.teamName === "string" &&
    typeof feedback.positionName === "string" &&
    typeof feedback.championName === "string" &&
    typeof feedback.overallValue === "number" &&
    (feedback.teamLogoUrl === null || typeof feedback.teamLogoUrl === "string") &&
    (feedback.divisionName === null || feedback.divisionName === "Solari" || feedback.divisionName === "Lunari")
  );
}

type ClueStatus = FpldleFeedback["team"] | FpldleFeedback["overall"] | FpldleFeedback["division"];

function clueClass(value: ClueStatus) {
  const isMatch = value === "match" || value === "equal";
  return isMatch
    ? "border-mint/60 bg-mint/15 text-mint"
    : "border-line bg-navy/60 text-steel";
}

function positionText(position: string): string {
  const labels: Record<string, string> = {
    top: "TOP",
    jungle: "JG",
    jg: "JG",
    mid: "MID",
    adc: "ADC",
    bot: "ADC",
    support: "SUP",
    sup: "SUP",
  };
  return labels[position.trim().toLocaleLowerCase()] ?? position;
}

function roleGroupKey(position: string): string {
  const normalized = position.trim().toLocaleLowerCase();
  if (normalized === "jg") return "jungle";
  if (normalized === "bot") return "adc";
  if (normalized === "sup") return "support";
  return normalized;
}

function exactLabel(value: "match" | "miss"): string {
  return value === "match" ? "exact match" : "miss";
}

function clueLabel(label: string, feedback: FpldleFeedback): string {
  if (label === "Team") return `${label}: ${feedback.teamName}; ${exactLabel(feedback.team)}`;
  if (label === "Role") return `${label}: ${feedback.positionName}; ${exactLabel(feedback.position)}`;
  if (label === "Best champion") return `${label}: ${feedback.championName}; ${exactLabel(feedback.champion)}`;
  if (label === "Overall") {
    return `${label}: ${feedback.overallValue}; ${feedback.overall === "equal" ? "equal" : `target overall ${feedback.overall}`}`;
  }
  if (feedback.division === "unavailable") return `${label}: unavailable for this league`;
  return `${label}: ${feedback.divisionName ?? "unassigned"}; ${exactLabel(feedback.division)}`;
}

function formatCountdown(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
}

function shareSquare(value: ClueStatus) {
  if (value === "unavailable") return "⬛";
  const isMatch = value === "match" || value === "equal";
  if (isMatch) return "🟩";
  if (value === "higher") return "⬆️";
  if (value === "lower") return "⬇️";
  return "⬜";
}

function boardGridClass(showDivision: boolean): string {
  const columns = showDivision
    ? "grid-cols-[minmax(0,1.4fr)_repeat(5,minmax(0,1fr))]"
    : "grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))]";
  return `grid min-w-0 ${columns} gap-2`;
}

function GuessRow({ feedback, showDivision }: { feedback: FpldleFeedback | null; showDivision: boolean }) {
  const gridClass = boardGridClass(showDivision);
  if (!feedback) {
    return (
      <div className={`${gridClass} rounded border border-line/60 bg-navy/30 p-2 text-sm text-steel`}>
        <span className="flex min-w-0 items-center px-2">—</span>
        {Array.from({ length: showDivision ? 5 : 4 }, (_, index) => (
          <span key={index} className="flex min-w-0 min-h-12 items-center justify-center rounded border border-line/40 px-1">
            —
          </span>
        ))}
      </div>
    );
  }

  const cells = [
    { label: "Team", status: feedback.team },
    { label: "Role", status: feedback.position },
    { label: "Best champion", status: feedback.champion },
    { label: "Overall", status: feedback.overall },
    ...(showDivision ? [{ label: "Division", status: feedback.division }] : []),
  ];
  return (
    <div className={`${gridClass} overflow-hidden rounded border border-line bg-panel p-2 text-sm`}>
      <span className="flex min-w-0 min-h-12 items-center px-2 font-semibold text-white">
        <span className="min-w-0 truncate">{feedback.player.name}</span>
        <span className="ml-1 shrink-0 text-xs font-normal text-steel">#{feedback.player.tag}</span>
      </span>
      {cells.map((cell) => (
        <span
          key={cell.label}
          aria-label={clueLabel(cell.label, feedback)}
          className={`flex min-w-0 min-h-12 items-center justify-center overflow-hidden rounded border px-1 text-center text-xs font-semibold sm:text-sm ${clueClass(cell.status)}`}
        >
          {cell.label === "Team" ? (
            <span className="flex min-w-0 items-center justify-center gap-1.5">
              {feedback.teamLogoUrl ? (
                // Team logos come from the frozen card snapshot and may be hosted outside next/image remotePatterns.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={feedback.teamLogoUrl} alt="" width={24} height={24} className="h-6 w-6 shrink-0 rounded object-contain" />
              ) : null}
            <span className="min-w-0 truncate">{feedback.teamName}</span>
            </span>
          ) : cell.label === "Role" ? (
            positionText(feedback.positionName)
          ) : cell.label === "Best champion" ? (
            <span className="min-w-0 truncate">{feedback.championName}</span>
          ) : cell.label === "Overall" ? (
            <span className="min-w-0 break-words">{feedback.overallValue} {feedback.overall === "equal" ? "· Equal" : feedback.overall === "higher" ? "· ↑ Higher" : "· ↓ Lower"}</span>
          ) : (
            feedback.divisionName ?? "Unassigned"
          )}
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
  resetPuzzle,
}: {
  game: FpldleGame;
  league: FpldleLeague;
  submitGuess: SubmitGuess;
  revealAnswer: RevealAnswer;
  resetPuzzle: ResetPuzzle;
}) {
  const storageKey = `fpldle:${league}:${game.date}`;
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<FpldlePlayerPreview | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [guesses, setGuesses] = useState<FpldleFeedback[]>([]);
  const [status, setStatus] = useState<GameStatus>("playing");
  const [answer, setAnswer] = useState<{ name: string; tag: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shared, setShared] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [remaining, setRemaining] = useState(() => new Date(game.expiresAt).getTime() - Date.now());
  const [pending, startTransition] = useTransition();
  const [resetting, startResetTransition] = useTransition();
  const showDivision = league === "premier";

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
            progress.guesses.every(hasCurrentFeedbackShape) &&
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
  const candidateGroups = useMemo(() => ROLE_GROUPS
    .map((group) => ({
      ...group,
      candidates: filteredCandidates.filter((candidate) => roleGroupKey(candidate.position) === group.key),
    }))
    .filter((group) => group.candidates.length > 0), [filteredCandidates]);

  const chooseCandidate = (candidate: FpldlePlayerPreview) => {
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
    const grid = guesses.map((guess) => {
      const squares = [
        shareSquare(guess.team),
        shareSquare(guess.position),
        shareSquare(guess.champion),
        shareSquare(guess.overall),
      ];
      if (showDivision) squares.push(shareSquare(guess.division));
      return squares.join("");
    }).join("\n");
    const text = `FPL'dle ${league === "academy" ? "Academy" : "Premier"} ${game.date}\n${grid}`;
    try {
      await navigator.clipboard.writeText(text);
      setShared(true);
      window.setTimeout(() => setShared(false), 1800);
    } catch {
      setError("Share grid could not be copied.");
    }
  };

  const handleReset = () => {
    if (resetting || pending) return;
    setError(null);
    startResetTransition(async () => {
      try {
        await resetPuzzle({ league, puzzleDate: game.date });
        try {
          window.localStorage.removeItem(storageKey);
        } catch {
          // Storage is a recovery aid, not a reason to block an admin reset.
        }
        window.location.reload();
      } catch (resetError) {
        setError(resetError instanceof Error ? resetError.message : "Puzzle could not be reset.");
      }
    });
  };

  const boardRows = Array.from({ length: MAX_GUESSES }, (_, index) => guesses[index] ?? null);
  const finished = status !== "playing";

  return (
    <main className="bg-hash mx-auto flex w-full max-w-[1800px] min-w-0 flex-1 flex-col gap-8 px-4 py-10 text-white sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="label-dash">Premium daily puzzle · {league === "academy" ? "Academy" : "Premier"}</span>
          <h1 className="type-display mt-2 text-4xl sm:text-5xl">FPL&apos;dle</h1>
          <p className="mt-3 max-w-2xl text-sm text-steel">
            Find today&apos;s player in five guesses. Team, position, best champion, and card overall give you the trail.
          </p>
        </div>
        <div className="flex flex-wrap items-end justify-end gap-3">
          <div className="rounded border border-line bg-panel px-4 py-3 text-right">
            <span className="block text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-steel">Next puzzle</span>
            <span className="font-mono text-xl text-gold" aria-live="polite">{formatCountdown(remaining)}</span>
            <span className="block text-xs text-steel">UTC reset</span>
          </div>
          <button type="button" onClick={handleReset} disabled={resetting || pending} className="rounded border border-coral/70 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-coral hover:bg-coral/10 disabled:cursor-not-allowed disabled:opacity-60">
            {resetting ? "Resetting…" : "Reset puzzle"}
          </button>
        </div>
      </header>

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
                  {candidateGroups.length > 0 ? candidateGroups.map((group) => (
                    <div key={group.key} role="group" aria-labelledby={`fpldle-role-${group.key}`}>
                      <div id={`fpldle-role-${group.key}`} className="border-b border-line/60 px-3 py-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-gold">
                        {group.label}
                      </div>
                      {group.candidates.map((candidate) => (
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
                      ))}
                    </div>
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

      <section className="card-brand p-4 sm:p-6">
        <div className={`${boardGridClass(showDivision)} mb-3 px-2 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-steel`}>
          <span className="min-w-0 break-words">Guess</span>
          <span className="min-w-0 break-words text-center">Team</span>
          <span className="min-w-0 break-words text-center">Role</span>
          <span className="min-w-0 break-words text-center">Best champion</span>
          <span className="min-w-0 break-words text-center">Overall</span>
          {showDivision ? <span className="min-w-0 break-words text-center">Division</span> : null}
        </div>
        <div className="flex min-w-0 flex-col gap-2" aria-label="FPL'dle guesses">
          {boardRows.map((feedback, index) => <GuessRow key={feedback?.player.slug ?? `empty-${index}`} feedback={feedback} showDivision={showDivision} />)}
        </div>
      </section>

      <p className="text-center text-xs text-steel">Values show each guessed player. Green means exact; misses stay neutral. Overall arrows point toward the target.</p>
    </main>
  );
}
