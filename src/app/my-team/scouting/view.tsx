import MyTeamGate from "@/components/my-team/MyTeamGate";
import OpponentScout from "@/components/captain/OpponentScout";
import { leaguePath } from "@/lib/league/links";
import { loadMyTeamDashboard } from "@/lib/my-team/queries";
import type { LeagueKey } from "@/lib/players/identity";
import { fetchInhousePlayerStats, fetchScoutingHistory } from "@/lib/scouting/queries";
import { createServerSupabase } from "@/lib/supabase/server";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function ScoutingUnavailable({ core = false }: { core?: boolean }) {
  return (
    <main className="bg-hash flex-1">
      <div className="mx-auto w-full max-w-[1800px] px-4 py-12 sm:px-6 sm:py-16">
        <section className="card-brand p-5" aria-label={core ? "My Team unavailable" : "Scouting unavailable"}>
          <span className="label-dash text-gold">Premium · Scouting</span>
          <p className="mt-2 text-sm text-steel">
            {core ? "My Team is temporarily unavailable." : "Scouting data is temporarily unavailable."}
          </p>
          <p className="mt-2 text-sm text-steel">Please refresh and try again.</p>
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
  const requestedTeamId = first((await searchParams).team);
  const supabase = await createServerSupabase();

  let dashboard;
  try {
    dashboard = await loadMyTeamDashboard(supabase, league, requestedTeamId);
  } catch (error) {
    console.error("Unable to load My Team scouting identity", error);
    return <ScoutingUnavailable core />;
  }

  if (dashboard.kind !== "ready") {
    return <MyTeamGate dashboard={dashboard} league={league} />;
  }

  const nextFixture = dashboard.nextFixture;
  const opponent = dashboard.opponent;
  let scoutingSource: Parameters<typeof OpponentScout>[0]["source"] | null = null;
  let scoutingError = opponent?.scoutingUnavailable ?? false;

  if (nextFixture && opponent && !scoutingError && opponent.roster) {
    try {
      const history = await fetchScoutingHistory(supabase, {
        league,
        leagueTeamNames: dashboard.teams.map((team) => team.name),
      });
      const roster = opponent.roster.draftPlayers.map((player) => ({
        id: player.id,
        displayName: player.display_name,
        role: player.role,
      }));
      scoutingSource = {
        ...history,
        opponentName: opponent.name,
        teamName: opponent.name,
        currentSeason: dashboard.season,
        nextFixture,
        roster,
        inhousePlayerStats: await fetchInhousePlayerStats(supabase, roster),
      };
    } catch (error) {
      console.error("Unable to load scouting", error);
      scoutingError = true;
    }
  } else if (nextFixture && opponent && !opponent.roster) {
    scoutingError = true;
  }

  return (
    <main className="bg-hash flex-1">
      <div className="mx-auto w-full max-w-[1800px] px-4 py-12 sm:px-6 sm:py-16">
        <header className="border-b border-line pb-8">
          <div>
            <span className="label-dash">My Team · {dashboard.season}</span>
            <h1 className="type-display mt-3 text-5xl sm:text-6xl">Scouting</h1>
            <p className="mt-4 text-lg leading-8 text-steel">Review your next opponent&apos;s draft history.</p>
          </div>
        </header>

        {dashboard.isAdmin && dashboard.activeTeams.length > 1 ? (
          <form action={leaguePath("scouting", league)} method="get" className="mt-6 flex flex-wrap items-end gap-2">
            <label htmlFor="scouting-team-switch" className="flex flex-col gap-1 text-xs text-steel">
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
            <button type="submit" className="rounded-full bg-coral px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-navy">
              Switch
            </button>
          </form>
        ) : null}

        {!nextFixture || !opponent ? (
          <section className="card-brand mt-8 p-5">
            <span className="label-dash text-gold">Premium · Scouting</span>
            <p className="mt-2 text-sm text-steel">No upcoming opponent to scout.</p>
          </section>
        ) : scoutingSource ? (
          <OpponentScout source={scoutingSource} />
        ) : scoutingError ? (
          <section className="card-brand mt-8 p-5" aria-label="Scouting unavailable">
            <span className="label-dash text-gold">Premium · Scouting</span>
            <p className="mt-2 text-sm text-steel">Scouting data is temporarily unavailable.</p>
          </section>
        ) : null}
      </div>
    </main>
  );
}
