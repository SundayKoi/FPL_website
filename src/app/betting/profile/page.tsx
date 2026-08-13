import { getBettingUser } from "@/lib/betting/wallet";
import { fetchProfileStats, fetchRecentBets } from "@/lib/betting/queries";
import { fmtPoints } from "@/lib/betting/format";

function StatBox({ label, value, valueClass = "text-white" }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="rounded-lg border border-line bg-panel p-4">
      <div className="text-xs uppercase tracking-wide text-steel">{label}</div>
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
    <div>
      <span className="label-dash">Player Profile</span>
      <h1 className="type-display mt-2 text-4xl sm:text-5xl">{user.username}</h1>

      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <StatBox label="Balance" value={fmtPoints(user.balance)} valueClass="text-emerald-400" />
        <StatBox
          label="Record"
          value={`${stats.wins}W / ${stats.losses}L`}
        />
        <StatBox
          label="Net profit"
          value={(stats.profit < 0 ? "-" : "") + fmtPoints(Math.abs(stats.profit))}
          valueClass={stats.profit < 0 ? "text-red-400" : "text-emerald-400"}
        />
        <StatBox label="Win streak" value={stats.current_streak > 0 ? `🔥 ${stats.current_streak}` : "—"} />
        <StatBox label="Best streak" value={stats.best_streak > 0 ? String(stats.best_streak) : "—"} />
        <StatBox label="Biggest win" value={fmtPoints(stats.biggest_win)} valueClass="text-emerald-400" />
        <StatBox label="Perfect Pick'ems" value={stats.perfect_pickems > 0 ? `🎯 ${stats.perfect_pickems}` : "0"} />
        <StatBox label="Open bets" value={String(open.length)} />
      </div>

      <h2 className="label-dash mt-8">Open Bets</h2>
      <div className="mt-3 rounded-lg border border-line bg-panel">
        {open.length === 0 ? (
          <p className="p-4 text-sm text-steel">None.</p>
        ) : (
          open.map((b) => (
            <div key={b.id} className="flex items-center justify-between border-b border-line px-4 py-2.5 text-sm last:border-0">
              <span className="text-steel">{b.market_title ?? `Market ${b.market_id}`}</span>
              <span className="font-semibold text-white">{fmtPoints(b.amount)}</span>
            </div>
          ))
        )}
      </div>

      <h2 className="label-dash mt-8">Recent Settled</h2>
      <div className="mt-3 rounded-lg border border-line bg-panel">
        {settled.length === 0 ? (
          <p className="p-4 text-sm text-steel">None yet.</p>
        ) : (
          settled.map((b) => {
            const won = (b.payout ?? 0) > (b.amount ?? 0);
            const refunded = b.payout === b.amount;
            return (
              <div key={b.id} className="flex items-center justify-between border-b border-line px-4 py-2.5 text-sm last:border-0">
                <span className="text-steel">{b.market_title ?? `Market ${b.market_id}`}</span>
                <span className={`font-semibold ${refunded ? "text-steel" : won ? "text-emerald-400" : "text-red-400"}`}>
                  {refunded ? `${fmtPoints(b.amount)} refunded` : won ? `+${fmtPoints((b.payout ?? 0) - b.amount)}` : `-${fmtPoints(b.amount)}`}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
