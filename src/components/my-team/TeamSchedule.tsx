import { formatKickoff, hasResult, stageMeta } from "@/lib/schedule/format";
import type { FixtureRow } from "@/lib/schedule/types";

function normalized(value: string | null): string {
  return value?.trim().toLowerCase() ?? "";
}

function opponentName(fixture: FixtureRow, teamName: string): string {
  return normalized(fixture.team_a) === normalized(teamName)
    ? fixture.team_b?.trim() || "TBD"
    : fixture.team_a?.trim() || "TBD";
}

function upcomingOrder(a: FixtureRow, b: FixtureRow): number {
  const aTime = a.scheduled_at ? new Date(a.scheduled_at).getTime() : Number.POSITIVE_INFINITY;
  const bTime = b.scheduled_at ? new Date(b.scheduled_at).getTime() : Number.POSITIVE_INFINITY;
  return aTime - bTime || a.sort_order - b.sort_order;
}

function recentOrder(a: FixtureRow, b: FixtureRow): number {
  const aTime = a.scheduled_at ? new Date(a.scheduled_at).getTime() : Number.NEGATIVE_INFINITY;
  const bTime = b.scheduled_at ? new Date(b.scheduled_at).getTime() : Number.NEGATIVE_INFINITY;
  return bTime - aTime || b.sort_order - a.sort_order;
}

function FixtureLine({ fixture, teamName }: { fixture: FixtureRow; teamName: string }) {
  const mineIsA = normalized(fixture.team_a) === normalized(teamName);
  const result = hasResult(fixture)
    ? (() => {
        const myScore = mineIsA ? fixture.score_a : fixture.score_b;
        const opponentScore = mineIsA ? fixture.score_b : fixture.score_a;
        const outcome = myScore === opponentScore ? "T" : myScore > opponentScore ? "W" : "L";
        return { myScore, opponentScore, outcome };
      })()
    : null;

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
      <span className="w-16 shrink-0 text-xs font-semibold uppercase tracking-wide text-steel">
        {stageMeta(fixture.stage).label}
      </span>
      <span className="min-w-0 flex-1 truncate font-semibold text-white">
        vs {opponentName(fixture, teamName)}
      </span>
      {result ? (
        <span className={`shrink-0 font-semibold ${result.outcome === "W" ? "text-mint" : "text-steel"}`}>
          {result.outcome} {result.myScore}–{result.opponentScore}
        </span>
      ) : (
        <span className="shrink-0 text-xs text-steel">Bo{fixture.best_of}</span>
      )}
      <span className="w-full pl-[4.75rem] text-xs text-steel sm:w-auto sm:pl-0">
        {formatKickoff(fixture.scheduled_at)}
      </span>
    </li>
  );
}

/** Read-only team fixture history for every approved member. */
export default function TeamSchedule({
  teamName,
  fixtures,
}: {
  teamName: string;
  fixtures: FixtureRow[];
}) {
  const upcoming = fixtures.filter((fixture) => !hasResult(fixture)).sort(upcomingOrder);
  const recent = fixtures.filter(hasResult).sort(recentOrder);

  return (
    <section aria-labelledby="team-schedule-heading" className="card-brand p-5">
      <h2 id="team-schedule-heading" className="label-dash">Team schedule</h2>
      {fixtures.length === 0 ? (
        <p className="mt-3 text-sm text-steel">No team fixtures are scheduled yet.</p>
      ) : (
        <div className="mt-3 grid gap-5 lg:grid-cols-2">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gold">Upcoming</h3>
            {upcoming.length > 0 ? (
              <ul className="mt-1 flex flex-col divide-y divide-line/60">
                {upcoming.map((fixture) => <FixtureLine key={fixture.id} fixture={fixture} teamName={teamName} />)}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-steel">No upcoming matches scheduled.</p>
            )}
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gold">Recent results</h3>
            {recent.length > 0 ? (
              <ul className="mt-1 flex flex-col divide-y divide-line/60">
                {recent.map((fixture) => <FixtureLine key={fixture.id} fixture={fixture} teamName={teamName} />)}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-steel">No results posted yet.</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
