import { buildLineupSlots, deriveSeriesRecord } from "@/lib/my-team/presentation";
import type { LeagueKey } from "@/lib/players/identity";
import type { MyTeamReadyDashboard } from "@/lib/my-team/types";
import { MyTeamHeader } from "./MyTeamHeader";
import { MyTeamMatchHero } from "./MyTeamMatchHero";
import { MatchLineupComparison } from "./MatchLineupComparison";
import { MyTeamPerformance } from "./MyTeamPerformance";
import { MyTeamSeasonOverview } from "./MyTeamSeasonOverview";
import { OpponentTeamStatsCard } from "./OpponentTeamStatsCard";
import TeamAccentPanel from "./TeamAccentPanel";
import { TournamentCodeGrid } from "./TournamentCodeGrid";

function scoutingPath(league: LeagueKey, teamId: string, isAdmin: boolean): string {
  const path = league === "academy" ? "/academy/my-team/scouting" : "/my-team/scouting";
  return isAdmin ? `${path}?team=${encodeURIComponent(teamId)}` : path;
}

export function MyTeamDashboard({ dashboard, league }: { dashboard: MyTeamReadyDashboard; league: LeagueKey }) {
  const record = deriveSeriesRecord(dashboard.schedule, dashboard.team.name);
  const lineupSlots = buildLineupSlots({
    mine: dashboard.roster.draftPlayers,
    opponent: dashboard.opponent?.roster?.draftPlayers ?? null,
    playerPoolId: dashboard.playerPoolId,
  });
  const opponentName = dashboard.opponent?.name ?? "No upcoming opponent";
  const opponentUnavailable = !dashboard.opponent || dashboard.opponent.scoutingUnavailable;
  const draftScoutingHref = scoutingPath(league, dashboard.team.id, dashboard.isAdmin);

  return (
    <main className="page-backdrop flex-1">
      <div className="mx-auto w-full max-w-[1800px] px-4 py-10 sm:px-6 sm:py-14">
        <MyTeamHeader team={dashboard.team} season={dashboard.season} record={record} />

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.3fr_0.7fr] lg:items-start">
          <div className="flex min-w-0 flex-col gap-6">
            <TeamAccentPanel color={dashboard.team.bannerColor}>
              <MyTeamMatchHero fixture={dashboard.nextFixture} myTeamName={dashboard.team.name} canOpenCaptainDraft={dashboard.isCaptain || dashboard.isAdmin} />
            </TeamAccentPanel>
            <TeamAccentPanel color={dashboard.team.bannerColor}>
              <TournamentCodeGrid fixture={dashboard.nextFixture} codes={dashboard.codes} />
            </TeamAccentPanel>
          </div>
          {dashboard.opponent ? (
            <TeamAccentPanel color={dashboard.team.bannerColor}>
              <OpponentTeamStatsCard opponent={dashboard.opponent} draftScoutingHref={draftScoutingHref} />
            </TeamAccentPanel>
          ) : null}
        </div>

        <div className="mt-6 flex flex-col gap-6">
          <TeamAccentPanel color={dashboard.team.bannerColor}>
            <MatchLineupComparison
              myTeamName={dashboard.team.name}
              opponentName={opponentName}
              slots={lineupSlots}
              myMultiOpggUrl={dashboard.roster.multiOpggUrl}
              opponentMultiOpggUrl={dashboard.opponent?.multiOpggUrl ?? null}
              opponentUnavailable={opponentUnavailable}
            />
          </TeamAccentPanel>
          <TeamAccentPanel color={dashboard.team.bannerColor}>
            <MyTeamSeasonOverview teamName={dashboard.team.name} fixtures={dashboard.schedule} />
          </TeamAccentPanel>
          <TeamAccentPanel color={dashboard.team.bannerColor}>
            <MyTeamPerformance teamName={dashboard.team.name} games={dashboard.results.games} players={dashboard.results.players} />
          </TeamAccentPanel>
        </div>
      </div>
    </main>
  );
}
