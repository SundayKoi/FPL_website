import MyTeamGate from "@/components/my-team/MyTeamGate";
import OpponentScout from "@/components/captain/OpponentScout";
import { fetchMyRoster } from "@/lib/captain/queries";
import { leaguePath } from "@/lib/league/links";
import { loadMyTeamDashboard } from "@/lib/my-team/queries";
import type { LeagueKey } from "@/lib/players/identity";
import { fetchIngestedScoutingGames, fetchInhousePlayerStats, fetchScoutingHistory } from "@/lib/scouting/queries";
import type { ScoutFixtureRow, ScoutRosterPlayer } from "@/lib/scouting/types";
import { createServerSupabase } from "@/lib/supabase/server";
import { normalizeName } from "@/lib/captain/teamNames";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function nextFixtureForTeam(fixtures: ScoutFixtureRow[], teamName: string): ScoutFixtureRow | undefined {
  const target = normalizeName(teamName);
  return fixtures
    .filter((fixture) =>
      fixture.score_a === null &&
      fixture.score_b === null &&
      (normalizeName(fixture.team_a) === target || normalizeName(fixture.team_b) === target),
    )
    .sort((a, b) => {
      const aTime = a.scheduled_at ? new Date(a.scheduled_at).getTime() : Number.POSITIVE_INFINITY;
      const bTime = b.scheduled_at ? new Date(b.scheduled_at).getTime() : Number.POSITIVE_INFINITY;
      return aTime - bTime || a.id.localeCompare(b.id);
    })[0];
}

function scoutingRoster(roster: Awaited<ReturnType<typeof fetchMyRoster>>): ScoutRosterPlayer[] {
  return roster.draftPlayers.map((player) => ({
    id: player.id,
    displayName: player.display_name,
    role: player.role,
    ...(player.opgg_url ? { opggUrl: player.opgg_url } : {}),
  }));
}

function ScoutingUnavailable({ core = false }: { core?: boolean }) {
  return (
    <main className="page-backdrop flex-1">
      <div className="mx-auto w-full max-w-[1800px] px-4 py-12 sm:px-6 sm:py-16">
        <section className="card-brand p-5" aria-label={core ? "My Team unavailable" : "Scouting unavailable"}>
          <span className="label-dash text-prestige">My Team · Scouting</span>
          <p className="mt-2 text-sm text-muted">
            {core ? "My Team is temporarily unavailable." : "Scouting data is temporarily unavailable."}
          </p>
          <p className="mt-2 text-sm text-muted">Please refresh and try again.</p>
        </section>
      </div>
    </main>
  );
}

