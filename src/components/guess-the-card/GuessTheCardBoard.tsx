"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition, type FormEvent } from "react";
import GuessTheCard from "./GuessTheCard";
import type { GuessTheCardGame, GuessTheCardLeague, GuessTheCardPuzzleReset, GuessTheCardSubmission } from "@/lib/guess-the-card/server";

type SubmitGuess = (input: unknown) => Promise<GuessTheCardSubmission>;
type ResetPuzzle = (input: unknown) => Promise<GuessTheCardPuzzleReset>;

function countdownLabel(expiresAt: string, now: number): string {
  const remaining = Math.max(0, new Date(expiresAt).getTime() - now);
  const totalSeconds = Math.floor(remaining / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
}

function shareText(game: GuessTheCardGame): string {
  const squares = game.guesses.map((guess) => (guess.correct ? "🟩" : "⬜")).join("");
  return `Guess the Card ${game.guesses.length}/5 ${squares}`.trim();
}

function leaguePath(league: GuessTheCardLeague): string {
  return league === "academy" ? "/academy/guess-the-card" : "/guess-the-card";
}

function gameStatusLabel(game: GuessTheCardGame): string {
  if (game.status === "won") return "Solved";
  if (game.status === "lost") return "Game over";
  return `${game.guesses.length}/5 guesses`;
}

export default function GuessTheCardBoard({
  initialGame,
  submitGuess,
  resetPuzzle,
}: {
  initialGame: GuessTheCardGame;
  submitGuess: SubmitGuess;
  resetPuzzle: ResetPuzzle;
}) {
  const [game, setGame] = useState(initialGame);
  const [selectedSlug, setSelectedSlug] = useState("");
  const [now, setNow] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();
  const guessedSlugs = useMemo(() => new Set(game.guesses.map((guess) => guess.slug)), [game.guesses]);
  const leagueLabel = game.league === "academy" ? "Academy" : "Premier";
  const isPlaying = game.status === "playing";

  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [game.expiresAt]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSlug || !isPlaying) return;
    setError(null);
    startTransition(() => {
      void submitGuess({ league: game.league, puzzleDate: game.date, playerSlug: selectedSlug })
        .then((result) => {
          setGame(result.game);
          setSelectedSlug("");
        })
        .catch((reason: unknown) => {
          setError(reason instanceof Error ? reason.message : "That guess could not be saved.");
        });
    });
  }

  function handleCopy() {
    setError(null);
    if (!navigator.clipboard) {
      setError("Clipboard access is unavailable. You can select the result manually.");
      return;
    }
    void navigator.clipboard.writeText(shareText(game)).then(
      () => setCopied(true),
      () => setError("Could not copy the result. You can select it manually.")
    );
  }

  function handleReset() {
    setError(null);
    startTransition(() => {
      void resetPuzzle({ league: game.league, puzzleDate: game.date })
        .then(() => window.location.reload())
        .catch((reason: unknown) => {
          setError(reason instanceof Error ? reason.message : "The test puzzle could not be reset.");
        });
    });
  }

  return (
    <main className="bg-hash mx-auto flex w-full max-w-[1200px] flex-1 flex-col gap-8 px-4 py-8 text-white sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <span className="label-dash">Daily game · Admin testing</span>
          <h1 className="type-display mt-2 text-4xl sm:text-5xl">Guess the Card</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
            Identify the anonymous {leagueLabel} player from one completed game. Five guesses. A new frozen puzzle at midnight UTC.
          </p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <div className="flex items-center gap-1.5" role="group" aria-label="Guess the Card league">
            <Link href="/guess-the-card" aria-current={game.league === "premier" ? "page" : undefined} className={`rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wide ${game.league === "premier" ? "bg-coral text-navy" : "border border-border bg-surface text-muted"}`}>
              Premier
            </Link>
            <Link href="/academy/guess-the-card" aria-current={game.league === "academy" ? "page" : undefined} className={`rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wide ${game.league === "academy" ? "bg-coral text-navy" : "border border-border bg-surface text-muted"}`}>
              Academy
            </Link>
          </div>
          <div className="text-right">
            <span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-muted">Next puzzle</span>
            <span aria-label="Next puzzle countdown" className="font-mono text-lg font-bold text-gold">{now === null ? "--:--:--" : countdownLabel(game.expiresAt, now)}</span>
          </div>
        </div>
      </header>

      <div className="rounded border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-muted">
        <span className="font-bold text-gold">Admin test gate:</span> this daily game is not open to Premium members yet. Progress and rewards still use the real account path.
      </div>

      <div className="grid items-start gap-8 lg:grid-cols-[20rem_minmax(0,1fr)] lg:gap-12">
        <div className="mx-auto w-full max-w-[20rem]">
          <GuessTheCard reveal={game.reveal} />
        </div>

        <section aria-label="Guess the Card guesses" className="card-brand min-w-0 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <span className="label-dash">{leagueLabel} puzzle · {game.date}</span>
              <h2 className="type-display mt-2 text-2xl">{gameStatusLabel(game)}</h2>
            </div>
            <span className="rounded-full border border-coral/50 bg-coral/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-coral">Role visible</span>
          </div>

          <div className="mt-5 flex flex-wrap gap-2" aria-label="Guessed players">
            {game.guesses.length === 0 ? (
              <p className="text-sm text-muted">Your guesses appear here as you work through the stat rails.</p>
            ) : (
              game.guesses.map((guess, index) => (
                <span key={`${guess.slug}-${index}`} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${guess.correct ? "border-mint/60 bg-mint/10 text-mint" : "border-border bg-canvas/60 text-muted line-through"}`}>
                  {guess.name}#{guess.tag}
                </span>
              ))
            )}
          </div>

          {isPlaying ? (
            <form className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={handleSubmit}>
              <label className="min-w-0 flex-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted" htmlFor="guess-the-card-player">
                Guess a player
                <select
                  id="guess-the-card-player"
                  value={selectedSlug}
                  onChange={(event) => setSelectedSlug(event.target.value)}
                  disabled={isPending}
                  className="mt-2 block w-full rounded border border-border bg-canvas px-3 py-3 text-sm font-normal normal-case tracking-normal text-white outline-none transition focus:border-coral disabled:opacity-60"
                >
                  <option value="">Select a player…</option>
                  {game.candidates.map((candidate) => (
                    <option key={candidate.slug} value={candidate.slug} disabled={guessedSlugs.has(candidate.slug)}>
                      {candidate.name}#{candidate.tag} · {candidate.role}{guessedSlugs.has(candidate.slug) ? " · guessed" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" disabled={!selectedSlug || isPending} className="rounded bg-coral px-5 py-3 text-xs font-black uppercase tracking-[0.14em] text-navy transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50">
                {isPending ? "Checking…" : "Lock guess"}
              </button>
            </form>
          ) : (
            <div className="mt-6 rounded border border-mint/40 bg-mint/10 px-4 py-3 text-sm text-mint">
              {game.status === "won" ? "Solved. Flip the card to review the completed game stats." : "Five guesses used. The final reveal is on the card."}
            </div>
          )}

          {game.reward ? (
            <p className="mt-4 rounded border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-gold">
              Shared daily reward: <strong>${game.reward.amount}</strong> betting dollars · balance ${game.reward.balance.toLocaleString("en-US")}
            </p>
          ) : null}

          {!isPlaying ? (
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <span className="rounded border border-border bg-canvas/50 px-3 py-2 font-mono text-sm text-white">{shareText(game)}</span>
              <button type="button" onClick={handleCopy} className="rounded border border-coral/60 px-3 py-2 text-xs font-bold uppercase tracking-wide text-coral transition hover:bg-coral/10">
                {copied ? "Copied" : "Copy result"}
              </button>
            </div>
          ) : null}

          {game.canReset ? (
            <button type="button" onClick={handleReset} disabled={isPending} className="mt-6 text-xs font-semibold uppercase tracking-[0.14em] text-muted underline decoration-line underline-offset-4 transition hover:text-white disabled:opacity-50">
              Reset test puzzle
            </button>
          ) : null}

          {error ? <p role="alert" className="mt-4 rounded border border-coral/50 bg-coral/10 px-4 py-3 text-sm text-coral">{error}</p> : null}
        </section>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-5 text-xs text-muted">
        <Link href="/premium" className="transition hover:text-white">← Premium HQ</Link>
        <Link href={leaguePath(game.league)} className="transition hover:text-white">Refresh game</Link>
      </div>
    </main>
  );
}
