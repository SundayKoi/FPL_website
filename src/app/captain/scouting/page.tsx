import { createServerSupabase } from "@/lib/supabase/server";
import {
  fetchCaptainContext,
  fetchMyRoster,
} from "@/lib/captain/queries";
import { fetchScoutingHistory } from "@/lib/scouting/queries";
import { pickNextFixture } from "@/lib/captain/nextMatch";
import { matchTeamId, normalizeName } from "@/lib/captain/teamNames";
import type { FixtureRow } from "@/lib/schedule/types";
import CaptainGate from "@/components/captain/CaptainGate";
import OpponentScout from "@/components/captain/OpponentScout";
import LeaguePageToggle from "@/components/LeaguePageToggle";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export async function CaptainScoutingPageView({
  searchParams,
  league = "premier",
}: {
  searchParams: SearchParams;
  league?: "premier" | "academy";
}) {
  const supabase = await createServerSupabase();
  const context = await fetchCaptainContext(supabase, league);

  if (!context.profileId || (!context.isAdmin && !context.myTeamId)) {
    return <CaptainGate signedIn={context.profileId !== null} />;
  }

  const requestedRaw = (await searchParams).team;
  const requested = Array.isArray(requestedRaw) ? requestedRaw[0] : requestedRaw;
  const activeTeamId = context.isAdmin
    ? (requested && context.teams.some((team) => team.id === requested) ? requested : context.activeTeams[0]?.id ?? context.teams[0]?.id) ?? null
    : context.myTeamId;
  const activeTeam = activeTeamId ? context.teams.find((team) => team.id === activeTeamId) ?? null : null;

  if (!activeTeamId || !activeTeam) {
    return (
      <main className="bg-hash flex-1">
        <div className="mx-auto w-full max-w-[1800px] px-4 py-12 sm:px-6 sm:py-16">
          <header className="border-b border-line pb-8">
            <span className="label-dash">Captain hub</span>
            <h1 className="type-display mt-3 text-5xl sm:text-6xl">Scouting</h1>
          </header>
          <p className="mt-8 text-sm text-steel">No league teams are configured yet — ask an admin to add one.</p>
        </div>
      </main>
    );
  }

  const fixturesResult = await supabase.from("fixtures").select("*").eq("season", context.season);
  const leagueNames = new Set(context.teams.map((team) => normalizeName(team.name)));
  const allSeasonFixtures = (fixturesResult.data as FixtureRow[]) ?? [];
  const fixtures = league === "academy"
    ? allSeasonFixtures.filter((fixture) => leagueNames.has(normalizeName(fixture.team_a)) || leagueNames.has(normalizeName(fixture.team_b)))
    : allSeasonFixtures.filter((fixture) => leagueNames.has(normalizeName(fixture.team_a)) && leagueNames.has(normalizeName(fixture.team_b)));
  const nextFixture = pickNextFixture(fixtures, activeTeam.name);
  const opponentName = nextFixture
    ? normalizeName(nextFixture.team_a) === normalizeName(activeTeam.name)
      ? nextFixture.team_b
      : nextFixture.team_a
    : null;

  const opponentTeamId = nextFixture
    ? normalizeName(nextFixture.team_a) === normalizeName(activeTeam.name)
      ? matchTeamId(context.teams, nextFixture.team_b)
      : matchTeamId(context.teams, nextFixture.team_a)
    : null;

  let scoutingSource: Parameters<typeof OpponentScout>[0]["source"] | null = null;
  let scoutingError = false;
  if (nextFixture && opponentName) {
    try {
      const [history, opponentRoster] = await Promise.all([
        fetchScoutingHistory(supabase, { league, leagueTeamNames: context.teams.map((team) => team.name) }),
        opponentTeamId ? fetchMyRoster(supabase, opponentTeamId, context.season, league) : Promise.resolve(null),
      ]);
      scoutingSource = {
        ...history,
        opponentName,
        teamName: opponentName,
        currentSeason: context.season,
        nextFixture,
        roster: (opponentRoster?.draftPlayers ?? []).map((player) => ({ id: player.id, displayName: player.display_name, role: player.role })),
      };
    } catch (error) {
      console.error("Unable to load scouting", error);
      scoutingError = true;
    }
  }

  return (
    <main className="bg-hash flex-1">
      <div className="mx-auto w-full max-w-[1800px] px-4 py-12 sm:px-6 sm:py-16">
        <header className="flex flex-col gap-6 border-b border-line pb-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <span className="label-dash">Captain hub · {context.season}</span>
            <h1 className="type-display mt-3 text-5xl sm:text-6xl">Scouting</h1>
            <p className="mt-4 text-lg leading-8 text-steel">Review your next opponent&apos;s draft history.</p>
          </div>
          <LeaguePageToggle page="scouting" view={league} params={context.isAdmin && activeTeamId ? { team: activeTeamId } : undefined} />
        </header>

        {context.isAdmin && context.activeTeams.length > 1 && (
          <form action={league === "academy" ? "/academy/captain/scouting" : "/captain/scouting"} method="get" className="mt-6 flex flex-wrap items-end gap-2">
            <label htmlFor="scouting-team-switch" className="flex flex-col gap-1 text-xs text-steel">
              Viewing team (admin)
              <select id="scouting-team-switch" name="team" defaultValue={activeTeamId} className="input-brand px-2 py-1.5 text-sm">
                {context.activeTeams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
              </select>
            </label>
            <button type="submit" className="rounded-full bg-coral px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-navy">Switch</button>
          </form>
        )}

        {!nextFixture || !opponentName ? (
          <section className="card-brand mt-8 p-5">
            <span className="label-dash text-gold">Premium · Scouting</span>
            <p className="mt-2 text-sm text-steel">No upcoming opponent to scout.</p>
          </section>
        ) : (
          scoutingSource ? <OpponentScout source={scoutingSource} /> : scoutingError ? (
            <section className="card-brand mt-8 p-5" aria-label="Scouting unavailable">
              <span className="label-dash text-gold">Premium · Scouting</span>
              <p className="mt-2 text-sm text-steel">Scouting data is temporarily unavailable.</p>
            </section>
          ) : null
        )}
      </div>
    </main>
  );
}

export default async function CaptainScoutingPage({ searchParams }: { searchParams: SearchParams }) {
  return CaptainScoutingPageView({ searchParams });
}
