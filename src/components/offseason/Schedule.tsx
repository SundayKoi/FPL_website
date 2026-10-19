// The public schedule: every match of a week with its sides and who faces
// whom lane by lane. Team A plays blue side and team B red; sides are drawn
// at random when the match is made (assignSides in lib/offseason/schedule).

import Link from "next/link";
import { ROLE_ORDER } from "@/lib/draft/types";
import { matchRounds } from "@/lib/offseason/schedule";
import { STAGE_LABELS, type MatchStage, type OffseasonMatch, type OffseasonWeek } from "@/lib/offseason/types";
import type { OffseasonView } from "@/lib/offseason/view";
import { Empty, RoleTag, SideTag } from "./ui";
import { matchScore } from "./WeekBoard";

/** Stages in the order a week plays them. */
const STAGE_ORDER: MatchStage[] = ["round_robin", "elimination", "semifinal", "final"];

function PlayerLink({ view, entrantId, captain }: { view: OffseasonView; entrantId: string | undefined; captain: boolean }) {
  if (!entrantId) return <span className="text-muted">—</span>;
  return (
    <Link href={`/offseason/players/${entrantId}`} className="truncate text-content hover:text-action-text">
      {view.entrantsById.get(entrantId)?.display_name ?? "Unknown"}
      {captain ? <span className="ml-1 text-xs text-prestige">(C)</span> : null}
    </Link>
  );
}

export function ScheduleMatch({ view, match }: { view: OffseasonView; match: OffseasonMatch }) {
  const blue = view.teamsById.get(match.team_a_id);
  const red = view.teamsById.get(match.team_b_id);
  const [blueWins, redWins] = matchScore(view, match);
  const played = blueWins + redWins > 0;
  const laneOf = (teamId: string | undefined) =>
    new Map((teamId ? view.membersByTeam.get(teamId) ?? [] : []).map((member) => [member.role, member.entrant_id]));
  const blueLanes = laneOf(blue?.id);
  const redLanes = laneOf(red?.id);
  const name = (teamId: string) => (
    <span className={match.winner_team_id === teamId ? "font-display font-bold text-white" : "font-display font-bold text-content"}>
      {view.teamsById.get(teamId)?.name ?? "TBD"}
    </span>
  );

  return (
    <li className="flex flex-col gap-3 rounded-md border border-border-subtle bg-canvas/60 p-3">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <SideTag side="blue" />
          {name(match.team_a_id)}
        </div>
        <div className="text-center">
          <p className="font-display text-lg font-bold tabular-nums text-white">{played ? `${blueWins} – ${redWins}` : "vs"}</p>
          <p className="text-[0.65rem] uppercase tracking-wide text-muted">
            Bo{match.best_of}
            {match.winner_team_id ? "" : " · to play"}
          </p>
        </div>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
          {name(match.team_b_id)}
          <SideTag side="red" />
        </div>
      </div>
      <ul className="flex flex-col gap-1 text-sm">
        {ROLE_ORDER.map((role) => (
          <li key={role} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <span className="min-w-0 truncate">
              <PlayerLink view={view} entrantId={blueLanes.get(role)} captain={blue?.captain_entrant_id === blueLanes.get(role)} />
            </span>
            <RoleTag role={role} />
            <span className="min-w-0 truncate text-right">
              <PlayerLink view={view} entrantId={redLanes.get(role)} captain={red?.captain_entrant_id === redLanes.get(role)} />
            </span>
          </li>
        ))}
      </ul>
    </li>
  );
}

function MatchGrid({ view, matches, label }: { view: OffseasonView; matches: OffseasonMatch[]; label?: string }) {
  return (
    <ul aria-label={label} className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {matches.map((match) => (
        <ScheduleMatch key={match.id} view={view} match={match} />
      ))}
    </ul>
  );
}

/** One week's matches, by stage. A stage played over several games shows
 *  each game's matches together: game 1, a gap, game 2, and so on. */
export function WeekSchedule({ view, week }: { view: OffseasonView; week: OffseasonWeek }) {
  const matches = view.matches.filter((match) => match.week_id === week.id);
  if (matches.length === 0) {
    return <Empty>{week.status === "setup" || week.status === "drafting" ? "Matchups appear once the week's draft finishes." : "No matches scheduled."}</Empty>;
  }
  return (
    <div className="flex flex-col gap-5">
      {STAGE_ORDER.filter((stage) => matches.some((match) => match.stage === stage)).map((stage) => {
        const rounds = matchRounds(matches.filter((match) => match.stage === stage));
        return (
          <section key={stage} className="flex flex-col gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wide text-muted">{STAGE_LABELS[stage]}</h3>
            {rounds.length > 1 ? (
              <div className="flex flex-col gap-6">
                {rounds.map((round, index) => (
                  <div key={round[0].id} className="flex flex-col gap-2">
                    <h4 className="font-display text-sm font-semibold text-white">Game {index + 1}</h4>
                    <MatchGrid view={view} matches={round} label={`${STAGE_LABELS[stage]} game ${index + 1}`} />
                  </div>
                ))}
              </div>
            ) : (
              <MatchGrid view={view} matches={rounds[0] ?? []} />
            )}
          </section>
        );
      })}
    </div>
  );
}
