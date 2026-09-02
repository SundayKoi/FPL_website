import { fmtPoints } from "@/lib/betting/format";
import { FANTASY_ROLES, type FantasyRole } from "@/lib/fantasy/config";
import type { LineupBreakdown } from "@/lib/fantasy/scoring";

/** Column-width abbreviations for the per-slot breakdown line. */
const SHORT_ROLE: Record<FantasyRole, string> = {
  Top: "Top",
  Jungle: "Jng",
  Mid: "Mid",
  Bot: "Bot",
  Support: "Sup",
};

export interface FantasyWeeklyRow {
  /** Null until the week has been scored — an entrant, not yet a placing. */
  rank: number | null;
  username: string;
  score: number | null;
  breakdown: LineupBreakdown | null;
  paidOut: number | null;
  totalOverall: number;
}

export interface FantasySeasonRow {
  rank: number;
  username: string;
  weeks: number;
  total: number;
}

function rankClass(rank: number | null): string {
  if (rank === 1) return "text-gold";
  if (rank === 2) return "text-muted";
  if (rank === 3) return "text-amber-600";
  return "text-muted/60";
}

/** "Top Rutledge 76.8 · Jng Bandit 60.2 · …" */
function BreakdownLine({ breakdown }: { breakdown: LineupBreakdown }) {
  const parts = FANTASY_ROLES.flatMap((role) => {
    const slot = breakdown[role];
    return slot ? [`${SHORT_ROLE[role]} ${slot.playerName} ${slot.points.toFixed(1)}`] : [];
  });
  if (parts.length === 0) return null;
  return <div className="mt-0.5 text-[11px] leading-4 text-muted/70">{parts.join(" · ")}</div>;
}

/**
 * The two fantasy standings, rendered server-side (no hooks, no state — the
 * numbers only change when the scoring job runs, so there is nothing here
 * worth shipping interactivity for).
 */
export default function FantasyLeaderboard({
  weekLabel,
  weekly,
  season,
}: {
  weekLabel: string;
  weekly: FantasyWeeklyRow[];
  season: FantasySeasonRow[];
}) {
  const anyScored = weekly.some((row) => row.score !== null);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <section className="card-brand p-5">
        <span className="label-dash">Week of {weekLabel}</span>
        <h2 className="type-display mt-1 text-2xl">Weekly standings</h2>
        {weekly.length === 0 ? (
          <p className="mt-4 text-sm text-muted">No lineups were fielded last week.</p>
        ) : (
          <>
            {!anyScored && (
              <p className="mt-2 text-xs text-muted">
                Last week hasn&apos;t been scored yet — entrants are listed in submission order.
              </p>
            )}
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[380px] text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-left text-xs uppercase tracking-wide text-muted">
                    <th className="py-2 pr-2">#</th>
                    <th className="py-2 pr-2">Manager</th>
                    <th className="py-2 pl-2 text-right">Points</th>
                  </tr>
                </thead>
                <tbody>
                  {weekly.map((row, index) => (
                    <tr
                      key={`${row.username}-${index}`}
                      className={`border-b border-border-subtle last:border-0 ${row.rank === 1 ? "row-rank-1" : ""}`}
                    >
                      <td className={`py-2 pr-2 align-top font-mono text-sm font-bold ${rankClass(row.rank)}`}>
                        {row.rank === null ? "—" : `#${row.rank}`}
                      </td>
                      <td className="py-2 pr-2">
                        <span className="text-white">{row.username}</span>
                        <span className="ml-2 font-mono text-[11px] text-muted/70">{row.totalOverall} OVR</span>
                        {row.paidOut !== null && row.paidOut > 0 && (
                          <span className="ml-2 text-[11px] font-semibold text-mint">+{fmtPoints(row.paidOut)}</span>
                        )}
                        {row.breakdown && <BreakdownLine breakdown={row.breakdown} />}
                      </td>
                      <td className="py-2 pl-2 text-right align-top font-mono font-semibold text-white">
                        {row.score === null ? "—" : row.score.toFixed(1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section className="card-brand p-5">
        <span className="label-dash">Season</span>
        <h2 className="type-display mt-1 text-2xl">Season totals</h2>
        {season.length === 0 ? (
          <p className="mt-4 text-sm text-muted">No weeks have been scored yet this season.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[320px] text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-left text-xs uppercase tracking-wide text-muted">
                  <th className="py-2 pr-2">#</th>
                  <th className="py-2 pr-2">Manager</th>
                  <th className="py-2 pl-2 text-right">Weeks</th>
                  <th className="py-2 pl-2 text-right">Points</th>
                </tr>
              </thead>
              <tbody>
                {season.map((row) => (
                  <tr
                    key={`${row.rank}-${row.username}`}
                    className={`border-b border-border-subtle last:border-0 ${row.rank === 1 ? "row-rank-1" : ""}`}
                  >
                    <td className={`py-2 pr-2 font-mono text-sm font-bold ${rankClass(row.rank)}`}>#{row.rank}</td>
                    <td className="py-2 pr-2 text-white">{row.username}</td>
                    <td className="py-2 pl-2 text-right font-mono text-muted">{row.weeks}</td>
                    <td className="py-2 pl-2 text-right font-mono font-semibold text-white">{row.total.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
