import Link from "next/link";
import type { CSSProperties } from "react";
import type { BettingTeam, MarketCardData } from "@/lib/betting/types";
import { fmtPoints } from "@/lib/betting/format";
import { displayedShareA, americanOdds } from "@/lib/betting/parimutuel";

const STATUS_STYLE: Record<string, string> = {
  OPEN: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
  LOCKED: "border-gold/40 bg-gold/10 text-gold",
  RESOLVED: "border-steel/40 bg-steel/10 text-steel",
  CANCELLED: "border-red-400/40 bg-red-400/10 text-red-300",
};

function TeamRow({ team, pct, odds }: { team: BettingTeam; pct: number; odds: string }) {
  return (
    <div className="mt-1.5">
      <div className="flex items-center gap-2" style={{ "--team-color": team.color } as CSSProperties}>
        <span className="truncate text-sm text-white">{team.name}</span>
        <span className="font-mono text-xs text-steel">{odds}</span>
        <span className="ml-auto text-sm font-semibold" style={{ color: team.color }}>
          {pct}%
        </span>
      </div>
      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-navy">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: team.color }} />
      </div>
    </div>
  );
}

/** A market summary card for the betting index — links through to the market detail page. */
export function MarketCard({ market }: { market: MarketCardData }) {
  const total = market.pool_a + market.pool_b + market.pool_draw;
  const shareA = displayedShareA(market.pool_a, market.pool_b, market.open_line_prob_a);
  const pctA = Math.round(shareA * 100);
  const live = market.status === "OPEN";

  return (
    <Link
      href={`/betting/market/${market.id}`}
      className={
        "block rounded-lg border border-line bg-panel p-4 transition hover:border-gold" +
        (live ? " shadow-[0_0_0_1px_rgba(245,182,46,0.08)]" : "")
      }
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={
            "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide " +
            (STATUS_STYLE[market.status] ?? STATUS_STYLE.RESOLVED)
          }
        >
          {market.status}
        </span>
        <span className="font-mono text-xs text-steel">VOL {fmtPoints(total)}</span>
      </div>
      <TeamRow team={market.team_a} pct={pctA} odds={americanOdds(shareA)} />
      <TeamRow team={market.team_b} pct={100 - pctA} odds={americanOdds(1 - shareA)} />
      <div className="mt-3 flex items-center justify-between border-t border-line pt-2 text-xs text-steel">
        <span>
          {new Date(market.game_at).toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
        </span>
        <span className="flex gap-1">
          <span
            className="rounded border px-1.5 py-0.5"
            style={{ borderColor: market.team_a.color, color: market.team_a.color }}
          >
            {market.team_a.short_code}
          </span>
          <span
            className="rounded border px-1.5 py-0.5"
            style={{ borderColor: market.team_b.color, color: market.team_b.color }}
          >
            {market.team_b.short_code}
          </span>
        </span>
      </div>
    </Link>
  );
}
