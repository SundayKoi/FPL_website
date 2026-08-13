"use client";
import { useState, useTransition } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMarketDetail, fetchMyOpenBets } from "@/hooks/useMarketDetail";
import { useIsLocked } from "@/hooks/useIsLocked";
import { OddsBar } from "./OddsBar";
import { BetPanel } from "./BetPanel";
import { LockCountdown } from "./LockCountdown";
import { placeBet, cashoutBet } from "@/lib/betting/actions";
import { fmtPoints } from "@/lib/betting/format";
import { displayedShareA, americanOdds } from "@/lib/betting/parimutuel";
import { DRAW_TEAM, type BettingTeam, type MarketDetailData, type OpenBetRow } from "@/lib/betting/types";

const STATUS_STYLE: Record<string, string> = {
  OPEN: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
  LOCKED: "border-gold/40 bg-gold/10 text-gold",
  RESOLVED: "border-steel/40 bg-steel/10 text-steel",
  CANCELLED: "border-red-400/40 bg-red-400/10 text-red-300",
};

/** The viewer's open stake(s) on this market, with a projected win at
 * current pools and (while open) a cashout button per side held. */
function YourPosition({
  market,
  openBets,
  locked,
  busy,
  onCashout,
}: {
  market: MarketDetailData;
  openBets: OpenBetRow[];
  locked: boolean;
  busy: boolean;
  onCashout: (betId: number) => void;
}) {
  if (openBets.length === 0) return null;
  const total = market.pool_a + market.pool_b + market.pool_draw;

  const sides: { key: string; team: BettingTeam; pool: number; held: (b: OpenBetRow) => boolean }[] = [
    { key: "a", team: market.team_a, pool: market.pool_a, held: (b) => !b.is_draw && b.team_id === market.team_a.id },
    ...(market.draw_enabled
      ? [{ key: "draw", team: DRAW_TEAM, pool: market.pool_draw, held: (b: OpenBetRow) => b.is_draw }]
      : []),
    { key: "b", team: market.team_b, pool: market.pool_b, held: (b) => !b.is_draw && b.team_id === market.team_b.id },
  ];

  return (
    <div className="mb-4 flex flex-col gap-2">
      {sides.map(({ key, team, pool, held }) => {
        const held_bets = openBets.filter(held);
        if (held_bets.length === 0) return null;
        const stake = held_bets.reduce((s, b) => s + b.amount, 0);
        const opposing = total - pool;
        const profit = pool > 0 ? Math.floor((stake * opposing) / pool) : 0;
        return (
          <div
            key={key}
            className="rounded-lg border border-line bg-panel p-3 text-sm"
            style={{ "--team-color": team.color } as CSSProperties}
            data-testid="your-position"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wide text-steel">Your bet</span>
              <span className="font-semibold" style={{ color: team.color }}>
                {fmtPoints(stake)} on {team.short_code}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-emerald-400">→ +{fmtPoints(profit)}</span>
              {!locked && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => held_bets.forEach((b) => onCashout(b.id))}
                  className="rounded border border-line px-2 py-1 text-xs text-steel hover:border-gold hover:text-gold disabled:opacity-40"
                  title="Withdraw this bet (5% fee)"
                >
                  Cash out −5%
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function MarketDetail({
  market: initial,
  balance: initialBalance,
  loggedIn,
  openBets: initialOpenBets,
}: {
  market: MarketDetailData;
  balance: number;
  loggedIn: boolean;
  openBets: OpenBetRow[];
}) {
  const router = useRouter();
  const { market, refetch } = useMarketDetail(initial.id, initial);
  const [balance, setBalance] = useState(initialBalance);
  const [openBets, setOpenBets] = useState(initialOpenBets);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const locked = useIsLocked(market.status, market.lock_at);
  const total = market.pool_a + market.pool_b + market.pool_draw;

  function afterAction(result: { ok: true; balance: number } | { ok: false; error: string }) {
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setBalance(result.balance);
    void refetch();
    void fetchMyOpenBets(market.id).then(setOpenBets);
    router.refresh(); // syncs the layout's balance chip and the markets index
  }

  function handleBet(teamId: number, amount: number) {
    setError(null);
    startTransition(async () => {
      afterAction(await placeBet(market.id, teamId, amount));
    });
  }

  function handleCashout(betId: number) {
    setError(null);
    startTransition(async () => {
      afterAction(await cashoutBet(betId));
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[2fr_1fr] lg:items-start">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/betting" className="text-xs uppercase tracking-wide text-steel hover:text-gold">
            Events
          </Link>
          <span
            className={
              "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide " +
              (STATUS_STYLE[market.status] ?? STATUS_STYLE.RESOLVED)
            }
          >
            {market.status}
          </span>
          <LockCountdown lockAt={market.lock_at} status={market.status} />
          <span className="text-xs text-steel">{new Date(market.game_at).toLocaleString()}</span>
        </div>
        <h1 className="type-display mt-2 text-3xl sm:text-4xl">
          <span style={{ color: market.team_a.color }}>{market.team_a.name}</span>{" "}
          <span className="text-steel">VS</span> <span style={{ color: market.team_b.color }}>{market.team_b.name}</span>
        </h1>

        <div className="mt-4">
          {market.draw_enabled
            ? (() => {
                const sa = total > 0 ? market.pool_a / total : 1 / 3;
                const sb = total > 0 ? market.pool_b / total : 1 / 3;
                const sd = total > 0 ? market.pool_draw / total : 1 / 3;
                return (
                  <>
                    <OddsBar team={market.team_a} percent={sa} volume={market.pool_a} odds={americanOdds(sa)} />
                    <OddsBar team={DRAW_TEAM} percent={sd} volume={market.pool_draw} odds={americanOdds(sd)} />
                    <OddsBar team={market.team_b} percent={sb} volume={market.pool_b} odds={americanOdds(sb)} />
                  </>
                );
              })()
            : (() => {
                const pctA = displayedShareA(market.pool_a, market.pool_b, market.open_line_prob_a);
                return (
                  <>
                    <OddsBar team={market.team_a} percent={pctA} volume={market.pool_a} odds={americanOdds(pctA)} />
                    <OddsBar team={market.team_b} percent={1 - pctA} volume={market.pool_b} odds={americanOdds(1 - pctA)} />
                  </>
                );
              })()}
        </div>

        <div className="mt-6">
          <h2 className="label-dash">Rules</h2>
          <div className="mt-2 rounded-lg border border-line bg-panel p-3 text-sm text-steel">
            {market.rules ?? "No rules provided."}
          </div>
        </div>

        <div className="mt-6">
          <h2 className="label-dash">Top Bets</h2>
          {market.top_bets.length === 0 ? (
            <p className="mt-2 text-sm text-steel">No bets yet — be the first.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1.5">
              {market.top_bets.map((b) => {
                const team = b.is_draw ? DRAW_TEAM : b.team_id === market.team_a.id ? market.team_a : market.team_b;
                return (
                  <li
                    key={`${b.discord_id}-${b.team_id ?? "draw"}`}
                    className="flex items-center justify-between rounded border border-line bg-panel px-3 py-1.5 text-sm"
                  >
                    <span className="truncate text-steel">{b.username}</span>
                    <span className="font-semibold" style={{ color: team.color }}>
                      {fmtPoints(b.amount)} · {team.short_code}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <div>
        <YourPosition market={market} openBets={openBets} locked={locked} busy={pending} onCashout={handleCashout} />
        <BetPanel
          teamA={market.team_a}
          teamB={market.team_b}
          poolA={market.pool_a}
          poolB={market.pool_b}
          poolDraw={market.pool_draw}
          drawEnabled={market.draw_enabled}
          balance={balance}
          locked={locked || pending}
          loggedIn={loggedIn}
          error={error}
          onBet={handleBet}
        />
        <div className="mt-3 text-center text-xs text-steel">Total volume {fmtPoints(total)}</div>
      </div>
    </div>
  );
}
