"use client";

import { useEffect, useRef, useState } from "react";
import { DRAFT_TURN_SECONDS } from "@/lib/match-draft/rules";
import { signedSecondsRemaining } from "@/lib/match-draft/timing";
import type { DraftStep, MatchDraftState } from "@/lib/match-draft/types";

/** Signed seconds on the persisted current deadline, ticking once a second.
 *  Returns null until the clock should be shown. The server still decides
 *  whether a lock is valid; this hook is display-only. */
function useTurnCountdown(
  turnStartedAt: string | null,
  turnDeadlineAt: string | null,
  running: boolean,
  clockOffsetMs = 0,
): number | null {
  // Keep the server render and the first client render deterministic. Once
  // mounted, advance from performance.now() so wall-clock jumps and long
  // background suspensions cannot make the visible timer run backwards.
  const [now, setNow] = useState<number | null>(null);
  const clockRef = useRef<{ wall: number; mono: number } | null>(null);
  useEffect(() => {
    clockRef.current = { wall: Date.now() + clockOffsetMs, mono: typeof performance === "undefined" ? 0 : performance.now() };
    if (!running) return;
    const readNow = () => {
      if (!clockRef.current) return;
      const mono = typeof performance === "undefined" ? 0 : performance.now();
      setNow(clockRef.current.wall + (mono - clockRef.current.mono));
    };
    readNow();
    const timer = setInterval(readNow, 1000);
    return () => clearInterval(timer);
  }, [clockOffsetMs, running]);
  if (!running || now === null || (!turnDeadlineAt && !turnStartedAt)) return null;
  // Rows created before the overtime migration have a start but no deadline.
  // They get the old 30-second display until the row is touched/backfilled.
  const deadline = turnDeadlineAt ?? new Date(new Date(turnStartedAt!).getTime() + DRAFT_TURN_SECONDS * 1000).toISOString();
  return signedSecondsRemaining(deadline, now);
}

export function TurnTimer({
  state,
  currentStep,
  clockRunning,
  clockOffsetMs,
  compact = false,
}: {
  state: MatchDraftState;
  currentStep: DraftStep | undefined;
  clockRunning: boolean;
  clockOffsetMs: number;
  compact?: boolean;
}) {
  const secondsLeft = useTurnCountdown(state.turnStartedAt, state.turnDeadlineAt, clockRunning, clockOffsetMs);
  return (
    <div data-testid={compact ? "match-draft-compact-timer" : undefined} className={compact
      ? "flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded border border-border-subtle bg-surface px-3 py-2"
      : "flex min-w-32 flex-col items-center justify-center rounded border border-border-subtle bg-surface px-4 py-4 text-center"}>
      <span className="label-dash">Game {state.gameNumber}</span>
      <span className={`type-display ${compact ? "text-2xl" : "mt-1 text-4xl"} ${secondsLeft !== null && secondsLeft <= 5 ? "animate-pulse text-red-400" : "text-white"}`}>
        {state.status === "complete" ? "Done" : secondsLeft !== null ? `${secondsLeft}s` : "—"}
      </span>
      <span className={compact ? "text-right text-[10px] uppercase tracking-wide text-muted" : "mt-1 text-xs uppercase text-muted"}>
        {state.status === "complete"
          ? compact ? "Draft complete" : "draft complete"
          : clockRunning
            ? `${currentStep?.side} ${currentStep?.kind} ${currentStep?.slot}`
            : compact ? "Waiting for ready check" : "waiting for ready check"}
      </span>
    </div>
  );
}
