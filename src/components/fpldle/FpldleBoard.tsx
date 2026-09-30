"use client";

import { formatCountdown } from "@/lib/time";
import BalanceChip from "@/components/BalanceChip";
import { DAILY_REWARD_SENTENCE } from "@/lib/betting/daily";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition, type FormEvent } from "react";
import type {
  FpldleFeedback,
  FpldleGame,
  FpldleLeague,
  FpldlePlayerPreview,
  FpldleReward,
  FpldleStreakSnapshot,
  FpldleSubmission,
} from "@/lib/fpldle/server";
import GuessRow from "./GuessRow";
import FpldleLeagueToggle from "./FpldleLeagueToggle";
import { PersonalStreakCard, StreakLeaderboard } from "./FpldleStreaks";
import {
  MAX_GUESSES,
  ROLE_GROUPS,
  boardGridClass,
  formatLocalResetTime,
  hasCurrentFeedbackShape,
  hasCurrentRewardShape,
  roleGroupKey,
  shareGridText,
  type GameStatus,
  type StoredProgress,
} from "./fpldleView";

type SubmitGuess = (input: unknown) => Promise<FpldleSubmission>;
type RevealAnswer = (input: unknown) => Promise<{ name: string; tag: string }>;
type ResetPuzzle = (input: unknown) => Promise<{ date: string; league: FpldleLeague }>;

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
  const [roleFilter, setRoleFilter] = useState<string | null>(null);
  const [selected, setSelected] = useState<FpldlePlayerPreview | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [guesses, setGuesses] = useState<FpldleFeedback[]>(game.progress.guesses);
  const [status, setStatus] = useState<GameStatus>(game.progress.status);
  const [answer, setAnswer] = useState<{ name: string; tag: string } | null>(game.progress.answer);
  const [reward, setReward] = useState<FpldleReward | null>(game.progress.reward);
  const [streaks, setStreaks] = useState<FpldleStreakSnapshot>(game.streaks);
  const [error, setError] = useState<string | null>(null);
  const [shared, setShared] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [localResetTime, setLocalResetTime] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const [resetting, startResetTransition] = useTransition();
  const playerPickerRef = useRef<HTMLDivElement | null>(null);
  const expiryRefreshDate = useRef<string | null>(null);
  const { refresh } = useRouter();
  const showDivision = league === "premier";

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const hasAccountProgress = game.progress.guesses.length > 0 || game.progress.status !== "playing";
        const stored = hasAccountProgress ? null : window.localStorage.getItem(storageKey);
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
            if (hasCurrentRewardShape(progress.reward)) setReward(progress.reward);
          }
        }
      } catch {
        // Storage can be unavailable in privacy mode; play remains usable.
      }
      setLoaded(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [game.date, game.progress.guesses.length, game.progress.status, storageKey]);

  useEffect(() => {
    if (!loaded) return;
    try {
      const progress: StoredProgress = { date: game.date, guesses, status, answer, reward };
      window.localStorage.setItem(storageKey, JSON.stringify(progress));
    } catch {
      // Storage is a recovery aid, not a reason to block a live puzzle.
    }
  }, [answer, game.date, guesses, loaded, reward, status, storageKey]);

  useEffect(() => {
    const updateRemaining = () => {
      setRemaining(new Date(game.expiresAt).getTime() - Date.now());
    };
    updateRemaining();
    const timer = window.setInterval(updateRemaining, 1000);
    return () => window.clearInterval(timer);
  }, [game.expiresAt]);

  useEffect(() => {
    const expiresAt = new Date(game.expiresAt).getTime();
    if (!Number.isFinite(expiresAt)) return;

    const refreshExpiredPuzzle = () => {
      if (expiryRefreshDate.current === game.date) return;
      expiryRefreshDate.current = game.date;
      refresh();
    };
    const delay = expiresAt - Date.now();
    if (delay <= 0) {
      refreshExpiredPuzzle();
      return;
    }

    const timer = window.setTimeout(refreshExpiredPuzzle, delay);
    return () => window.clearTimeout(timer);
  }, [game.date, game.expiresAt, refresh]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLocalResetTime(formatLocalResetTime(game.expiresAt));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [game.expiresAt]);

  useEffect(() => {
    if (!listOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!playerPickerRef.current?.contains(event.target as Node)) setListOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [listOpen]);

  const guessedSlugs = useMemo(() => new Set(guesses.map((guess) => guess.player.slug)), [guesses]);
  const filteredCandidates = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return game.candidates
      .filter((candidate) => !guessedSlugs.has(candidate.slug))
      .filter((candidate) => !roleFilter || roleGroupKey(candidate.position) === roleFilter)
      .filter((candidate) => {
        if (!normalized) return true;
        return `${candidate.name}#${candidate.tag}`
          .toLocaleLowerCase()
          .includes(normalized);
      });
  }, [game.candidates, guessedSlugs, query, roleFilter]);
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
        if (!result.ok) {
          setGuesses(result.progress.guesses);
          setStatus(result.progress.status);
          setAnswer(result.progress.answer);
          setReward(result.progress.reward);
          setSelected(null);
          setQuery("");
          setError(result.message);
          return;
        }
        const nextGuesses = [...guesses, result.feedback];
        setGuesses(nextGuesses);
        setReward(result.reward);
        if (result.streaks) setStreaks(result.streaks);
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
    const text = shareGridText(league, game.date, guesses, showDivision);
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
    <main className="page-backdrop mx-auto flex w-full max-w-[1800px] min-w-0 flex-1 flex-col gap-8 px-4 py-10 text-white sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="label-dash">Premium daily puzzle · {league === "academy" ? "Academy" : "Premier"}</span>
          <h1 className="type-display mt-2 text-4xl sm:text-5xl">FPL&apos;dle</h1>
          <p className="mt-3 max-w-2xl text-sm text-muted">
            Find today&apos;s player in five guesses. Team, position, best champion, and card overall give you the trail.
          </p>
        </div>
        <div className="flex flex-wrap items-end justify-end gap-3">
          <FpldleLeagueToggle league={league} />
          <PersonalStreakCard snapshot={streaks} />
          <div className="rounded border border-border-subtle bg-surface px-4 py-3 text-right">
            <span className="block text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-muted">Next puzzle</span>
            <span className="font-mono text-xl text-gold" aria-live="polite">{remaining === null ? "—:—:—" : formatCountdown(remaining)}</span>
            <span data-testid="fpldle-local-reset" className="block text-xs text-muted">
              {localResetTime ? `Midnight Eastern · ${localResetTime} for you` : "Resets at midnight Eastern"}
            </span>
          </div>
          {game.canReset ? (
            <button type="button" onClick={handleReset} disabled={resetting || pending} className="rounded border border-coral/70 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-coral hover:bg-coral/10 disabled:cursor-not-allowed disabled:opacity-60">
              {resetting ? "Resetting…" : "Reset puzzle"}
            </button>
          ) : null}
        </div>
      </header>

      <section className="card-brand p-4 sm:p-6">
        {!finished ? (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <label htmlFor="fpldle-player" className="label-dash">Choose player</label>
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter players by role">
              {ROLE_GROUPS.map((group) => {
                const active = roleFilter === group.key;
                return (
                  <button
                    key={group.key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setRoleFilter((current) => (current === group.key ? null : group.key))}
                    className={active
                      ? "rounded-full bg-coral px-3 py-1 text-xs font-semibold text-canvas"
                      : "rounded-full border border-border-subtle bg-surface px-3 py-1 text-xs font-semibold text-muted hover:text-white"}
                  >
                    {group.label}
                  </button>
                );
              })}
            </div>
            <div ref={playerPickerRef} className="relative">
              <input
                id="fpldle-player"
                role="combobox"
                aria-label="Search players"
                aria-autocomplete="list"
                aria-controls="fpldle-player-list"
                aria-expanded={listOpen}
                autoComplete="off"
                className="input-brand w-full px-4 py-3"
                placeholder="Search player name or tag"
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
                <div id="fpldle-player-list" role="listbox" className="absolute z-10 mt-1 max-h-72 w-full overflow-auto rounded border border-border-subtle bg-canvas p-1 shadow-xl">
                  {candidateGroups.length > 0 ? candidateGroups.map((group) => (
                    <div key={group.key} role="group" aria-labelledby={`fpldle-role-${group.key}`}>
                      <div id={`fpldle-role-${group.key}`} className="border-b border-border-subtle/60 px-3 py-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-gold">
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
                          className="flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm hover:bg-surface focus-visible:bg-surface focus-visible:outline-none"
                        >
                          <span className="font-semibold text-white">{candidate.name}<span className="ml-1 text-xs font-normal text-muted">#{candidate.tag}</span></span>
                        </button>
                      ))}
                    </div>
                  )) : <span className="block px-3 py-2 text-sm text-muted">No players found.</span>}
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" className="btn-primary rounded px-5 py-2.5" disabled={pending || !loaded || !selected}>
                {pending ? "Checking…" : "Submit guess"}
              </button>
              <span className="text-xs text-muted">{MAX_GUESSES - guesses.length} guesses remaining</span>
            </div>
            {error ? <p role="alert" className="text-sm text-coral">{error}</p> : null}
          </form>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="label-dash">Puzzle complete</span>
              <p className="type-display mt-1 text-2xl">{status === "won" ? `Solved in ${guesses.length}` : "Out of guesses"}</p>
              {status === "won" && reward ? (
                <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-mint">
                  <span>+${reward.amount} betting dollars credited{reward.alreadyClaimed ? " previously" : ""}.</span>
                  <BalanceChip balance={reward.balance} />
                </p>
              ) : status === "lost" ? (
                <p className="mt-1 text-sm text-muted">Answer: {answer ? `${answer.name}#${answer.tag}` : "answer reveal unavailable"}</p>
              ) : <p className="mt-1 text-sm text-muted">New puzzle at midnight Eastern.</p>}
            </div>
            {guesses.length > 0 ? <button type="button" onClick={() => void copyShareGrid()} className="rounded border border-border-strong px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted hover:border-action-text hover:text-white">{shared ? "Copied" : "Copy share grid"}</button> : null}
          </div>
        )}
      </section>

      <aside aria-label="FPL&apos;dle reward" className="rounded border border-border-subtle bg-surface px-4 py-3 text-sm text-muted">
        <span className="label-dash">Shared puzzle reward</span>
        <p className="mt-2 text-white">{DAILY_REWARD_SENTENCE} FPL&apos;dle pays when you solve within five guesses.</p>
      </aside>
      <p role="note" className="rounded border border-border-subtle bg-surface px-4 py-3 text-sm text-muted">
        <span className="font-semibold text-white">Reminder:</span> Possible players include substitutes (subs).
      </p>

      <section className="card-brand p-4 sm:p-6">
        <div role="region" aria-label="Guess history; scroll horizontally to read every clue" tabIndex={0} className="overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
        <div className="min-w-[38rem]">
        <div className={`${boardGridClass(showDivision)} mb-3 px-2 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted`}>
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
        </div>
        </div>
      </section>

      <StreakLeaderboard snapshot={streaks} />

      <p className="text-center text-xs text-muted">Each clue names the guessed player’s value and result. Exact matches use green; misses stay neutral. Overall arrows point toward the target.</p>
    </main>
  );
}
