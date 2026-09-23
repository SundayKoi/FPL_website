import type { MyReportRow } from "@/lib/captain/queries";
import type { LeagueTeam } from "@/lib/matches/types";
import { FixtureChips, ForfeitLine, StatusBadge } from "@/components/captain/reportStatus";

export function MyTeamReportsStatus({
  reports,
  teams,
  unavailable = false,
}: {
  reports: MyReportRow[];
  teams: LeagueTeam[];
  unavailable?: boolean;
}) {
  if (!unavailable && reports.length === 0) return null;
  const teamAbbr = (id: string | null) => teams.find((team) => team.id === id)?.abbreviation ?? "—";

  return (
    <section className="card-brand p-5" aria-labelledby="team-reports-heading">
      <span className="label-dash">Team reports</span>
      <h2 id="team-reports-heading" className="type-display mt-2 text-2xl">Match report status</h2>
      {unavailable ? <p role="alert" className="mt-3 text-sm text-red-300">Report status is temporarily unavailable.</p> : null}
      {reports.length === 0 && !unavailable ? <p className="mt-3 text-sm text-muted">No match reports have been submitted for this season.</p> : null}
      <ul className="mt-3 flex flex-col gap-3">
        {reports.map((report) => (
          <li key={report.id} className="rounded border border-border-subtle/60 bg-canvas/60 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-white">
                {teamAbbr(report.team_a_id)} {report.score_a}–{report.score_b} {teamAbbr(report.team_b_id)}
              </span>
              <StatusBadge status={report.status} />
              <FixtureChips fixtureId={report.fixture_id} status={report.status} />
              <span className="text-xs text-muted">{report.season_phase} · {report.season}</span>
            </div>
            <ForfeitLine team={report.forfeit_team_id ? teamAbbr(report.forfeit_team_id) : null} note={report.forfeit_note} />
            {report.error_text ? <p className="mt-1 text-xs text-red-400">{report.error_text}</p> : null}
            {report.warning_text ? <p className="mt-1 text-xs text-amber-300">{report.warning_text}</p> : null}
            {report.games.length ? (
              <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                {report.games.map((game) => <li key={game.id}>Game {game.game_number}: <StatusBadge status={game.status} /></li>)}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
