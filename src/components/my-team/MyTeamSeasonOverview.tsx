import { deriveRecentSeries, deriveUpcomingFixtures } from "@/lib/my-team/presentation";
import { formatKickoff, stageMeta } from "@/lib/schedule/format";
import type { FixtureRow } from "@/lib/schedule/types";

function opponent(fixture: FixtureRow, teamName: string): string {
  const mine = teamName.trim().toLowerCase();
  const team = (fixture.team_a ?? "").trim().toLowerCase() === mine ? fixture.team_b : fixture.team_a;
  return team?.trim() || "TBD";
}

export function MyTeamSeasonOverview({ teamName, fixtures }: { teamName: string; fixtures: FixtureRow[] }) {
  const upcoming = deriveUpcomingFixtures(fixtures);
  const recent = deriveRecentSeries(fixtures, teamName, 3);

  return (
    <section aria-label="Season overview">
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card-brand p-5" aria-label="What comes next">
          <p className="label-dash text-prestige">Season path</p>
          <h2 className="mt-1 type-display text-2xl">What comes next</h2>
          {upcoming.length === 0 ? (
            <p className="mt-4 text-sm text-muted">No upcoming matches scheduled.</p>
          ) : (
            <ul className="mt-4 divide-y divide-border-subtle/60">
              {upcoming.map((fixture) => (
                <li key={fixture.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                  <span className="w-24 shrink-0 font-mono text-xs uppercase tracking-wide text-prestige">{stageMeta(fixture.stage).label}</span>
                  <span className="min-w-0 flex-1 font-semibold text-white">vs {opponent(fixture, teamName)}</span>
                  <span className="shrink-0 font-mono text-xs text-muted">{formatKickoff(fixture.scheduled_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card-brand p-5" aria-label="Recent form">
          <p className="label-dash text-prestige">Season path</p>
          <h2 className="mt-1 type-display text-2xl">Recent form</h2>
          {recent.length === 0 ? (
            <p className="mt-4 text-sm text-muted">No results posted yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-border-subtle/60">
              {recent.map((series) => (
                <li key={series.fixtureId} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                  <span className={`w-8 shrink-0 font-mono font-bold ${series.outcome === "W" ? "text-success" : series.outcome === "L" ? "text-pink" : "text-muted"}`}>{series.outcome}</span>
                  <span className="min-w-0 flex-1 font-semibold text-white">vs {series.opponent}</span>
                  <span className="font-mono tabular-nums text-white">{series.myScore}–{series.opponentScore}</span>
                  <span className="shrink-0 font-mono text-xs text-muted">{formatKickoff(series.scheduledAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </section>
  );
}
