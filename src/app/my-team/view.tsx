import MyTeamGate from "@/components/my-team/MyTeamGate";
import ReportBox, { type DraftPrefill } from "@/components/captain/ReportBox";
import AdminCodeEditor from "@/components/captain/AdminCodeEditor";
import AdminReportsQueue from "@/components/captain/AdminReportsQueue";
import LeagueTeamsEditor from "@/components/matches/LeagueTeamsEditor";
import RosterEditor, { type RosterMembershipRow } from "@/components/matches/RosterEditor";
import { fetchStaffTier } from "@/lib/auth/staffTier";
import { fetchMyReports, type MatchCode, type MyReportRow } from "@/lib/captain/queries";
import { matchTeamId, normalizeName } from "@/lib/captain/teamNames";
import { leaguePath } from "@/lib/league/links";
import { matchDraftHref } from "@/lib/match-draft/rules";
import type { MatchReport, MatchReportGame } from "@/lib/matches/types";
import { loadMyTeamDashboard } from "@/lib/my-team/queries";
import { createLeagueTeamScope } from "@/lib/my-team/leagueScope";
import type { MyTeamReadyDashboard } from "@/lib/my-team/types";
import type { LeagueKey } from "@/lib/players/identity";
import type { FixtureRow } from "@/lib/schedule/types";
import { createServerSupabase } from "@/lib/supabase/server";
import TeamAccentPanel from "@/components/my-team/TeamAccentPanel";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function Unavailable({ message }: { message: string }) {
  return (
    <main className="bg-hash flex-1">
      <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        <section className="card-brand p-6 sm:p-8" aria-label="My Team unavailable">
          <span className="label-dash">My Team</span>
          <h1 className="type-display mt-3 text-3xl sm:text-4xl">Temporarily unavailable</h1>
          <p className="mt-3 text-sm leading-6 text-muted">{message}</p>
          <p className="mt-2 text-sm leading-6 text-muted">Please refresh and try again.</p>
        </section>
      </div>
    </main>
  );
}

function reportPrefill(dashboard: MyTeamReadyDashboard): {
  prefillTeamAId: string | null;
  prefillTeamBId: string | null;
  draftPrefill: DraftPrefill | null;
} {
  const fixture = dashboard.nextFixture;
  if (!fixture) {
    return { prefillTeamAId: null, prefillTeamBId: null, draftPrefill: null };
  }

  const activeIsA = normalizeName(fixture.team_a) === normalizeName(dashboard.team.name);
  const prefillTeamAId = activeIsA
    ? dashboard.team.id
    : matchTeamId(dashboard.teams, fixture.team_a);
  const prefillTeamBId = activeIsA
    ? matchTeamId(dashboard.teams, fixture.team_b)
    : dashboard.team.id;
  const completedGames = dashboard.draftGames.filter((game) => game.status === "complete");
  const winsA = prefillTeamAId
    ? completedGames.filter((game) => game.winnerTeamId === prefillTeamAId).length
    : 0;
  const winsB = prefillTeamBId
    ? completedGames.filter((game) => game.winnerTeamId === prefillTeamBId).length
    : 0;

  return {
    prefillTeamAId,
    prefillTeamBId,
    draftPrefill: completedGames.length > 0
      ? {
          draftUrl: matchDraftHref(fixture),
          games: completedGames.map((game) => ({
            gameNumber: game.gameNumber,
            blueTeamId: game.blueTeamId,
          })),
          scoreA: winsA + winsB > 0 ? winsA : null,
          scoreB: winsA + winsB > 0 ? winsB : null,
        }
      : null,
  };
}

