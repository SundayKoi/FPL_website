import Link from "next/link";
import MyResults from "@/components/captain/MyResults";
import MyRoster from "@/components/captain/MyRoster";
import NextMatchCard from "@/components/captain/NextMatchCard";
import TourneyCodes from "@/components/captain/TourneyCodes";
import type { LeagueKey } from "@/lib/players/identity";
import type { MyTeamDashboardResult } from "@/lib/my-team/types";
import TeamSchedule from "./TeamSchedule";

const ACTION = "inline-flex rounded-full border border-coral/60 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-coral transition hover:bg-coral hover:text-navy";

function gatePath(league: LeagueKey): string {
  return league === "academy" ? "/academy/my-team" : "/my-team";
}

function teamsPath(league: LeagueKey): string {
  return league === "academy" ? "/academy/teams" : "/teams";
}

function GateCard({ children }: { children: React.ReactNode }) {
  return (
    <main className="bg-hash flex-1">
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
        <p className="mt-3 text-sm leading-6 text-steel">
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
        <p className="mt-3 text-sm leading-6 text-steel">
          Your signed-in account is not linked to a current player yet. Open your public team page and claim your exact roster spot.
        </p>
        <Link href={teamsPath(league)} className={`${ACTION} mt-5`}>{label}</Link>
      </GateCard>
    );
  }

  if (dashboard.kind === "pending") {
    return (
      <GateCard>
        <span className="label-dash">My Team · {dashboard.season}</span>
        <h1 className="type-display mt-3 text-3xl sm:text-4xl">Your claim is pending</h1>
        <p className="mt-3 text-sm leading-6 text-steel">
          Your team captain or league admin can approve it. Private team data stays hidden until then.
        </p>
        <p className="mt-2 text-sm leading-6 text-steel">
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
        <p className="mt-3 text-sm leading-6 text-steel">
          {dashboard.playerPoolId
            ? "Your player identity is linked, but no active team is attached to it for this league season."
            : "No active league team is configured for this account."}
          {" "}Ask a league admin to check the current roster.
        </p>
        <Link href={teamsPath(league)} className={`${ACTION} mt-5`}>View league teams</Link>
      </GateCard>
    );
  }

  const scoutingHref = league === "academy" ? "/academy/my-team/scouting" : "/my-team/scouting";
  const adminQuery = dashboard.isAdmin ? `?team=${encodeURIComponent(dashboard.team.id)}` : "";

  return (
    <main className="bg-hash flex-1">
      <div className="mx-auto w-full max-w-[1800px] px-4 py-12 sm:px-6 sm:py-16">
        <header className="border-b border-line pb-8">
          <span className="label-dash">My Team · {dashboard.season}</span>
          <h1 className="type-display mt-3 text-5xl sm:text-6xl">{dashboard.team.name}</h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-steel">
            Your next match, private tournament codes, team schedule, roster, and scouting.
          </p>
        </header>

        <div className="mt-8 flex flex-col gap-6">
          <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
            <NextMatchCard
              fixture={dashboard.nextFixture}
              myTeamName={dashboard.team.name}
              opponentMultiOpggUrl={dashboard.opponent?.multiOpggUrl ?? null}
              draftGames={dashboard.draftGames}
            />
            {dashboard.nextFixture && dashboard.opponent ? (
              <Link
                href={`${scoutingHref}${adminQuery}`}
                className="card-brand block p-5 transition hover:border-coral/60"
                aria-label={`Scout Opponent: ${dashboard.opponent.name}`}
              >
                <span className="label-dash text-gold">Premium · Scouting</span>
                <h2 className="type-display mt-2 text-2xl">Scout Opponent</h2>
                <p className="mt-2 text-sm text-steel">
                  Draft history and player pools for <span className="font-semibold text-white">{dashboard.opponent.name}</span>.
                </p>
              </Link>
            ) : null}
          </div>
          <TourneyCodes codes={dashboard.codes} />
          <TeamSchedule teamName={dashboard.team.name} fixtures={dashboard.schedule} />
          <MyRoster
            draftPlayers={dashboard.roster.draftPlayers}
            riotAccounts={dashboard.roster.riotAccounts}
            multiOpggUrl={dashboard.roster.multiOpggUrl}
            playerPoolId={dashboard.playerPoolId}
          />
          <MyResults
            teamName={dashboard.team.name}
            games={dashboard.results.games}
            players={dashboard.results.players}
          />
        </div>
      </div>
    </main>
  );
}
