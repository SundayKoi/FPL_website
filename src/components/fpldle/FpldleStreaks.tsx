import type { FpldleStreakRow, FpldleStreakSnapshot } from "@/lib/fpldle/server";

function initials(username: string): string {
  return username.trim().slice(0, 2).toLocaleUpperCase() || "?";
}

function StreakAvatar({ row }: { row: FpldleStreakRow }) {
  return row.avatarUrl ? (
    // Avatars come from Discord and may be hosted outside next/image remotePatterns.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={row.avatarUrl} alt="" width={28} height={28} className="h-7 w-7 shrink-0 rounded-full object-cover" />
  ) : (
    <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-canvas text-[0.6rem] font-bold text-gold">
      {initials(row.username)}
    </span>
  );
}

export function PersonalStreakCard({ snapshot }: { snapshot: FpldleStreakSnapshot }) {
  const current = snapshot.personal?.currentStreak ?? 0;
  const best = snapshot.personal?.bestStreak ?? 0;
  return (
    <div role="region" aria-label="Your FPL&apos;dle streak" className="rounded border border-coral/40 bg-coral/5 px-3 py-2">
      <span className="block text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-muted">🔥 Your streak</span>
      <div className="mt-1 flex items-end gap-3">
        <span data-testid="fpldle-current-streak" className="font-mono text-xl font-bold text-white">{current}<span className="ml-1 text-xs font-normal text-muted">Current</span></span>
        <span data-testid="fpldle-best-streak" className="font-mono text-xl font-bold text-gold">{best}<span className="ml-1 text-xs font-normal text-muted">Best</span></span>
      </div>
    </div>
  );
}

export function StreakLeaderboard({ snapshot }: { snapshot: FpldleStreakSnapshot }) {
  const rows = snapshot.leaderboard.filter((row) => row.currentStreak > 0);
  return (
    <section aria-label="Top streaks" className="card-brand p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <span className="label-dash">Leaderboard</span>
          <h2 className="type-display mt-1 text-2xl">Top streaks</h2>
        </div>
        <span className="text-xs text-muted">Current first · best breaks ties</span>
      </div>
      {rows.length === 0 ? (
        <p className="mt-5 rounded border border-border-subtle/60 bg-canvas/30 px-4 py-5 text-center text-sm text-muted">No active streaks yet.</p>
      ) : (
        <div className="mt-4 overflow-hidden rounded border border-border-subtle">
          <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_5rem_5rem] gap-2 bg-canvas/60 px-3 py-2 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted">
            <span>Rank</span>
            <span>Player</span>
            <span className="text-right">Current</span>
            <span className="text-right">Best</span>
          </div>
          {rows.map((row, index) => (
            <div
              key={row.profileId}
              data-testid={row.isCurrentUser ? "fpldle-current-leaderboard-row" : undefined}
              className={`grid grid-cols-[2.5rem_minmax(0,1fr)_5rem_5rem] gap-2 border-t border-border-subtle/70 px-3 py-2.5 text-sm ${
                row.isCurrentUser ? "bg-coral/10 text-white" : "bg-surface/60 text-muted"
              } ${index > 0 && row.rank !== null && row.rank > 5 ? "border-t-2 border-t-gold/50" : ""}`}
            >
              <span className="font-mono text-gold">{row.rank ? `#${row.rank}` : "—"}</span>
              <span className="flex min-w-0 items-center gap-2">
                <StreakAvatar row={row} />
                <span className="min-w-0 truncate font-semibold">{row.username}{row.isCurrentUser ? <span className="ml-1 text-xs font-normal text-coral">(you)</span> : null}</span>
              </span>
              <span className="text-right font-mono font-bold text-white">{row.currentStreak}</span>
              <span className="text-right font-mono text-gold">{row.bestStreak}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
