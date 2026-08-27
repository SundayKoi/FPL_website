"use client";
import { useState } from "react";
import type { LeaderboardRow } from "@/lib/betting/types";
import { fmtPoints } from "@/lib/betting/format";
import { PATRON_FLAMES, patronFlameOf } from "@/lib/patron/flames";

/** The patron flame as a table-sized dot — the same palette the card
 *  flame burns in, shrunk to ride beside a name. */
function FlameDot({ flame }: { flame: string }) {
  const style = PATRON_FLAMES[patronFlameOf(flame)];
  return (
    <span
      aria-label="League Patron"
      title={`League Patron — ${style.label} flame`}
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
      style={{ background: `radial-gradient(circle, ${style.hot} 0 35%, ${style.core} 75%)`, boxShadow: `0 0 6px ${style.core}` }}
    />
  );
}

type Mode = "balance" | "profit";

const MODES: { mode: Mode; label: string }[] = [
  { mode: "balance", label: "Richest" },
  { mode: "profit", label: "Top Profit" },
];

function rankClass(rank: number): string {
  if (rank === 1) return "text-gold";
  if (rank === 2) return "text-steel";
  if (rank === 3) return "text-amber-600";
  return "text-steel/60";
}

/** Balance/profit leaderboard, ported from
 * c:\fpl_gambling\web\src\pages\LeaderboardPage.tsx — the two rankings are
 * fetched server-side once (fetchLeaderboard("balance")/("profit")) and
 * switched between here, rather than round-tripping on every tab click. */
export function LeaderboardTable({
  byBalance,
  byProfit,
  meId,
}: {
  byBalance: LeaderboardRow[];
  byProfit: LeaderboardRow[];
  meId: string | null;
}) {
  const [mode, setMode] = useState<Mode>("balance");
  const rows = mode === "balance" ? byBalance : byProfit;

  return (
    <div>
      <div className="mt-6 flex gap-2">
        {MODES.map((m) => (
          <button
            key={m.mode}
            type="button"
            onClick={() => setMode(m.mode)}
            className={
              "rounded-full border px-4 py-1.5 text-sm font-semibold transition " +
              (mode === m.mode ? "border-transparent bg-coral text-navy" : "border-line text-steel hover:border-coral hover:text-coral")
            }
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border border-line bg-panel">
        <table className="w-full min-w-[420px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-steel">
              <th className="px-4 py-3">Rank</th>
              <th className="px-4 py-3">Player</th>
              <th className="px-4 py-3 text-right">{mode === "balance" ? "Balance" : "Net profit"}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const value = mode === "balance" ? r.balance : r.profit;
              const neg = value < 0;
              return (
                <tr
                  key={r.discord_id}
                  className={"border-b border-line last:border-0" + (r.discord_id === meId ? " bg-coral/5" : "")}
                >
                  <td className={`px-4 py-2.5 font-mono text-sm font-bold ${rankClass(r.rank)}`}>#{r.rank}</td>
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-2">
                      {r.avatar_url && (
                        // eslint-disable-next-line @next/next/no-img-element -- external Discord avatar
                        <img src={r.avatar_url} alt="" width={22} height={22} className="rounded-full" />
                      )}
                      <span className="truncate text-white">{r.username}</span>
                      {r.flame ? <FlameDot flame={r.flame} /> : null}
                      {r.badges.map((b) => (
                        <span key={b} className="text-xs" title="streak / perfect pick'ems">
                          {b}
                        </span>
                      ))}
                    </span>
                  </td>
                  <td className={`px-4 py-2.5 text-right font-semibold ${neg ? "text-red-400" : "text-mint"}`}>
                    {neg ? `-${fmtPoints(Math.abs(value))}` : fmtPoints(value)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <p className="p-6 text-center text-sm text-steel">No players yet.</p>}
      </div>
    </div>
  );
}
