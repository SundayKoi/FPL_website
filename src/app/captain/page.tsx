import { createServerSupabase } from "@/lib/supabase/server";
import Link from "next/link";
import {
  fetchAnnouncements,
  fetchCaptainContext,
  fetchCodes,
  fetchDraftGames,
  fetchMyReports,
  fetchMyResults,
  fetchMyRoster,
  type MatchCode,
} from "@/lib/captain/queries";
import { matchDraftHref } from "@/lib/match-draft/rules";
import { pickNextFixture } from "@/lib/captain/nextMatch";
import { matchTeamId, normalizeName } from "@/lib/captain/teamNames";
import { opggMultiSearchUrlFromRiotIds, opggMultiSearchUrlFromRosterPlayers } from "@/lib/opgg/multiSearch";
import type { FixtureRow } from "@/lib/schedule/types";
import type { MatchReport, MatchReportGame } from "@/lib/matches/types";
import CaptainGate from "@/components/captain/CaptainGate";
import NextMatchCard from "@/components/captain/NextMatchCard";
import TourneyCodes from "@/components/captain/TourneyCodes";
import ReportBox from "@/components/captain/ReportBox";
import MyRoster from "@/components/captain/MyRoster";
import MyResults from "@/components/captain/MyResults";
import Announcements from "@/components/captain/Announcements";
import AdminCodeEditor from "@/components/captain/AdminCodeEditor";
import AdminReportsQueue from "@/components/captain/AdminReportsQueue";
import LeagueTeamsEditor from "@/components/matches/LeagueTeamsEditor";
import RosterEditor, { type RosterMembershipRow } from "@/components/matches/RosterEditor";
import LeaguePageToggle from "@/components/LeaguePageToggle";
import { leaguePath } from "@/lib/league/links";

