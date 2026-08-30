"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import PlayerCard3D from "@/components/cards/PlayerCard3D";
import type {
  ConcealedHigherLowerCard,
  HigherLowerChoice,
  HigherLowerGame,
  HigherLowerLeague,
} from "@/lib/higher-lower/server";

type GameAction = (input: unknown) => Promise<HigherLowerGame>;
type StartAction = (league: HigherLowerLeague) => Promise<HigherLowerGame>;

function leagueLabel(league: HigherLowerLeague): string {
  return league === "academy" ? "Academy" : "Premier";
}

function formatTimer(milliseconds: number): string {
  return `${Math.max(0, Math.ceil(milliseconds / 1000))}s`;
}

function ConcealedCard({ card }: { card: ConcealedHigherLowerCard }) {
  return (
    <div
      className="relative flex h-[28rem] w-[20rem] flex-col overflow-hidden rounded-2xl border-4 border-coral bg-panel shadow-[0_16px_36px_rgb(0_0_0/0.45)]"
      aria-label={`${card.name} challenger card`}
    >
      <div
        className="absolute inset-1 rounded-xl bg-cover bg-center opacity-75"
        style={card.artUrl ? { backgroundImage: `linear-gradient(rgb(0 31 52 / 0.35), rgb(0 31 52 / 0.82)), url("${card.artUrl}")` } : undefined}
        aria-hidden="true"
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_25%,rgb(255_107_53/0.2),transparent_42%),linear-gradient(135deg,transparent_0_47%,rgb(255_255_255/0.06)_48%_50%,transparent_51%)]" aria-hidden="true" />
      <div className="relative flex flex-1 flex-col justify-between p-5">
        <div className="flex items-start justify-between gap-3">
          <span className="rounded-full border border-coral/70 bg-navy/75 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-coral">
            Challenger
          </span>
          {card.teamImageUrl ? (
            // Team branding is safe cosmetic data from the frozen snapshot.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={card.teamImageUrl} alt="" width={42} height={42} className="h-10 w-10 object-contain" />
          ) : null}
        </div>
        <div className="rounded-xl border border-white/15 bg-navy/80 p-4 backdrop-blur-sm">
          <p className="font-display text-3xl font-bold text-white">{card.name}</p>
          {card.teamName ? (
            <p className="mt-1 text-xs font-bold uppercase tracking-[0.18em] text-steel">
              {card.teamAbbr ?? card.teamName}
            </p>
          ) : null}
          <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.2em] text-coral">OVR concealed</p>
        </div>
      </div>
    </div>
  );
}

