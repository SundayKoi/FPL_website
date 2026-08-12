import { createServerSupabase } from "@/lib/supabase/server";
import {
  fetchAnnouncements,
  fetchCaptainContext,
  fetchCodes,
  fetchMyReports,
  fetchMyResults,
  fetchMyRoster,
} from "@/lib/captain/queries";
import { pickNextFixture } from "@/lib/captain/nextMatch";
import type { FixtureRow } from "@/lib/schedule/types";
import type { LeagueTeam } from "@/lib/matches/types";
import CaptainGate from "@/components/captain/CaptainGate";
import NextMatchCard from "@/components/captain/NextMatchCard";
import TourneyCodes from "@/components/captain/TourneyCodes";
import ReportBox from "@/components/captain/ReportBox";
import MyRoster from "@/components/captain/MyRoster";
import MyResults from "@/components/captain/MyResults";
import Announcements from "@/components/captain/Announcements";

function normalizeName(name: string | null): string {
  return (name ?? "").trim().toLowerCase();
}

/** Resolve a fixture's free-text team name to a league_teams id, if any matches. */
function matchTeamId(teams: LeagueTeam[], name: string | null): string | null {
  const target = normalizeName(name);
  if (!target) return null;
  return teams.find((t) => normalizeName(t.name) === target)?.id ?? null;
}

export default async function CaptainPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const supabase = await createServerSupabase();
  const context = await fetchCaptainContext(supabase);

  // Server-side gate: signed in AND (a captain this season OR an admin).
  // Always a 200 with the branded card below — never a 404/redirect.
  if (!context.profileId || (!context.isAdmin && !context.myTeamId)) {
    return <CaptainGate signedIn={context.profileId !== null} />;
  }

  const requestedRaw = (await searchParams).team;
  const requested = Array.isArray(requestedRaw) ? requestedRaw[0] : requestedRaw;
  // Admins: the requested (validated) team, defaulting to the first; a
  // regular captain always sees their own team, ignoring ?team=.
  const activeTeamId = context.isAdmin
    ? (requested && context.teams.some((t) => t.id === requested) ? requested : context.teams[0]?.id) ?? null
    : context.myTeamId;
  const activeTeam = activeTeamId ? (context.teams.find((t) => t.id === activeTeamId) ?? null) : null;

  if (!activeTeamId || !activeTeam) {
    return (
      <main className="bg-hash flex-1">
        <div className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
          <header className="border-b border-line pb-8">
            <span className="label-dash">Captain hub</span>
            <h1 className="type-display mt-3 text-5xl sm:text-6xl">Captain</h1>
          </header>
          <p className="mt-8 text-sm text-steel">No league teams are configured yet — ask an admin to add one.</p>
        </div>
      </main>
    );
  }

  const [fixturesResult, phaseResult] = await Promise.all([
    supabase.from("fixtures").select("*").eq("season", context.season),
    supabase.from("league_settings").select("current_phase").eq("id", 1).single(),
  ]);
  const fixtures = (fixturesResult.data as FixtureRow[]) ?? [];
  const defaultPhase = (phaseResult.data as { current_phase: string } | null)?.current_phase ?? "Regular";

  const nextFixture = pickNextFixture(fixtures, activeTeam.name);

  // Pre-fill the report form's team pickers from the resolved fixture: the
  // active team's own id is always exact; the opponent is resolved from the
  // fixture's free-text name and left blank (manual pick) if it doesn't
  // match any league_teams row.
  let prefillTeamAId: string | null = null;
  let prefillTeamBId: string | null = null;
  if (nextFixture) {
    const activeIsA = normalizeName(nextFixture.team_a) === normalizeName(activeTeam.name);
    prefillTeamAId = activeIsA ? activeTeamId : matchTeamId(context.teams, nextFixture.team_a);
    prefillTeamBId = activeIsA ? matchTeamId(context.teams, nextFixture.team_b) : activeTeamId;
  }

  const [codes, myReports, roster, results, announcements] = await Promise.all([
    nextFixture ? fetchCodes(supabase, nextFixture.id) : Promise.resolve([]),
    fetchMyReports(supabase, activeTeamId, context.season),
    fetchMyRoster(supabase, activeTeamId, context.season),
    fetchMyResults(supabase, activeTeam.name, context.season),
    fetchAnnouncements(supabase),
  ]);

  return (
    <main className="bg-hash flex-1">
      <div className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
        <header className="border-b border-line pb-8">
          <span className="label-dash">Captain hub · {context.season}</span>
          <h1 className="type-display mt-3 text-5xl sm:text-6xl">{activeTeam.name}</h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-steel">
            Your next match, tourney codes, result reporting, roster, and stats — all in one place.
          </p>
        </header>

        {context.isAdmin && context.teams.length > 1 && (
          <form action="/captain" method="get" className="mt-6 flex flex-wrap items-end gap-2">
            <label htmlFor="team-switch" className="flex flex-col gap-1 text-xs text-steel">
              Viewing team (admin)
              <select
                id="team-switch"
                name="team"
                defaultValue={activeTeamId}
                className="rounded border border-line bg-navy px-2 py-1.5 text-sm text-white focus:border-gold focus:outline-none"
              >
                {context.teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="rounded-full bg-gold px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-navy"
            >
              Switch
            </button>
          </form>
        )}

        <div className="mt-8 flex flex-col gap-6">
          <NextMatchCard fixture={nextFixture} myTeamName={activeTeam.name} />
          <TourneyCodes codes={codes} />
          <ReportBox
            key={activeTeamId}
            teams={context.teams}
            defaultSeason={context.season}
            defaultPhase={defaultPhase}
            fixtureId={nextFixture?.id ?? null}
            prefillTeamAId={prefillTeamAId}
            prefillTeamBId={prefillTeamBId}
            myReports={myReports}
          />
          <MyRoster draftPlayers={roster.draftPlayers} riotAccounts={roster.riotAccounts} />
          <MyResults teamName={activeTeam.name} games={results.games} players={results.players} />
          <Announcements announcements={announcements} />
        </div>
      </div>
    </main>
  );
}
