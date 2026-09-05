import Link from "next/link";
import { teamSlug } from "@/lib/teams/teamPage";
import type { LeagueKey } from "@/lib/players/identity";
import type { MyTeamDashboardResult } from "@/lib/my-team/types";
import { MyTeamDashboard } from "./MyTeamDashboard";

const ACTION = "inline-flex rounded-full border border-action-text/60 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-action-text transition hover:bg-action-fill hover:text-white";

function gatePath(league: LeagueKey): string {
  return league === "academy" ? "/academy/my-team" : "/my-team";
}

function teamsPath(league: LeagueKey): string {
  return league === "academy" ? "/academy/teams" : "/teams";
}

function teamPath(league: LeagueKey, teamName: string): string {
  return `${teamsPath(league)}/${teamSlug(teamName)}`;
}

function GateCard({ children }: { children: React.ReactNode }) {
  return (
    <main className="page-backdrop flex-1">
      <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        <section className="card-brand p-6 sm:p-8">{children}</section>
      </div>
    </main>
  );
}

/**
 * Role-safe My Team surface. This module intentionally imports only read-only
 * team components. Captain result reporting and admin editors are composed by
 * the route after it checks the ready result's exact role flags.
 */
export default function MyTeamGate({
  dashboard,
  league,
}: {
  dashboard: MyTeamDashboardResult;
  league: LeagueKey;
}) {
  if (dashboard.kind === "signed-out") {
    const path = gatePath(league);
    return (
      <GateCard>
        <span className="label-dash">My Team</span>
        <h1 className="type-display mt-3 text-3xl sm:text-4xl">Sign in to see your team</h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          Your roster, schedule, tournament codes, draft viewing, and scouting live here after Discord sign-in.
        </p>
        <Link href={`/login?redirect=${path}`} className={`${ACTION} mt-5`}>Sign in</Link>
      </GateCard>
    );
  }

  if (dashboard.kind === "unlinked") {
    const label = league === "academy" ? "Browse Academy teams" : "Browse teams";
    return (
      <GateCard>
        <span className="label-dash">My Team · {dashboard.season}</span>
        <h1 className="type-display mt-3 text-3xl sm:text-4xl">Claim your roster spot</h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          Your signed-in account is not linked to a current player yet. Open your public team page and claim your exact roster spot.
        </p>
        {dashboard.availableTeams.length > 0 ? (
          <div className="mt-6">
            <p className="label-dash text-prestige">Choose your team</p>
            <ul aria-label={`${league === "academy" ? "Academy" : "Premier"} teams available to claim`} className="mt-3 grid gap-2 sm:grid-cols-2">
              {dashboard.availableTeams.map((team) => (
                <li key={team.id}>
                  <Link
                    href={teamPath(league, team.name)}
                    className="group flex items-center justify-between rounded border border-border-strong bg-canvas/60 px-3 py-3 text-sm font-semibold text-white transition hover:border-action-text/60 hover:text-action-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  >
                    <span>{team.name}</span>
                    <span aria-hidden className="text-lg text-action-text transition-transform group-hover:translate-x-1">→</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-5 text-sm text-muted">No active teams are available to claim right now.</p>
        )}
        <Link href={teamsPath(league)} className={`${ACTION} mt-5`}>{label}</Link>
      </GateCard>
    );
  }

  if (dashboard.kind === "pending") {
    return (
      <GateCard>
        <span className="label-dash">My Team · {dashboard.season}</span>
        <h1 className="type-display mt-3 text-3xl sm:text-4xl">Your claim is pending</h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          Your team captain or league admin can approve it. Private team data stays hidden until then.
        </p>
        <p className="mt-2 text-sm leading-6 text-muted">
          If you selected the wrong player, return to the team roster to withdraw your request.
        </p>
        <Link href={teamsPath(league)} className={`${ACTION} mt-5`}>Review or withdraw claim</Link>
      </GateCard>
    );
  }

  if (dashboard.kind === "unrostered") {
    return (
      <GateCard>
        <span className="label-dash">My Team · {dashboard.season}</span>
        <h1 className="type-display mt-3 text-3xl sm:text-4xl">No active team found</h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          {dashboard.playerPoolId
            ? "Your player identity is linked, but no active team is attached to it for this league season."
            : "No active league team is configured for this account."}
          {" "}Ask a league admin to check the current roster.
        </p>
        <Link href={teamsPath(league)} className={`${ACTION} mt-5`}>View league teams</Link>
      </GateCard>
    );
  }

  return <MyTeamDashboard dashboard={dashboard} league={league} />;
}
