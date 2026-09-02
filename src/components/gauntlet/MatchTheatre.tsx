"use client";

// The match, watched.
//
// Everything here renders a tape the SERVER already resolved — this
// component never decides anything, it just paces the reveal. Pacing is
// the whole trick: Super Auto Pets is a joy to watch because each trigger
// fires visibly, one at a time, slow enough to follow. So the clock runs,
// the gold line draws underneath it, and each beat lands with the margin
// that decided it.
//
// Three readouts, borrowed from the games that solved this:
//   · the gold graph (League's post-game leads with it — the fastest
//     read of a thirty-minute game there is),
//   · a margin bar per contest (Football Manager's xG: separate the
//     process from the result),
//   · the Baron's health at the moment it resolved, which is the honest
//     answer to "how close was I".

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Contest } from "@/lib/gauntlet/contest";
import type { BaronDance, GoldSample, MatchEvent } from "@/lib/gauntlet/sim";

export interface TheatreTape {
  events: MatchEvent[];
  contests: Contest[];
  goldSeries: GoldSample[];
  baron?: BaronDance | null;
  /** Where the clock stops — 20 for a paused first half, 31 for a match. */
  endClock: number;
}

const TONE_DOT: Record<MatchEvent["tone"], string> = {
  win: "bg-mint shadow-[0_0_8px_#2ee6a8]",
  loss: "bg-coral shadow-[0_0_8px_#ff6b35]",
  neutral: "bg-muted",
};

const SPEEDS = [1, 2, 4] as const;
/** Real seconds one playthrough takes at 1×. */
const RUNTIME = 13;

