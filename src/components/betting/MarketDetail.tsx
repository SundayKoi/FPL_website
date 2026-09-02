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
import { StatusPill } from "./StatusPill";
import { placeBet, cashoutBet } from "@/lib/betting/actions";
import { fmtPoints } from "@/lib/betting/format";
import { displayedShareA, americanOdds } from "@/lib/betting/parimutuel";
import { DRAW_TEAM, type BettingTeam, type MarketDetailData, type OpenBetRow } from "@/lib/betting/types";
import ConnectionBanner from "@/components/system/ConnectionBanner";

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
            className="rounded-lg border border-border bg-surface p-3 text-sm"
            style={{ "--team-color": team.color } as CSSProperties}
            data-testid="your-position"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wide text-muted">Your bet</span>
              <span className="font-semibold" style={{ color: team.color }}>
                {fmtPoints(stake)} on {team.short_code}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-mint">→ +{fmtPoints(profit)}</span>
              {!locked && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => held_bets.forEach((b) => onCashout(b.id))}
                  className="rounded border border-border px-2 py-1 text-xs text-muted hover:border-primary hover:text-primary disabled:opacity-40"
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
  const { market, connectionStatus, refetch } = useMarketDetail(initial.id, initial);
  const [balance, setBalance] = useState(initialBalance);
  const [openBets, setOpenBets] = useState(initialOpenBets);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const locked = useIsLocked(market.status, market.lock_at);
  const total = market.pool_a + market.pool_b + market.pool_draw;

  // Displayed odds-bar shares: a 3-way market shows the raw pool split (an
  // even third per side while empty); a 2-way market blends the admin's
  // opening line with the pools via displayedShareA.
  const shareA = market.draw_enabled
    ? total > 0
      ? market.pool_a / total
      : 1 / 3
    : displayedShareA(market.pool_a, market.pool_b, market.open_line_prob_a);
  const shareDraw = total > 0 ? market.pool_draw / total : 1 / 3;
  const shareB = market.draw_enabled ? (total > 0 ? market.pool_b / total : 1 / 3) : 1 - shareA;

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
    <div className="space-y-4">
      <ConnectionBanner status={connectionStatus} onRetry={() => void refetch()} />
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr] lg:items-start">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={`/betting/event/${market.event_id}`}
              className="text-xs uppercase tracking-wide text-muted hover:text-primary"
            >
              ← {market.event_name || "Event"}
            </Link>
            <StatusPill status={market.status} />
            <LockCountdown lockAt={market.lock_at} status={market.status} />
            <span className="text-xs text-muted">{new Date(market.game_at).toLocaleString()}</span>
          </div>
          <h1 className="type-display mt-2 text-3xl sm:text-4xl">
            <span style={{ color: market.team_a.color }}>{market.team_a.name}</span>{" "}
            <span className="text-muted">VS</span>{" "}
            <span style={{ color: market.team_b.color }}>{market.team_b.name}</span>
          </h1>

          <div className="mt-4">
            <OddsBar team={market.team_a} percent={shareA} volume={market.pool_a} odds={americanOdds(shareA)} />
            {market.draw_enabled && (
              <OddsBar team={DRAW_TEAM} percent={shareDraw} volume={market.pool_draw} odds={americanOdds(shareDraw)} />
            )}
            <OddsBar team={market.team_b} percent={shareB} volume={market.pool_b} odds={americanOdds(shareB)} />
          </div>

          <div className="mt-6">
            <h2 className="label-dash">Rules</h2>
            <div className="mt-2 rounded-lg border border-border bg-surface p-3 text-sm text-muted">
              {market.rules ?? "No rules provided."}
            </div>
          </div>

          <div className="mt-6">
            <h2 className="label-dash">Top Bets</h2>
            {market.top_bets.length === 0 ? (
              <p className="mt-2 text-sm text-muted">No bets yet — be the first.</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-1.5">
                {market.top_bets.map((b) => {
                  const team = b.is_draw ? DRAW_TEAM : b.team_id === market.team_a.id ? market.team_a : market.team_b;
                  return (
                    <li
                      key={`${b.discord_id}-${b.team_id ?? "draw"}`}
                      className="flex items-center justify-between rounded border border-border bg-surface px-3 py-1.5 text-sm"
                    >
                      <span className="truncate text-muted">{b.username}</span>
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
          <div className="mt-3 text-center text-xs text-muted">Total volume {fmtPoints(total)}</div>
        </div>
      </div>
    </div>
  );
}