export async function CaptainPageView({
  searchParams,
  league = "premier",
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
  league?: "premier" | "academy";
}) {
  const supabase = await createServerSupabase();
  const context = await fetchCaptainContext(supabase, league);

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
    ? (requested && context.teams.some((t) => t.id === requested) ? requested : context.activeTeams[0]?.id ?? context.teams[0]?.id) ?? null
    : context.myTeamId;
  const activeTeam = activeTeamId ? (context.teams.find((t) => t.id === activeTeamId) ?? null) : null;

  if (!activeTeamId || !activeTeam) {
    return (
      <main className="bg-hash flex-1">
        <div className="mx-auto w-full max-w-[1800px] px-4 py-12 sm:px-6 sm:py-16">
          <header className="flex flex-col gap-6 border-b border-line pb-8 lg:flex-row lg:items-end lg:justify-between">
            <span className="label-dash">Captain hub</span>
            <h1 className="type-display mt-3 text-5xl sm:text-6xl">Captain</h1>
            <LeaguePageToggle page="captain" view={league} />
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
  const leagueNames = new Set(context.teams.map((team) => normalizeName(team.name)));
  const allSeasonFixtures = (fixturesResult.data as FixtureRow[]) ?? [];
  const fixtures = league === "academy"
    ? allSeasonFixtures.filter((fixture) => leagueNames.has(normalizeName(fixture.team_a)) || leagueNames.has(normalizeName(fixture.team_b)))
    : allSeasonFixtures.filter((fixture) => leagueNames.has(normalizeName(fixture.team_a)) && leagueNames.has(normalizeName(fixture.team_b)));
  const defaultPhase = (phaseResult.data as { current_phase: string } | null)?.current_phase ?? "Regular";

  const nextFixture = pickNextFixture(fixtures, activeTeam.name);

  // Pre-fill the report form's team pickers from the resolved fixture: the
  // active team's own id is always exact; the opponent is resolved from the
  // fixture's free-text name and left blank (manual pick) if it doesn't
  // match any league_teams row.
  let prefillTeamAId: string | null = null;
  let prefillTeamBId: string | null = null;
  let opponentTeamId: string | null = null;
  if (nextFixture) {
    const activeIsA = normalizeName(nextFixture.team_a) === normalizeName(activeTeam.name);
    prefillTeamAId = activeIsA ? activeTeamId : matchTeamId(context.teams, nextFixture.team_a);
    prefillTeamBId = activeIsA ? matchTeamId(context.teams, nextFixture.team_b) : activeTeamId;
    opponentTeamId = activeIsA ? prefillTeamBId : prefillTeamAId;
  }

  const opponentName = nextFixture
    ? normalizeName(nextFixture.team_a) === normalizeName(activeTeam.name)
      ? nextFixture.team_b
      : nextFixture.team_a
    : null;
  const [codes, draftGames, myReports, roster, opponentRoster, results, announcements] = await Promise.all([
    nextFixture ? fetchCodes(supabase, nextFixture.id) : Promise.resolve([]),
    nextFixture ? fetchDraftGames(supabase, nextFixture.id, context.teams) : Promise.resolve([]),
    fetchMyReports(supabase, activeTeamId, context.season),
    fetchMyRoster(supabase, activeTeamId, context.season, league),
    opponentTeamId ? fetchMyRoster(supabase, opponentTeamId, context.season, league) : Promise.resolve(null),
    fetchMyResults(supabase, activeTeam.name, context.season),
    fetchAnnouncements(supabase),
  ]);

  // What the drafter already knows about the next series feeds the report
  // form: completed games arrive as pre-built rows with the drafted blue
  // side filled in, and recorded winners become the score. Everything stays
  // editable — the drafter's record is a head start, not the truth (teams
  // occasionally swap sides in the lobby after drafting).
  const completedDraftGames = draftGames.filter((game) => game.status === "complete");
  const draftWinsA = prefillTeamAId ? completedDraftGames.filter((game) => game.winnerTeamId === prefillTeamAId).length : 0;
  const draftWinsB = prefillTeamBId ? completedDraftGames.filter((game) => game.winnerTeamId === prefillTeamBId).length : 0;
  const draftPrefill =
    nextFixture && completedDraftGames.length > 0
      ? {
          draftUrl: matchDraftHref(nextFixture),
          games: completedDraftGames.map((game) => ({ gameNumber: game.gameNumber, blueTeamId: game.blueTeamId })),
          scoreA: draftWinsA + draftWinsB > 0 ? draftWinsA : null,
          scoreB: draftWinsA + draftWinsB > 0 ? draftWinsB : null,
        }
      : null;
  const opponentMultiOpggUrl = opponentRoster
    ? opggMultiSearchUrlFromRosterPlayers(opponentRoster.draftPlayers) ??
      opggMultiSearchUrlFromRiotIds(opponentRoster.riotAccounts)
    : null;
  const myMultiOpggUrl =
    opggMultiSearchUrlFromRosterPlayers(roster.draftPlayers) ??
    opggMultiSearchUrlFromRiotIds(roster.riotAccounts);

  // Admin-only data for the four panels below the captain sections. Fetched
  // inline here (rather than via src/lib/captain/queries.ts) and unfiltered
  // by team/season -- admins manage the whole league, not just one team --
  // see task-6-brief.md.
  let allReports: MatchReport[] = [];
  let allGames: MatchReportGame[] = [];
  let allCodes: MatchCode[] = [];
  let allMemberships: RosterMembershipRow[] = [];
  if (context.isAdmin) {
    const [reportsResult, gamesResult, codesResult, membershipsResult] = await Promise.all([
      supabase.from("match_reports").select("*").order("submitted_at", { ascending: false }),
      supabase.from("match_report_games").select("*"),
      supabase.from("match_codes").select("*"),
      supabase
        .from("roster_memberships")
        .select("id, season, league_team_id, riot_accounts(id, game_name, tag_line, display_name)"),
    ]);
    const teamIds = new Set(context.teams.map((team) => team.id));
    allReports = ((reportsResult.data as MatchReport[]) ?? []).filter((report) => league === "academy" ? teamIds.has(report.team_a_id) || teamIds.has(report.team_b_id) : true);
    allGames = (gamesResult.data as MatchReportGame[]) ?? [];
    allCodes = ((codesResult.data as MatchCode[]) ?? []).filter((code) => league === "academy" ? teamIds.has(code.team_a_id) || teamIds.has(code.team_b_id) : true);
    allMemberships = ((membershipsResult.data as RosterMembershipRow[]) ?? []).filter((membership) => league === "academy" ? teamIds.has(membership.league_team_id) : true);
  }

  return (
    <main className="bg-hash flex-1">
      <div className="mx-auto w-full max-w-[1800px] px-4 py-12 sm:px-6 sm:py-16">
        <header className="flex flex-col gap-6 border-b border-line pb-8 lg:flex-row lg:items-end lg:justify-between">
          <span className="label-dash">Captain hub · {context.season}</span>
          <h1 className="type-display mt-3 text-5xl sm:text-6xl">{activeTeam.name}</h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-steel">
            Your next match, tourney codes, result reporting, roster, and stats — all in one place.
          </p>
          <LeaguePageToggle page="captain" view={league} />
        </header>

        {/* The switcher must post back to the league the visitor is on.
            Hardcoding /captain sent an Academy admin to the Premier page,
            where their ?team= matched nothing and it fell back to the first
            Premier team. */}
        {context.isAdmin && context.activeTeams.length > 1 && (
          <form action={leaguePath("captain", league)} method="get" className="mt-6 flex flex-wrap items-end gap-2">
            <label htmlFor="team-switch" className="flex flex-col gap-1 text-xs text-steel">
              Viewing team (admin)
              <select
                id="team-switch"
                name="team"
                defaultValue={activeTeamId}
                className="input-brand px-2 py-1.5 text-sm"
              >
                {context.activeTeams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="rounded-full bg-coral px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-navy"
            >
              Switch
            </button>
          </form>
        )}

        <div className="mt-8 flex flex-col gap-6">
          <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
            <div className="flex flex-col gap-6">
              <NextMatchCard
                fixture={nextFixture}
                myTeamName={activeTeam.name}
                opponentMultiOpggUrl={opponentMultiOpggUrl}
                draftGames={draftGames}
              />
              {nextFixture && opponentName ? (
                <Link
                  href={`${league === "academy" ? "/academy/captain/scouting" : "/captain/scouting"}${context.isAdmin && activeTeamId ? `?team=${encodeURIComponent(activeTeamId)}` : ""}`}
                  className="card-brand block p-5 transition hover:border-coral/60"
                  aria-label={`Open Scouting for ${opponentName}`}
                >
                  <span className="label-dash text-gold">Premium · Scouting</span>
                  <h2 className="type-display mt-2 text-2xl">Scouting</h2>
                  <p className="mt-2 text-sm text-steel">Draft history and player pools for your next opponent: <span className="font-semibold text-white">{opponentName}</span></p>
                  <span className="mt-4 inline-flex rounded-full border border-coral/60 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-coral">Open Scouting →</span>
                </Link>
              ) : null}
              <TourneyCodes codes={codes} />
              <MyRoster
                draftPlayers={roster.draftPlayers}
                riotAccounts={roster.riotAccounts}
                multiOpggUrl={myMultiOpggUrl}
              />
            </div>
            <ReportBox
              key={activeTeamId}
              teams={context.activeTeams}
              defaultSeason={context.season}
              defaultPhase={defaultPhase}
              fixtureId={nextFixture?.id ?? null}
              prefillTeamAId={prefillTeamAId}
              prefillTeamBId={prefillTeamBId}
              draftPrefill={draftPrefill}
              myReports={myReports}
            />
          </div>
          <MyResults teamName={activeTeam.name} games={results.games} players={results.players} />
          <Announcements announcements={announcements} />

          {context.isAdmin && (
            <div className="mt-4 flex flex-col gap-6 border-t border-line pt-8">
              <div>
                <span className="label-dash">Admin</span>
                <h2 className="type-display mt-2 text-3xl">League admin</h2>
              </div>
              <AdminCodeEditor
                fixtures={fixtures}
                teams={context.teams}
                codes={allCodes}
                enableBulkImporter
              />
              <AdminReportsQueue reports={allReports} games={allGames} teams={context.teams} />
              {context.isOwner ? (
                <LeagueTeamsEditor teams={context.teams} />
              ) : (
                <p className="text-sm text-steel">Some league configuration is owner-only.</p>
              )}
              <RosterEditor teams={context.activeTeams} defaultSeason={context.season} memberships={allMemberships} />
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

export default async function CaptainPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  return CaptainPageView({ searchParams });
}