function fmtClock(minutes: number): string {
  const whole = Math.floor(minutes);
  const seconds = Math.floor((minutes - whole) * 60);
  return `${String(whole).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

const fmtGold = (value: number): string =>
  `${value >= 0 ? "+" : "−"}${Math.abs(Math.round(value)).toLocaleString()}g`;

/** The gold line: your lead over the clock, drawn as it happens. */
function GoldGraph({ series, clock, endClock }: { series: GoldSample[]; clock: number; endClock: number }) {
  const { line, area, scale } = useMemo(() => {
    const peak = Math.max(1200, ...series.map((sample) => Math.abs(sample.diff)));
    const x = (min: number) => (min / Math.max(1, endClock)) * 600;
    const y = (gold: number) => 55 - Math.max(-48, Math.min(48, (gold / peak) * 48));
    const points = series.map((sample) => `${x(sample.clock).toFixed(1)} ${y(sample.diff).toFixed(1)}`);
    const path = points.length > 0 ? `M ${points.join(" L ")}` : "M 0 55";
    return { line: path, area: `${path} L 600 55 L 0 55 Z`, scale: peak };
  }, [series, endClock]);

  const shown = Math.min(clock, endClock);
  const width = (shown / Math.max(1, endClock)) * 600;
  const current = useMemo(() => {
    let value = 0;
    for (const sample of series) {
      if (sample.clock <= shown) value = sample.diff;
    }
    return value;
  }, [series, shown]);
  const peakY = 55 - Math.max(-48, Math.min(48, (current / scale) * 48));

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-[0.18em] text-muted">Gold difference</span>
        <span className={`font-mono text-sm font-bold ${current >= 0 ? "text-mint" : "text-coral"}`}>
          {fmtGold(current)} {current >= 0 ? "YOU" : "THEM"}
        </span>
      </div>
      <svg viewBox="0 0 600 110" preserveAspectRatio="none" className="h-[110px] w-full" aria-label="Gold difference over the match">
        <defs>
          <linearGradient id="gauntlet-gold-up" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2ee6a8" stopOpacity="0.36" />
            <stop offset="100%" stopColor="#2ee6a8" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="gauntlet-gold-down" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#ff6b35" stopOpacity="0.36" />
            <stop offset="100%" stopColor="#ff6b35" stopOpacity="0" />
          </linearGradient>
          <clipPath id="gauntlet-gold-reveal">
            <rect x="0" y="-6" width={width} height="122" />
          </clipPath>
          <clipPath id="gauntlet-gold-above"><rect x="0" y="-6" width="600" height="61" /></clipPath>
          <clipPath id="gauntlet-gold-below"><rect x="0" y="55" width="600" height="61" /></clipPath>
        </defs>
        <g clipPath="url(#gauntlet-gold-reveal)">
          <g clipPath="url(#gauntlet-gold-above)"><path d={area} fill="url(#gauntlet-gold-up)" /></g>
          <g clipPath="url(#gauntlet-gold-below)"><path d={area} fill="url(#gauntlet-gold-down)" /></g>
          <path d={line} fill="none" stroke="#eaf3fb" strokeWidth="2" strokeLinejoin="round" />
        </g>
        <line x1="0" y1="55" x2="600" y2="55" stroke="#1b4263" strokeWidth="1" />
        <circle cx={width} cy={peakY} r="4" fill="#f5b62e" opacity={shown > 0 ? 1 : 0} />
      </svg>
    </div>
  );
}

/** One beat: the line, the numbers, and how much it missed by. */
function Beat({ event, contest, live }: { event: MatchEvent; contest: Contest | null; live: boolean }) {
  const margin = contest ? contest.margin : null;
  const width = margin === null ? 0 : Math.min(48, Math.abs(margin) * 1.7);
  return (
    <div
      className="relative grid grid-cols-[46px_minmax(0,1fr)] gap-3 border-b border-border-subtle/40 py-2 pl-4 last:border-0"
      style={{
        opacity: live ? 1 : 0,
        transform: live ? "none" : "translateY(6px)",
        transition: "opacity .3s ease, transform .3s ease",
      }}
    >
      <span
        aria-hidden
        className={`absolute left-0 top-3 h-2 w-2 rounded-full ${TONE_DOT[event.tone]}`}
      />
      <span className="pt-0.5 font-mono text-[11px] text-muted">
        {event.clock === null ? "—" : `${event.clock}:00`}
      </span>
      <div className="min-w-0">
        <p
          className={`text-sm ${event.kind === "nexus" ? "type-display text-xl" : ""} ${
            event.kind === "nexus" ? (event.tone === "win" ? "text-mint" : "text-coral") : "text-white"
          }`}
        >
          {event.text}
          {typeof event.gold === "number" && event.gold !== 0 ? (
            <span className={`ml-2 font-mono text-[11px] ${event.gold > 0 ? "text-mint" : "text-coral"}`}>
              {fmtGold(event.gold)}
            </span>
          ) : null}
        </p>
        {event.detail ? <p className="mt-1 font-mono text-[10.5px] leading-4 text-muted">{event.detail}</p> : null}
        {margin !== null ? (
          <div className="mt-1.5 flex items-center gap-2.5">
            <span className="relative h-[7px] flex-1 overflow-hidden rounded-[1px] border border-border-subtle bg-white/5">
              <span className="absolute inset-y-0 left-1/2 w-px bg-muted/60" />
              <span
                className="absolute inset-y-0 rounded-[1px]"
                style={{
                  width: live ? `${width}%` : 0,
                  left: margin >= 0 ? "50%" : undefined,
                  right: margin < 0 ? "50%" : undefined,
                  background:
                    margin >= 0
                      ? "linear-gradient(90deg,#2ee6a8,rgba(46,230,168,.3))"
                      : "linear-gradient(270deg,#ff6b35,rgba(255,107,53,.3))",
                  transition: "width .5s cubic-bezier(.2,.8,.2,1)",
                }}
              />
            </span>
            <span className={`min-w-[74px] text-right font-mono text-[11px] ${margin >= 0 ? "text-mint" : "text-coral"}`}>
              {margin >= 0 ? "won" : "lost"} by {Math.abs(margin).toFixed(1)}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** The pit, live: health draining and the smite result when it lands. */
function BaronPanel({ baron, clock }: { baron: BaronDance | null | undefined; clock: number }) {
  if (!baron?.attempted) {
    return (
      <div className="rounded-lg border border-border-subtle/70 bg-black/20 p-3">
        <p className="text-[10px] uppercase tracking-[0.18em] text-muted">Baron pit</p>
        <p className="mt-2 text-xs text-muted">Not contested yet.</p>
      </div>
    );
  }
  const started = clock >= 20;
  const resolved = clock >= baron.clock;
  const progress = started ? Math.min(1, (clock - 20) / Math.max(0.5, baron.clock - 20)) : 0;
  const hp = resolved ? (baron.taken ? 0 : baron.hpAtResolve) : 100 - (100 - baron.hpAtResolve) * progress;

  return (
    <div
      className="rounded-lg border p-3"
      style={{
        borderColor: resolved && !baron.taken ? "rgba(255,107,53,.6)" : "rgba(176,107,255,.5)",
        background: "linear-gradient(180deg,rgba(176,107,255,.1),rgba(0,0,0,.28))",
      }}
    >
      <p className="text-[10px] uppercase tracking-[0.18em] text-purple">Baron pit</p>
      <div className="relative mt-2 h-4 overflow-hidden border border-purple/50 bg-black/50">
        <div
          className="absolute inset-y-0 left-0"
          style={{
            width: `${Math.max(0, hp)}%`,
            background: "linear-gradient(90deg,#b06bff,#ff3d84)",
            transition: "width .12s linear",
          }}
        />
        <span className="absolute inset-0 flex items-center justify-center font-mono text-[11px] font-bold text-white drop-shadow">
          {resolved && baron.taken ? "SLAIN" : resolved ? "STOLEN" : `${Math.max(0, Math.round(hp))}%`}
        </span>
      </div>
      <p className={`mt-2 font-mono text-[11px] leading-4 ${resolved && !baron.taken ? "text-coral" : "text-muted"}`}>
        {started ? (resolved ? baron.note : "Your team is on it…") : "Not contested yet."}
      </p>
    </div>
  );
}

export default function MatchTheatre({
  tape,
  title,
  autoPlay = true,
  onFinish,
}: {
  tape: TheatreTape;
  title: string;
  autoPlay?: boolean;
  onFinish?: () => void;
}) {
  const reduce =
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const [clock, setClock] = useState(reduce ? tape.endClock : 0);
  const [playing, setPlaying] = useState(autoPlay && !reduce);
  const [speed, setSpeed] = useState(0);
  const frame = useRef<number | null>(null);
  const last = useRef<number | null>(null);
  const finished = useRef(false);

  const byKey = useMemo(
    () => new Map(tape.contests.map((contest) => [contest.key, contest])),
    [tape.contests],
  );

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    onFinish?.();
  }, [onFinish]);

  useEffect(() => {
    if (!playing) {
      last.current = null;
      return;
    }
    const step = (now: number) => {
      if (last.current === null) last.current = now;
      const delta = (now - last.current) / 1000;
      last.current = now;
      setClock((current) => {
        const next = current + delta * (tape.endClock / RUNTIME) * SPEEDS[speed];
        if (next >= tape.endClock) {
          setPlaying(false);
          finish();
          return tape.endClock;
        }
        return next;
      });
      frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [playing, speed, tape.endClock, finish]);

  useEffect(() => {
    if (reduce) finish();
  }, [reduce, finish]);

  const done = clock >= tape.endClock;
  const shownEvents = tape.events.filter((event) => (event.clock ?? 0) <= clock);
  const settled = tape.contests.filter((contest) => contest.clock <= clock);
  const wonCount = settled.filter((contest) => contest.won).length;
  const closest = [...settled]
    .filter((contest) => !contest.won && contest.kind !== "lane")
    .sort((a, b) => Math.abs(a.margin) - Math.abs(b.margin))[0];

  return (
    <div className="overflow-hidden rounded-xl border border-border-subtle bg-[#06263f]">
      <div className="flex items-center justify-between gap-3 border-b border-border-subtle bg-black/25 px-4 py-2.5">
        <span className="label-dash">{title}</span>
        <span className="font-mono text-xl font-bold tabular-nums text-white">{fmtClock(Math.min(clock, tape.endClock))}</span>
      </div>

      <div className="border-b border-border-subtle px-4 py-3">
        <GoldGraph series={tape.goldSeries} clock={clock} endClock={tape.endClock} />
      </div>

      <div className="grid gap-0 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="border-b border-border-subtle px-4 py-2 lg:border-b-0 lg:border-r">
          {tape.events.map((event, index) => (
            <Beat
              key={`${event.clock}-${index}`}
              event={event}
              contest={event.contestKey ? byKey.get(event.contestKey) ?? null : null}
              live={shownEvents.includes(event)}
            />
          ))}
        </div>
        <div className="flex flex-col gap-3 px-4 py-3">
          <BaronPanel baron={tape.baron} clock={clock} />
          <div className="rounded-lg border border-border-subtle/70 bg-black/20 p-3">
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted">Contest ledger</p>
            <div className="mt-2 flex justify-between text-xs">
              <span className="text-muted">Checks won</span>
              <span className="font-mono tabular-nums text-white">
                {wonCount} / {settled.length}
              </span>
            </div>
            <div className="mt-1 flex justify-between text-xs">
              <span className="text-muted">Closest loss</span>
              <span className="font-mono tabular-nums text-coral">
                {closest ? `${Math.abs(closest.margin).toFixed(1)}` : "—"}
              </span>
            </div>
            {closest ? <p className="mt-1.5 text-[11px] leading-4 text-muted">{closest.label}</p> : null}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-border-subtle bg-black/25 px-4 py-2.5">
        <button
          type="button"
          onClick={() => {
            if (done) {
              finished.current = false;
              setClock(0);
            }
            setPlaying((value) => !value);
          }}
          className="btn-pill px-3.5 py-1.5 text-[11px]"
        >
          {playing ? "❚❚ Pause" : done ? "↺ Watch again" : "▶ Play"}
        </button>
        <button
          type="button"
          onClick={() => setSpeed((value) => (value + 1) % SPEEDS.length)}
          className="rounded-full border border-border-strong bg-surface px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted transition hover:border-action-text hover:text-action-text"
        >
          {SPEEDS[speed]}×
        </button>
        <button
          type="button"
          onClick={() => {
            setPlaying(false);
            setClock(tape.endClock);
            finish();
          }}
          className="rounded-full border border-border-strong bg-surface px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted transition hover:border-action-text hover:text-action-text"
        >
          Skip
        </button>
        <span className="ml-auto text-[11px] text-muted">Same seed, same tape — every replay.</span>
      </div>
    </div>
  );
}
