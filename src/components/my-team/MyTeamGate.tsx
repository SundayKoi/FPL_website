import Link from "next/link";
import MyResults from "@/components/captain/MyResults";
import MyRoster from "@/components/captain/MyRoster";
import NextMatchCard from "@/components/captain/NextMatchCard";
import TourneyCodes from "@/components/captain/TourneyCodes";
import { teamSlug } from "@/lib/teams/teamPage";
import type { LeagueKey } from "@/lib/players/identity";
import type { MyTeamDashboardResult } from "@/lib/my-team/types";
import TeamAccentPanel, { teamAccentFadeStyle } from "./TeamAccentPanel";
import TeamSchedule from "./TeamSchedule";

const ACTION = "inline-flex rounded-full border border-primary/60 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-primary transition hover:bg-primary hover:text-white";

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
                    className="group flex items-center justify-between rounded border border-border bg-canvas/60 px-3 py-3 text-sm font-semibold text-white transition hover:border-primary/60 hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  >
                    <span>{team.name}</span>
                    <span aria-hidden className="text-lg text-primary transition-transform group-hover:translate-x-1">→</span>
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

  const scoutingHref = league === "academy" ? "/academy/my-team/scouting" : "/my-team/scouting";
  const adminQuery = dashboard.isAdmin ? `?team=${encodeURIComponent(dashboard.team.id)}` : "";
  const teamBrand = dashboard.team;

  return (
    <main className="bg-hash flex-1">
      <div className="mx-auto w-full max-w-[1800px] px-4 py-12 sm:px-6 sm:py-16">
        <header
          className="card-brand flex flex-wrap items-center gap-5 overflow-hidden border-t-4 p-6 sm:p-8"
          style={{ borderTopColor: teamBrand.bannerColor }}
        >
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded border border-white/25 bg-canvas/60 p-2 shadow-lg">
            {teamBrand.imageUrl ? (
              // Deployment-specific Supabase Storage hosts make next/image remotePatterns brittle here.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={teamBrand.imageUrl}
                alt={`${teamBrand.name} logo`}
                className="h-full w-full rounded object-contain"
              />
            ) : (
              <span className="type-display text-3xl text-white/90" aria-hidden="true">
                {teamBrand.abbreviation}
              </span>
            )}
          </div>
          <div className="min-w-0">
            <span className="label-dash">My Team · {dashboard.season}</span>
            <h1 className="type-display mt-2 text-5xl sm:text-6xl">{teamBrand.name}</h1>
          </div>
          <p className="basis-full max-w-2xl text-lg leading-8 text-muted">
            Your next match, private tournament codes, team schedule, roster, and scouting.
          </p>
        </header>
        <div
          aria-hidden="true"
          className="mt-5 h-1.5 rounded-full"
          style={teamAccentFadeStyle(teamBrand.bannerColor)}
        />

        <div className="mt-8 flex flex-col gap-6">
          <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
            <TeamAccentPanel color={teamBrand.bannerColor}>
              <NextMatchCard
                fixture={dashboard.nextFixture}
                myTeamName={dashboard.team.name}
                opponentMultiOpggUrl={dashboard.opponent?.multiOpggUrl ?? null}
                draftGames={dashboard.draftGames}
              />
            </TeamAccentPanel>
            {dashboard.nextFixture && dashboard.opponent ? (
              <TeamAccentPanel color={teamBrand.bannerColor}>
                <Link
                  href={`${scoutingHref}${adminQuery}`}
                  className="card-brand group block p-5 transition hover:border-primary/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  aria-label={`Scout Opponent: ${dashboard.opponent.name}`}
                >
                  <span className="label-dash text-prestige">Premium · Scouting</span>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <h2 className="type-display text-2xl">Scout Opponent</h2>
                    <span aria-hidden className="text-2xl text-primary transition-transform group-hover:translate-x-1">→</span>
                  </div>
                  <p className="mt-2 text-sm text-muted">
                    Draft history and player pools for <span className="font-semibold text-white">{dashboard.opponent.name}</span>.
                  </p>
                </Link>
              </TeamAccentPanel>
            ) : null}
          </div>
          <TeamAccentPanel color={teamBrand.bannerColor}>
            <TourneyCodes codes={dashboard.codes} />
          </TeamAccentPanel>
          <TeamAccentPanel color={teamBrand.bannerColor}>
            <TeamSchedule teamName={dashboard.team.name} fixtures={dashboard.schedule} />
          </TeamAccentPanel>
          <TeamAccentPanel color={teamBrand.bannerColor}>
            <MyRoster
              draftPlayers={dashboard.roster.draftPlayers}
              riotAccounts={dashboard.roster.riotAccounts}
              multiOpggUrl={dashboard.roster.multiOpggUrl}
              playerPoolId={dashboard.playerPoolId}
            />
          </TeamAccentPanel>
          <TeamAccentPanel color={teamBrand.bannerColor}>
            <MyResults
              teamName={dashboard.team.name}
              games={dashboard.results.games}
              players={dashboard.results.players}
            />
          </TeamAccentPanel>
        </div>
      </div>
    </main>
  );
}