export async function MyTeamScoutingPageView({
  league = "premier",
  searchParams,
}: {
  league?: LeagueKey;
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const requestedTeamId = first(params.team);
  const requestedScoutId = first(params.scout);
  const hasScoutTarget = params.scout !== undefined;
  const supabase = await createServerSupabase();

  let dashboard;
  try {
    dashboard = await loadMyTeamDashboard(supabase, league, requestedTeamId);
  } catch (error) {
    console.error("Unable to load My Team scouting identity", error);
    return <ScoutingUnavailable core />;
  }

  if (dashboard.kind !== "ready") {
    const query = new URLSearchParams();
    if (requestedTeamId) query.set("team", requestedTeamId);
    if (requestedScoutId) query.set("scout", requestedScoutId);
    const path = `${leaguePath("scouting", league)}${query.toString() ? `?${query.toString()}` : ""}`;
    return <MyTeamGate dashboard={dashboard} league={league} redirectPath={path} />;
  }

  const requestedScoutTeam = hasScoutTarget
    ? dashboard.activeTeams.find((team) => team.id === requestedScoutId) ?? null
    : null;
  const defaultScoutTeam = !hasScoutTarget ? dashboard.opponent?.team ?? null : null;
  const scoutTeam = requestedScoutTeam ?? defaultScoutTeam;
  const invalidScoutTarget = hasScoutTarget && !requestedScoutTeam;
  let scoutingSource: Parameters<typeof OpponentScout>[0]["source"] | null = null;
  let scoutingError = invalidScoutTarget;

  if (scoutTeam && !invalidScoutTarget) {
    try {
      const history = await fetchScoutingHistory(supabase, {
        league,
        leagueTeamNames: dashboard.teams.map((team) => team.name),
      });
      const rosterData = dashboard.opponent?.team?.id === scoutTeam.id
        ? dashboard.opponent.roster
        : await fetchMyRoster(supabase, scoutTeam.id, dashboard.season, league);
      if (!rosterData) throw new Error("scouting roster unavailable");
      const roster = scoutingRoster(rosterData);
      let ingestedGames: Awaited<ReturnType<typeof fetchIngestedScoutingGames>> | undefined;
      try {
        ingestedGames = await fetchIngestedScoutingGames(supabase, roster, history.fixtures, league);
      } catch (error) {
        console.error("Unable to load ingested scouting games; using draft attribution", error);
      }
      scoutingSource = {
        ...history,
        opponentName: scoutTeam.name,
        teamName: scoutTeam.name,
        currentSeason: dashboard.season,
        nextFixture: nextFixtureForTeam(history.fixtures, scoutTeam.name),
        roster,
        ...(ingestedGames ? { ingestedGames } : {}),
        inhousePlayerStats: await fetchInhousePlayerStats(supabase, roster),
      };
    } catch (error) {
      console.error("Unable to load scouting", error);
      scoutingError = true;
    }
  }

  const selectedTeamId = scoutTeam?.id ?? "";
  const selectorTarget = invalidScoutTarget ? "" : selectedTeamId;
  const teamQuery = dashboard.isAdmin ? dashboard.team.id : undefined;

  return (
    <main className="page-backdrop flex-1">
      <div className="mx-auto w-full max-w-[1800px] px-4 py-12 sm:px-6 sm:py-16">
        <header className="border-b border-border-subtle pb-8">
          <div>
            <span className="label-dash">My Team · {dashboard.season}</span>
            <h1 className="type-display mt-3 text-5xl sm:text-6xl">Scouting</h1>
            <p className="mt-4 text-lg leading-8 text-muted">Review a team&apos;s draft history, roster, and player pools.</p>
          </div>
        </header>

        {dashboard.activeTeams.length > 0 ? (
          <form action={leaguePath("scouting", league)} method="get" className="mt-6 flex flex-wrap items-end gap-2">
            {teamQuery ? <input type="hidden" name="team" value={teamQuery} /> : null}
            <label htmlFor="scouting-target" className="flex flex-col gap-1 text-xs text-muted">
              Team to scout
              <select
                id="scouting-target"
                name="scout"
                defaultValue={selectorTarget}
                className="input-brand px-2 py-1.5 text-sm"
              >
                <option value="">Select a team</option>
                {dashboard.activeTeams.map((team) => (
                  <option key={team.id} value={team.id}>{team.name}</option>
                ))}
              </select>
            </label>
            <button type="submit" className="rounded-full bg-action-fill px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white">
              View report
            </button>
          </form>
        ) : null}

        {dashboard.isAdmin && dashboard.activeTeams.length > 1 ? (
          <form action={leaguePath("scouting", league)} method="get" className="mt-6 flex flex-wrap items-end gap-2">
            {requestedScoutId ? <input type="hidden" name="scout" value={requestedScoutId} /> : null}
            <label htmlFor="scouting-team-switch" className="flex flex-col gap-1 text-xs text-muted">
              Viewing team (admin)
              <select
                id="scouting-team-switch"
                name="team"
                defaultValue={dashboard.team.id}
                className="input-brand px-2 py-1.5 text-sm"
              >
                {dashboard.activeTeams.map((team) => (
                  <option key={team.id} value={team.id}>{team.name}</option>
                ))}
              </select>
            </label>
            <button type="submit" className="rounded-full bg-action-fill px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white">
              Switch
            </button>
          </form>
        ) : null}

        {invalidScoutTarget ? (
          <section className="card-brand mt-8 p-5" aria-label="Scouting target unavailable">
            <span className="label-dash text-prestige">My Team · Scouting</span>
            <p className="mt-2 text-sm text-muted">That team is unavailable in this league. Choose an active team to view its report.</p>
          </section>
        ) : !scoutTeam ? (
          <section className="card-brand mt-8 p-5">
            <span className="label-dash text-prestige">My Team · Scouting</span>
            <p className="mt-2 text-sm text-muted">No upcoming opponent to scout. Choose a team above to view its available report.</p>
          </section>
        ) : scoutingSource ? (
          <OpponentScout key={scoutTeam.id} source={scoutingSource} perspective="team" />
        ) : scoutingError ? (
          <section className="card-brand mt-8 p-5" aria-label="Scouting unavailable">
            <span className="label-dash text-prestige">My Team · Scouting</span>
            <p className="mt-2 text-sm text-muted">Scouting data is temporarily unavailable.</p>
            <p className="mt-2 text-sm text-muted">The report for {scoutTeam.name} could not be loaded.</p>
          </section>
        ) : null}
      </div>
    </main>
  );
}
