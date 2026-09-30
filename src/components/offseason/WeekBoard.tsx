import Link from "next/link";
import { ROLE_ORDER } from "@/lib/draft/types";
import { standings } from "@/lib/offseason/standings";
import { STAGE_LABELS, type OffseasonMatch, type OffseasonTeam, type OffseasonWeek, type WeekStatus } from "@/lib/offseason/types";
import type { OffseasonView } from "@/lib/offseason/view";
import { Empty, Overall, RoleTag, tableClass, tdClass, thClass } from "./ui";

export const WEEK_STATUS_LABELS: Record<WeekStatus, string> = {
  setup: "Setting up",
  drafting: "Drafting",
  playing: "Playing",
  complete: "Complete",
};

function teamName(view: OffseasonView, id: string | null): string {
  return (id && view.teamsById.get(id)?.name) || "TBD";
}

export function TeamCard({ view, team }: { view: OffseasonView; team: OffseasonTeam }) {
  const members = [...(view.membersByTeam.get(team.id) ?? [])].sort(
    (a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role),
  );
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border-subtle bg-canvas/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="font-display text-base font-bold text-white">{team.name}</p>
        {team.eliminated ? (
          <span className="rounded bg-danger/15 px-1.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-danger">Out</span>
        ) : team.tier === "elimination" ? (
          <span className="rounded bg-prestige/15 px-1.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-prestige">Elimination</span>
        ) : null}
      </div>
      <ul className="flex flex-col gap-1.5">
        {members.map((member) => {
          const entrant = view.entrantsById.get(member.entrant_id);
          return (
            <li key={member.entrant_id} className="flex items-center gap-2 text-sm">
              <RoleTag role={member.role} />
              <Link href={`/offseason/players/${member.entrant_id}`} className="min-w-0 flex-1 truncate text-content hover:text-action-text">
                {entrant?.display_name ?? "Unknown"}
                {team.captain_entrant_id === member.entrant_id ? <span className="ml-1 text-xs text-prestige">(C)</span> : null}
              </Link>
              <Overall value={view.ratings.get(member.entrant_id)?.overall} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Games each side has won in a match. */
export function matchScore(view: OffseasonView, match: OffseasonMatch): [number, number] {
  const games = view.gamesByMatch.get(match.id) ?? [];
  return [
    games.filter((game) => game.winner_team_id === match.team_a_id).length,
    games.filter((game) => game.winner_team_id === match.team_b_id).length,
  ];
}

export function MatchRow({ view, match }: { view: OffseasonView; match: OffseasonMatch }) {
  const [a, b] = matchScore(view, match);
  const side = (id: string, score: number) => (
    <span className={match.winner_team_id === id ? "font-semibold text-white" : "text-muted"}>
      {teamName(view, id)} <span className="tabular-nums">{score}</span>
    </span>
  );
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle/60 py-2 text-sm last:border-b-0">
      <span className="flex flex-wrap items-center gap-2">
        {side(match.team_a_id, a)}
        <span className="text-xs text-muted">vs</span>
        {side(match.team_b_id, b)}
      </span>
      <span className="text-xs uppercase tracking-wide text-muted">
        {STAGE_LABELS[match.stage]} · Bo{match.best_of}
        {match.winner_team_id ? "" : " · to play"}
      </span>
    </li>
  );
}

export function StandingsTable({ view, teams, matches }: { view: OffseasonView; teams: OffseasonTeam[]; matches: OffseasonMatch[] }) {
  const games = view.games.filter((game) => matches.some((match) => match.id === game.match_id));
  const rows = standings(teams, matches, games);
  return (
    <div className="overflow-x-auto">
      <table className={tableClass}>
        <thead>
          <tr>
            <th className={thClass}>Team</th>
            <th className={`${thClass} text-right`}>W</th>
            <th className={`${thClass} text-right`}>L</th>
            <th className={`${thClass} text-right`}>Games</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.team.id}>
              <td className={tdClass}>{row.team.name}</td>
              <td className={`${tdClass} text-right tabular-nums`}>{row.wins}</td>
              <td className={`${tdClass} text-right tabular-nums`}>{row.losses}</td>
              <td className={`${tdClass} text-right tabular-nums text-muted`}>
                {row.gameWins}–{row.gameLosses}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** One week: its draft rooms, teams, schedule and results. */
export default function WeekBoard({ view, week }: { view: OffseasonView; week: OffseasonWeek }) {
  const teams = view.teams.filter((team) => team.week_id === week.id);
  const mainTeams = teams.filter((team) => team.tier === "main");
  const eliminationTeams = teams.filter((team) => team.tier === "elimination");
  const matches = view.matches.filter((match) => match.week_id === week.id);
  const roundRobin = matches.filter((match) => match.stage === "round_robin");
  const drafts = [
    { id: week.main_draft_id, label: "Main draft", imported: mainTeams.length > 0 },
    { id: week.elimination_draft_id, label: "Elimination draft", imported: eliminationTeams.length > 0 },
  ].filter((draft): draft is { id: string; label: string; imported: boolean } => Boolean(draft.id));

  return (
    <div className="flex flex-col gap-5">
      {drafts.some((draft) => !draft.imported) ? (
        <div className="flex flex-wrap gap-2">
          {drafts
            .filter((draft) => !draft.imported)
            .map((draft) => (
              <Link key={draft.id} href={`/draft/${draft.id}`} className="btn-pill text-sm">
                Watch the {draft.label.toLowerCase()} →
              </Link>
            ))}
        </div>
      ) : null}

      {teams.length === 0 ? (
        <Empty>{week.status === "setup" ? "Captains and pools are being set." : "Teams appear here once the draft finishes."}</Empty>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[...mainTeams, ...eliminationTeams].map((team) => (
            <TeamCard key={team.id} view={view} team={team} />
          ))}
        </div>
      )}

      {matches.length > 0 ? (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[2fr_1fr]">
          <div>
            <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">Schedule and results</h3>
            <ul>
              {matches.map((match) => (
                <MatchRow key={match.id} view={view} match={match} />
              ))}
            </ul>
          </div>
          {roundRobin.length > 0 ? (
            <div>
              <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">Round robin</h3>
              <StandingsTable view={view} teams={mainTeams} matches={roundRobin} />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
