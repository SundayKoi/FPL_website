"use client";
import { useState } from "react";
import type { CSSProperties } from "react";
import type { BettingTeam } from "@/lib/betting/types";
import { fmtPoints } from "@/lib/betting/format";
import { projectedProfit } from "@/lib/betting/parimutuel";

/** Sentinel "side" for a draw bet — matches the place_bet RPC's p_team=-1 convention. */
export const DRAW = -1;

interface Props {
  teamA: BettingTeam;
  teamB: BettingTeam;
  poolA: number;
  poolB: number;
  poolDraw: number;
  drawEnabled: boolean;
  balance: number;
  locked: boolean;
  loggedIn: boolean;
  error: string | null;
  onBet: (teamId: number, amount: number) => void;
}

const QUICK = [0.25, 0.5, 1] as const;

export function BetPanel({
  teamA,
  teamB,
  poolA,
  poolB,
  poolDraw,
  drawEnabled,
  balance,
  locked,
  loggedIn,
  error,
  onBet,
}: Props) {
  const [side, setSide] = useState<number>(teamA.id);
  const [amount, setAmount] = useState<number>(0);

  // pari-mutuel profit = stake × (everyone else's pool) / (your pool + stake)
  const yourPool = side === teamA.id ? poolA : side === teamB.id ? poolB : poolDraw;
  const opposingPool = poolA + poolB + poolDraw - yourPool;
  const profit = Math.floor(projectedProfit(amount, yourPool, opposingPool));

  const tooBig = amount > balance;
  const disabled = !loggedIn || locked || amount <= 0 || tooBig;

  return (
    <div className="rounded-lg border border-line bg-panel p-4">
      <div className="font-display text-sm font-bold not-italic uppercase tracking-wide text-white">
        Place Bet
      </div>
      <div className="mt-3 flex gap-2">
        {[teamA, teamB].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSide(t.id)}
            className={
              "flex-1 rounded border px-2 py-2 text-sm font-semibold transition " +
              (side === t.id ? "border-transparent text-navy" : "border-line text-steel hover:border-steel")
            }
            style={
              side === t.id
                ? ({ backgroundColor: t.color } as CSSProperties)
                : ({ "--team-color": t.color } as CSSProperties)
            }
          >
            {t.short_code}
          </button>
        ))}
        {drawEnabled && (
          <button
            type="button"
            onClick={() => setSide(DRAW)}
            className={
              "flex-1 rounded border px-2 py-2 text-sm font-semibold transition " +
              (side === DRAW ? "border-transparent bg-steel text-navy" : "border-line text-steel hover:border-steel")
            }
          >
            DRAW
          </button>
        )}
      </div>
      <label className="mt-4 block text-xs uppercase tracking-wide text-steel" htmlFor="bet-amount">
        Amount
      </label>
      <input
        id="bet-amount"
        className="mt-1 w-full rounded border border-line bg-navy p-2 text-white placeholder:text-steel/60 focus:border-gold focus:outline-none"
        type="number"
        min={0}
        max={balance}
        value={amount || ""}
        placeholder="0"
        onChange={(e) => setAmount(Math.max(0, Math.trunc(Number(e.target.value) || 0)))}
      />
      <input
        aria-label="stake slider"
        type="range"
        min={0}
        max={balance}
        value={Math.min(amount, balance)}
        onChange={(e) => setAmount(Math.trunc(Number(e.target.value)))}
        className="mt-3 w-full accent-gold"
      />
      <div className="mt-3 flex gap-2">
        {QUICK.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => setAmount(Math.trunc(balance * q))}
            className="flex-1 rounded border border-line py-1 text-xs text-steel hover:border-gold hover:text-gold"
          >
            {q === 1 ? "MAX" : `${q * 100}%`}
          </button>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between text-sm" data-testid="payout">
        <span className="text-steel">Win payout</span>
        <span className="font-display font-bold not-italic text-emerald-400">+{fmtPoints(profit)}</span>
      </div>
      {tooBig && <div className="mt-2 text-xs text-red-400">Over balance</div>}
      {error && <div className="mt-2 text-xs text-red-400">{error}</div>}
      <button
        type="button"
        className="mt-3 w-full rounded bg-gold py-3 text-sm font-bold text-navy hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        disabled={disabled}
        onClick={() => onBet(side, amount)}
      >
        BUY
      </button>
      {!loggedIn && <div className="mt-2 text-center text-xs text-steel">Log in to bet</div>}
    </div>
  );
}