function formatEditionWeek(editionWeek: string | null | undefined): string {
  if (!editionWeek) return "Card week unavailable";
  const date = new Date(`${editionWeek}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return `From card week · ${editionWeek}`;
  return `From card week · ${date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}`;
}

function CardStage({ children, label, editionWeek }: { children: React.ReactNode; label: string; editionWeek?: string | null }) {
  return (
    <section aria-label={label} className="flex min-w-0 flex-1 flex-col items-center">
      <span className="mt-1 self-start text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-steel">{formatEditionWeek(editionWeek)}</span>
      <div className="mt-3 flex h-[24rem] w-full items-start justify-center overflow-hidden min-[360px]:h-[27rem] sm:h-[33rem]">
        <div className="origin-top scale-[0.8] min-[360px]:scale-[0.9] sm:scale-[1.08]">{children}</div>
      </div>
    </section>
  );
}

function LeagueToggle({ league }: { league: HigherLowerLeague }) {
  return (
    <div className="flex items-center gap-1.5" role="group" aria-label="Higher or Lower league">
      <Link
        href="/higher-lower"
        aria-current={league === "premier" ? "page" : undefined}
        className={`rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition ${
          league === "premier" ? "bg-coral text-navy" : "border border-line bg-panel text-steel hover:text-white"
        }`}
      >
        Premier
      </Link>
      <Link
        href="/academy/higher-lower"
        aria-current={league === "academy" ? "page" : undefined}
        className={`rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition ${
          league === "academy" ? "bg-coral text-navy" : "border border-line bg-panel text-steel hover:text-white"
        }`}
      >
        Academy
      </Link>
    </div>
  );
}

function Leaderboard({ game }: { game: HigherLowerGame }) {
  return (
    <section aria-labelledby="higher-lower-leaderboard" className="card-brand p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="label-dash">Weekly leaderboard</span>
          <h2 id="higher-lower-leaderboard" className="type-display mt-1 text-2xl">
            Best runs this week
          </h2>
        </div>
        <span className="text-xs text-steel">Premier + Academy · {game.weekStart}</span>
      </div>
      {game.weeklyLeaderboard.length === 0 ? (
        <p className="mt-5 rounded border border-dashed border-line px-4 py-5 text-center text-sm text-steel">
          No runs scored yet this week.
        </p>
      ) : (
        <div className="mt-4 overflow-hidden rounded border border-line">
          <div className="grid grid-cols-[3rem_minmax(0,1fr)_5rem] gap-2 bg-navy/60 px-3 py-2 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-steel">
            <span>Rank</span>
            <span>Member</span>
            <span className="text-right">Score</span>
          </div>
          {game.weeklyLeaderboard.map((row) => (
            <div
              key={`${row.rank}-${row.username}`}
              className={`grid grid-cols-[3rem_minmax(0,1fr)_5rem] gap-2 border-t border-line/70 px-3 py-2.5 text-sm ${
                row.isCurrentUser ? "bg-coral/10 text-white" : "bg-panel/60 text-steel"
              }`}
            >
              <span className="font-mono text-gold">#{row.rank}</span>
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className="h-7 w-7 shrink-0 rounded-full border border-line bg-cover bg-center"
                  style={row.avatarUrl ? { backgroundImage: `url("${row.avatarUrl}")` } : undefined}
                  aria-hidden="true"
                />
                <span className="min-w-0 truncate font-semibold">
                  {row.username}
                  {row.isCurrentUser ? <span className="ml-1 text-xs font-normal text-coral">(you)</span> : null}
                  <span className="block truncate text-[0.65rem] font-normal uppercase tracking-wide text-steel">
                    {row.league} · {row.achievedDate}
                  </span>
                </span>
              </span>
              <span className="text-right font-mono font-bold text-white">{row.score}/30</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function HigherLowerBoard({
  initialGame,
  league,
  startRun,
  submitChoice,
  advanceRound,
}: {
  initialGame: HigherLowerGame;
  league: HigherLowerLeague;
  startRun: StartAction;
  submitChoice: GameAction;
  advanceRound: GameAction;
}) {
  const [game, setGame] = useState(initialGame);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const timeoutSentFor = useRef<string | null>(null);

  const applyAction = useCallback((action: () => Promise<HigherLowerGame>) => {
    setError(null);
    startTransition(async () => {
      try {
        setGame(await action());
      } catch (actionError) {
        setError(actionError instanceof Error ? actionError.message : "Higher or Lower could not save that move.");
      }
    });
  }, [startTransition]);

  const remaining = game.roundExpiresAt ? new Date(game.roundExpiresAt).getTime() - nowMs : 0;

  useEffect(() => {
    if (game.state !== "awaiting_choice" || !game.roundExpiresAt) return;
    const expiry = new Date(game.roundExpiresAt).getTime();
    const versionKey = `${game.date}:${game.runVersion}`;
    const tick = () => {
      const next = expiry - Date.now();
      setNowMs(Date.now());
      if (next <= 0 && timeoutSentFor.current !== versionKey) {
        timeoutSentFor.current = versionKey;
        applyAction(() => submitChoice({ league, puzzleDate: game.date, runVersion: game.runVersion, choice: "timeout" }));
      }
    };
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [applyAction, game.date, game.runVersion, game.roundExpiresAt, game.state, league, submitChoice]);

  const choose = (choice: HigherLowerChoice) => {
    applyAction(() => submitChoice({ league, puzzleDate: game.date, runVersion: game.runVersion, choice }));
  };

  const start = () => applyAction(() => startRun(league));
  const nextCard = () =>
    applyAction(() => advanceRound({ league, puzzleDate: game.date, runVersion: game.runVersion }));

  const label = leagueLabel(league);
  const isFinished = game.state === "lost" || game.state === "perfect";
  const resultMessage = game.state === "perfect"
    ? "Perfect run. Thirty correct answers."
    : game.state === "lost"
      ? game.completionReason === "timeout"
        ? "Time expired. Run over."
        : "Wrong answer. Run over."
      : game.state === "correct_reveal"
        ? "Correct. Challenger becomes your next reference card."
        : null;

  return (
    <main className="bg-hash mx-auto flex w-full max-w-[1500px] flex-1 flex-col gap-8 px-4 py-10 text-white sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <span className="label-dash">FPL Premium · {label} Daily</span>
          <h1 className="type-display mt-2 text-4xl sm:text-6xl">Higher or Lower</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-steel sm:text-base">
            Read the full card. Judge whether challenger&apos;s OVR is higher or lower. Thirty correct answers wins the perfect run.
          </p>
        </div>
        <LeagueToggle league={league} />
      </header>

      <section className="card-brand flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5" aria-label="Run status">
        <div className="flex items-center gap-4">
          <div>
            <span className="block text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-steel">Run score</span>
            <span data-testid="higher-lower-score" className="font-display text-3xl font-bold text-gold">{game.score}<span className="ml-1 text-base font-normal text-steel">/30</span></span>
          </div>
          <div className="h-10 w-px bg-line" aria-hidden="true" />
          <div>
            <span className="block text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-steel">Round</span>
            <span className="font-mono text-xl font-bold text-white">{game.round || "—"}<span className="ml-1 text-xs font-normal text-steel">/30</span></span>
          </div>
        </div>
        {game.state === "not_started" ? (
          <span className="text-sm text-steel">
            {game.canReplay ? "Owner preview · unlimited replays · server-timed" : "One run per day · server-timed"}
          </span>
        ) : (
          <span className="rounded-full border border-gold/50 bg-gold/10 px-4 py-2 text-sm font-semibold text-gold">
            {game.state === "perfect" ? "Perfect" : "Complete"}
          </span>
        )}
      </section>

      {error ? <p role="alert" className="rounded border border-coral/60 bg-coral/10 px-4 py-3 text-sm text-coral">{error}</p> : null}

      {game.state === "not_started" ? (
        <section className="card-brand flex flex-col items-center gap-5 p-8 text-center sm:p-12">
          <span className="label-dash">Today&apos;s card gauntlet</span>
          <h2 className="type-display text-3xl sm:text-5xl">How far can you read?</h2>
          <p className="max-w-xl text-sm leading-7 text-steel">
            Every round shows a complete reference card and a concealed challenger. The timer starts only when a round begins, and one miss ends your Daily run.
          </p>
          <button type="button" onClick={start} disabled={pending} className="btn-rivalry rounded-full px-7 py-3 text-sm uppercase tracking-wide">
            {pending ? "Starting…" : "Start Run →"}
          </button>
          <p className="text-xs text-steel">Frozen card pool · private sequence · 20 seconds per choice</p>
        </section>
      ) : (
        <>
          <section className="card-brand p-4 sm:p-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <span className="label-dash">Round {game.round}</span>
                <h2 className="type-display mt-1 text-2xl sm:text-3xl">
                  {game.state === "awaiting_choice" ? "Make your call" : "Reveal"}
                </h2>
              </div>
              {game.state === "awaiting_choice" ? <span className="text-xs uppercase tracking-[0.16em] text-steel">Choose before timer hits zero</span> : null}
            </div>
            <div className="mt-6 flex flex-col items-center gap-3 lg:flex-row lg:items-start">
              {game.referenceCard ? <CardStage label="Reference card" editionWeek={game.referenceCard.editionWeek}><PlayerCard3D card={game.referenceCard} interactive /></CardStage> : null}
              <div
                aria-label={game.state === "awaiting_choice" ? "Higher or Lower choice" : "Round result"}
                className="flex shrink-0 flex-col items-center justify-center gap-3 self-center lg:mt-52"
              >
                {game.state === "awaiting_choice" ? (
                  <div className={`rounded-2xl border-2 px-5 py-3 font-mono text-2xl font-bold shadow-[0_0_24px_rgb(0_0_0/0.2)] ${remaining <= 5000 ? "border-coral bg-coral/15 text-coral" : "border-mint/50 bg-mint/10 text-mint"}`} role="timer" aria-live="polite">
                    {formatTimer(remaining)}
                  </div>
                ) : null}
                <span className="rounded-full border border-gold/50 bg-gold/10 px-4 py-2 font-display text-sm font-bold uppercase tracking-[0.2em] text-gold">
                  {game.state === "awaiting_choice" ? "vs" : game.lastCorrect ? "correct" : "result"}
                </span>
                {game.state === "awaiting_choice" ? (
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => choose("higher")}
                      disabled={pending}
                      className="btn-rivalry flex min-w-36 items-center justify-center gap-2 rounded-full px-5 py-3 text-sm uppercase tracking-wide"
                    >
                      <span aria-hidden="true" className="text-xl leading-none">↑</span>
                      Higher
                    </button>
                    <button
                      type="button"
                      onClick={() => choose("lower")}
                      disabled={pending}
                      className="flex min-w-36 items-center justify-center gap-2 rounded-full border border-cyan/70 bg-cyan/10 px-5 py-3 font-display text-sm font-bold uppercase tracking-wide text-cyan transition hover:bg-cyan/20 disabled:opacity-40"
                    >
                      <span aria-hidden="true" className="text-xl leading-none">↓</span>
                      Lower
                    </button>
                  </div>
                ) : null}
              </div>
              {game.state === "awaiting_choice" && game.challenger ? (
                <CardStage label="Challenger" editionWeek={game.challenger.editionWeek}><ConcealedCard card={game.challenger} /></CardStage>
              ) : game.challengerCard ? (
                <CardStage label="Challenger revealed" editionWeek={game.challengerCard.editionWeek}><PlayerCard3D card={game.challengerCard} interactive /></CardStage>
              ) : null}
            </div>
          </section>

          {resultMessage ? (
            <section className={`card-brand flex flex-col items-center gap-4 p-5 text-center ${game.lastCorrect ? "border-mint/60" : "border-coral/60"}`} aria-live="polite">
              <p className={`font-display text-2xl font-bold ${game.lastCorrect ? "text-mint" : "text-coral"}`}>{resultMessage}</p>
              {game.challengerCard ? <p className="text-sm text-steel">{game.challengerCard.name}: <span className="font-mono font-bold text-white">{game.challengerCard.overall} OVR</span></p> : null}
              {game.state === "correct_reveal" ? (
                <button type="button" onClick={nextCard} disabled={pending} className="btn-coral rounded px-6 py-3 text-sm uppercase tracking-wide">
                  {pending ? "Loading…" : "Next Card →"}
                </button>
              ) : null}
              {isFinished ? (
                <div className="flex flex-wrap justify-center gap-3">
                  {game.canReplay ? (
                    <button type="button" onClick={start} disabled={pending} className="btn-rivalry rounded px-5 py-2.5 text-xs uppercase tracking-wide">
                      {pending ? "Starting…" : "Play Again →"}
                    </button>
                  ) : null}
                  <Link
                    href={league === "academy" ? "/premium?league=academy" : "/premium"}
                    className="rounded border border-line px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-steel transition hover:border-coral/60 hover:text-white"
                  >
                    Back to Premium HQ →
                  </Link>
                </div>
              ) : null}
              {isFinished ? (
                <p className="text-xs text-steel">
                  {game.canReplay ? "Owner preview: replay as much as you want." : "This Daily run cannot be restarted or replayed."}
                </p>
              ) : null}
            </section>
          ) : null}
        </>
      )}

      <Leaderboard game={game} />
    </main>
  );
}
