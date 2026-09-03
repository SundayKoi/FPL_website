"use client";

// The Pusher, as a toy. Everything here is local and pretend: a top-down
// shelf, a bar that sweeps back and forth, discs that get shoved off the
// lip. It exists so the feel can be judged before a real one is built —
// the real machine would settle every drop on the server and only animate
// here. Nothing on this page reads or writes anything.

import { useCallback, useEffect, useRef, useState } from "react";
import { fmtPoints } from "@/lib/betting/format";
import { COIN_VALUE, DROP_COST, PRIZES, type PrizeKind } from "@/lib/pusher/config";
import { COIN_R, COLORS, D, draw, GUTTER, PUSH_MAX, PUSH_MIN, PUSH_SPEED, seedShelf, step, W, type Disc } from "@/lib/pusher/sim";

interface Tally {
  dropped: number;
  spent: number;
  won: number;
  lost: number;
  prizes: Record<PrizeKind, number>;
}


const EMPTY_TALLY: Tally = { dropped: 0, spent: 0, won: 0, lost: 0, prizes: { dust: 0, token: 0, card: 0 } };

export default function PusherMockup() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const discsRef = useRef<Disc[]>([]);
  const idRef = useRef(1000);
  const phaseRef = useRef(0);
  const aimRef = useRef<number | null>(null);
  const [tally, setTally] = useState<Tally>(EMPTY_TALLY);
  const [aim, setAim] = useState<number>(W / 2);
  const [auto, setAuto] = useState(false);
  const [running, setRunning] = useState(true);
  const [shelf, setShelf] = useState(0);

  const reset = useCallback(() => {
    discsRef.current = seedShelf(Math.random);
    setShelf(discsRef.current.length);
    setTally(EMPTY_TALLY);
  }, []);

  const drop = useCallback((x: number) => {
    // A dropped coin lands just in front of the bar, a little off the aim,
    // the way a real one bounces down the chute.
    const edge = PUSH_MIN + (Math.sin(phaseRef.current) + 1) * 0.5 * (PUSH_MAX - PUSH_MIN);
    const clampedX = Math.max(COIN_R, Math.min(W - COIN_R, x + (Math.random() - 0.5) * 22));
    discsRef.current.push({ id: (idRef.current += 1), kind: "coin", x: clampedX, y: edge + COIN_R + 6 + Math.random() * 14, vx: 0, vy: 0.5, r: COIN_R });
    setShelf(discsRef.current.length);
    setTally((current) => ({ ...current, dropped: current.dropped + 1, spent: current.spent + DROP_COST }));
  }, []);

  useEffect(() => {
    aimRef.current = aim;
  }, [aim]);

  // The loop. Runs while visible; every frame the bar moves, the pile
  // settles, and whatever fell is tallied.
  useEffect(() => {
    if (!running) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;
    // The shelf is seeded here, on the first frame, so no state is set
    // from an effect body.
    if (discsRef.current.length === 0) {
      discsRef.current = seedShelf(Math.random);
      setShelf(discsRef.current.length);
    }
    let frame = 0;
    let lastEdge = PUSH_MIN;
    let autoTick = 0;
    const loop = () => {
      phaseRef.current += 0.02 * PUSH_SPEED;
      const edge = PUSH_MIN + (Math.sin(phaseRef.current) + 1) * 0.5 * (PUSH_MAX - PUSH_MIN);
      const { paid, lost } = step(discsRef.current, edge, Math.max(0, edge - lastEdge));
      lastEdge = edge;
      if (paid.length || lost.length) {
        setShelf(discsRef.current.length);
        setTally((current) => {
          const next = { ...current, prizes: { ...current.prizes } };
          for (const disc of paid) {
            if (disc.kind === "coin") next.won += COIN_VALUE;
            else {
              next.won += PRIZES[disc.kind].value;
              next.prizes[disc.kind] += 1;
            }
          }
          for (const disc of lost) next.lost += disc.kind === "coin" ? COIN_VALUE : PRIZES[disc.kind].value;
          return next;
        });
      }
      if (auto && (autoTick += 1) % 40 === 0) drop(aimRef.current ?? W / 2);
      draw(ctx, discsRef.current, edge, aimRef.current);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [running, auto, drop]);

  const onCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * W;
    setAim(x);
    drop(x);
  };

  const net = tally.won - tally.spent;

  return (
    <div className="grid gap-6 lg:grid-cols-[auto_1fr]">
      <div className="flex flex-col items-center gap-3">
        <canvas
          ref={canvasRef}
          width={W}
          height={D}
          onClick={onCanvasClick}
          role="img"
          aria-label="The pusher shelf. Click to drop a coin where you point."
          className="w-full max-w-[340px] cursor-crosshair rounded-xl border border-line"
          style={{ aspectRatio: `${W} / ${D}` }}
        />
        <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
          <button type="button" onClick={() => { setAim(GUTTER + 40); drop(GUTTER + 40); }} className="btn-pill px-3 py-1">
            Drop left
          </button>
          <button type="button" onClick={() => { setAim(W / 2); drop(W / 2); }} className="btn-pill px-3 py-1">
            Drop centre
          </button>
          <button type="button" onClick={() => { setAim(W - GUTTER - 40); drop(W - GUTTER - 40); }} className="btn-pill px-3 py-1">
            Drop right
          </button>
          <label className="flex items-center gap-1 text-steel">
            <input type="checkbox" checked={auto} onChange={(event) => setAuto(event.target.checked)} /> auto-drop
          </label>
          <button type="button" onClick={() => setRunning((value) => !value)} className="text-steel underline-offset-4 hover:text-coral hover:underline">
            {running ? "Pause" : "Run"}
          </button>
          <button type="button" onClick={reset} className="text-steel underline-offset-4 hover:text-coral hover:underline">
            Reset shelf
          </button>
        </div>
        <p className="text-xs text-steel">Click anywhere on the shelf to drop a coin there. Each drop costs {fmtPoints(DROP_COST)} of pretend money.</p>
      </div>

      <div className="flex flex-col gap-4">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Dropped", `${tally.dropped}`],
            ["Spent", fmtPoints(tally.spent)],
            ["Won", fmtPoints(tally.won)],
            ["Net", `${net >= 0 ? "+" : ""}${fmtPoints(net)}`],
          ].map(([label, value]) => (
            <div key={label} className="card-brand flex flex-col p-3">
              <dt className="text-[10px] uppercase tracking-wider text-steel">{label}</dt>
              <dd className={`type-display text-xl ${label === "Net" ? (net >= 0 ? "text-mint" : "text-coral") : "text-white"}`}>{value}</dd>
            </div>
          ))}
        </dl>
        <div className="card-brand flex flex-col gap-2 p-4 text-sm text-steel">
          <span className="label-dash">On the shelf</span>
          <p>
            {shelf} pieces. Down the sides so far: {fmtPoints(tally.lost)} — that is the house edge, and you can watch it happen.
          </p>
          <ul className="flex flex-wrap gap-3 text-xs">
            {(Object.keys(PRIZES) as PrizeKind[]).map((kind) => (
              <li key={kind} className="flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded-full" style={{ background: COLORS[kind] }} />
                {PRIZES[kind].label} · worth {fmtPoints(PRIZES[kind].value)} · won {tally.prizes[kind]}
              </li>
            ))}
            <li className="flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded-full" style={{ background: COLORS.coin }} />
              Coin · {fmtPoints(COIN_VALUE)}
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
