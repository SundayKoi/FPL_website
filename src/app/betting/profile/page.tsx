import type { Metadata } from "next";
import { getBettingUser } from "@/lib/betting/wallet";
import { fetchProfileStats, fetchRecentBets } from "@/lib/betting/queries";
import { fmtPoints } from "@/lib/betting/format";
import styles from "./ProfilePage.module.css";

export const metadata: Metadata = {
  title: "Betting profile — FPL",
};

function StatBox({ label, value, valueClass = "text-white" }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-surface p-4">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${valueClass}`}>{value}</div>
    </div>
  );
}

/** The signed-in viewer's own record — ported from
 * c:\fpl_gambling\web\src\pages\ProfilePage.tsx, reading
 * fetchProfileStats/fetchRecentBets (queries.ts's port of
 * c:\fpl_gambling\api\stats.py's player_stats()). The betting layout already
 * gates signed-out visitors before this page renders. */
export default async function ProfilePage() {
  const user = await getBettingUser();
  if (!user) return null; // layout gate renders the sign-in prompt instead

  const [stats, bets] = await Promise.all([fetchProfileStats(user.discordId), fetchRecentBets(user.discordId, 50)]);
  const open = bets.filter((b) => !b.settled);
  const settled = bets.filter((b) => b.settled);

  return (
    <div className={styles.profile}>
      <header className={styles.header}>
        <div>
          <span className="label-dash">Player Profile</span>
          <h1 className="type-display mt-2 text-4xl sm:text-5xl">{user.username}</h1>
          <p className="mt-2 text-sm text-muted">Account record and recent betting activity.</p>
        </div>
      </header>

      <div className={styles.stats}>
        <StatBox
          label="Record"
          value={`${stats.wins}W / ${stats.losses}L`}
        />
        <StatBox
          label="Net profit"
          value={(stats.profit < 0 ? "-" : "") + fmtPoints(Math.abs(stats.profit))}
          valueClass={stats.profit < 0 ? "text-red-400" : "text-mint"}
        />
        <StatBox label="Win streak" value={stats.current_streak > 0 ? `🔥 ${stats.current_streak}` : "—"} />
        <StatBox label="Best streak" value={stats.best_streak > 0 ? String(stats.best_streak) : "—"} />
        <StatBox label="Biggest win" value={fmtPoints(stats.biggest_win)} valueClass="text-mint" />
        <StatBox label="Perfect Pick'ems" value={stats.perfect_pickems > 0 ? `🎯 ${stats.perfect_pickems}` : "0"} />
        <StatBox label="Open in latest 50" value={String(open.length)} />
      </div>

      <div className={styles.listHeading}>
        <div>
          <h2 className="label-dash">Open Bets</h2>
          <p className="mt-1 text-xs text-muted">Open wagers in the most recent 50 bets.</p>
        </div>
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">Stake</span>
      </div>
      <div className="mt-3 rounded-lg border border-border-subtle bg-surface">
        {open.length === 0 ? (
          <p className="p-4 text-sm text-muted">None.</p>
        ) : (
          open.map((b) => (
            <div key={b.id} className={styles.betRow}>
              <span className="min-w-0 truncate text-muted">{b.market_title ?? `Market ${b.market_id}`}</span>
              <span className="font-semibold text-white">{fmtPoints(b.amount)}</span>
            </div>
          ))
        )}
      </div>

      <div className={styles.listHeading}>
        <div>
          <h2 className="label-dash">Recent Settled</h2>
          <p className="mt-1 text-xs text-muted">Net result from the most recent 50 bets; refunded stakes are identified separately.</p>
        </div>
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">Net outcome</span>
      </div>
      <div className="mt-3 rounded-lg border border-border-subtle bg-surface">
        {settled.length === 0 ? (
          <p className="p-4 text-sm text-muted">None yet.</p>
        ) : (
          settled.map((b) => {
            const won = (b.payout ?? 0) > (b.amount ?? 0);
            const refunded = b.payout === b.amount;
            return (
              <div key={b.id} className={styles.betRow}>
                <span className="min-w-0 truncate text-muted">{b.market_title ?? `Market ${b.market_id}`}</span>
                <span className={`font-semibold ${refunded ? "text-muted" : won ? "text-mint" : "text-red-400"}`}>
                  {refunded ? `${fmtPoints(b.amount)} stake refunded` : won ? `+${fmtPoints((b.payout ?? 0) - b.amount)} net` : `-${fmtPoints(b.amount)} net`}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