export async function MyTeamPageView({
  league = "premier",
  searchParams,
}: {
  league?: LeagueKey;
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const requestedTeamId = first(params.team);
  const supabase = await createServerSupabase();

  let dashboard;
  try {
    dashboard = await loadMyTeamDashboard(supabase, league, requestedTeamId);
  } catch (error) {
    console.error("Unable to load My Team", error);
    return <Unavailable message="My Team is temporarily unavailable." />;
  }

  if (dashboard.kind !== "ready") {
    return <MyTeamGate dashboard={dashboard} league={league} />;
  }

  const canReport = dashboard.isCaptain || dashboard.isAdmin;
  let captainData: {
    defaultPhase: string;
    myReports: MyReportRow[];
    prefill: ReturnType<typeof reportPrefill>;
  } | null = null;
  let captainToolsError = false;
  if (canReport) {
    try {
      const [phaseResult, myReports] = await Promise.all([
        supabase.from("league_settings").select("current_phase").eq("id", 1).single(),
        fetchMyReports(supabase, dashboard.team.id, dashboard.season, dashboard.teams),
      ]);
      if (phaseResult.error) throw phaseResult.error;
      const defaultPhase = (phaseResult.data as { current_phase: string } | null)?.current_phase ?? "Regular";
      captainData = { defaultPhase, myReports, prefill: reportPrefill(dashboard) };
    } catch (error) {
      console.error("Unable to load My Team captain tools", error);
      captainToolsError = true;
    }
  }

  const captainTools = captainData ? (
    <TeamAccentPanel color={dashboard.team.bannerColor}>
      <section className="card-brand p-5" aria-labelledby="captain-tools-heading">
        <span className="label-dash">Captain tools</span>
        <h2 id="captain-tools-heading" className="type-display mt-2 text-3xl">Report a result</h2>
        <div className="mt-5">
          <ReportBox
            key={dashboard.team.id}
            teams={dashboard.activeTeams}
            defaultSeason={dashboard.season}
            defaultPhase={captainData.defaultPhase}
            fixtureId={dashboard.nextFixture?.id ?? null}
            prefillTeamAId={captainData.prefill.prefillTeamAId}
            prefillTeamBId={captainData.prefill.prefillTeamBId}
            draftPrefill={captainData.prefill.draftPrefill}
            myReports={captainData.myReports}
          />
        </div>
      </section>
    </TeamAccentPanel>
  ) : captainToolsError ? (
    <TeamAccentPanel color={dashboard.team.bannerColor}>
      <section className="card-brand p-5" aria-label="Captain tools unavailable">
        <span className="label-dash">Captain tools</span>
        <p className="mt-3 text-sm text-muted">Captain tools are temporarily unavailable.</p>
      </section>
    </TeamAccentPanel>
  ) : null;

  let adminData: {
    fixtures: FixtureRow[];
    reports: MatchReport[];
    games: MatchReportGame[];
    codes: MatchCode[];
    memberships: RosterMembershipRow[];
    isOwner: boolean;
  } | null = null;
  let adminToolsError = false;
  if (dashboard.isAdmin) {
    try {
      const [fixturesResult, reportsResult, gamesResult, codesResult, membershipsResult, staffTier] = await Promise.all([
        supabase.from("fixtures").select("*").eq("season", dashboard.season),
        supabase.from("match_reports").select("*").order("submitted_at", { ascending: false }),
        supabase.from("match_report_games").select("*"),
        supabase.from("match_codes").select("*"),
        supabase
          .from("roster_memberships")
          .select("id, season, league_team_id, riot_accounts(id, game_name, tag_line, display_name)"),
        fetchStaffTier(supabase),
      ]);
      for (const result of [fixturesResult, reportsResult, gamesResult, codesResult, membershipsResult]) {
        if (result.error) throw result.error;
      }

      const scope = createLeagueTeamScope(dashboard.teams);
      const fixtures = ((fixturesResult.data as FixtureRow[] | null) ?? [])
        .filter((fixture) => scope.includesFixture(fixture));
      const reports = ((reportsResult.data as MatchReport[] | null) ?? [])
        .filter((report) => scope.includesTeamPair(report.team_a_id, report.team_b_id));
      const games = (gamesResult.data as MatchReportGame[] | null) ?? [];
      const codes = ((codesResult.data as MatchCode[] | null) ?? [])
        .filter((code) => scope.includesTeamPair(code.team_a_id, code.team_b_id));
      const memberships = ((membershipsResult.data as RosterMembershipRow[] | null) ?? [])
        .filter((membership) => scope.includesTeamId(membership.league_team_id));

      adminData = { fixtures, reports, games, codes, memberships, isOwner: staffTier.isOwner };
    } catch (error) {
      console.error("Unable to load My Team admin tools", error);
      adminToolsError = true;
    }
  }

  const adminTools = adminData ? (
    <TeamAccentPanel color={dashboard.team.bannerColor}>
      <section className="mt-4 flex flex-col gap-6 border-t border-border pt-8" aria-labelledby="admin-tools-heading">
        <div>
          <span className="label-dash">Admin</span>
          <h2 id="admin-tools-heading" className="type-display mt-2 text-3xl">League admin</h2>
        </div>
        <AdminCodeEditor fixtures={adminData.fixtures} teams={dashboard.teams} codes={adminData.codes} enableBulkImporter />
        <AdminReportsQueue reports={adminData.reports} games={adminData.games} teams={dashboard.teams} />
        {adminData.isOwner ? (
          <LeagueTeamsEditor teams={dashboard.teams} />
        ) : (
          <p className="text-sm text-muted">Some league configuration is owner-only.</p>
        )}
        <RosterEditor
          teams={dashboard.activeTeams}
          defaultSeason={dashboard.season}
          memberships={adminData.memberships}
        />
      </section>
    </TeamAccentPanel>
  ) : adminToolsError ? (
    <TeamAccentPanel color={dashboard.team.bannerColor}>
      <section className="card-brand p-5" aria-label="Admin tools unavailable">
        <span className="label-dash">Admin</span>
        <p className="mt-3 text-sm text-muted">Admin tools are temporarily unavailable.</p>
      </section>
    </TeamAccentPanel>
  ) : null;

  return (
    <>
      <MyTeamGate dashboard={dashboard} league={league} />
      {(dashboard.isAdmin || captainTools) ? (
        <div className="bg-hash pb-12 sm:pb-16">
          <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-6 px-4 sm:px-6">
            {dashboard.isAdmin && dashboard.activeTeams.length > 1 ? (
              <form action={leaguePath("my-team", league)} method="get" className="flex flex-wrap items-end gap-2">
                <label htmlFor="my-team-switch" className="flex flex-col gap-1 text-xs text-muted">
                  Viewing team (admin)
                  <select
                    id="my-team-switch"
                    name="team"
                    defaultValue={dashboard.team.id}
                    className="input-brand px-2 py-1.5 text-sm"
                  >
                    {dashboard.activeTeams.map((team) => (
                      <option key={team.id} value={team.id}>{team.name}</option>
                    ))}
                  </select>
                </label>
                <button type="submit" className="rounded-full bg-primary px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white">
                  Switch
                </button>
              </form>
            ) : null}
            {captainTools}
            {adminTools}
          </div>
        </div>
      ) : null}
    </>
  );
}
