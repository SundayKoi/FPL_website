import type { ReactElement } from "react";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { fetchStaffTier, isMissingBroadcasterColumn } from "@/lib/auth/staffTier";
import type { Draft } from "@/lib/draft/types";
import DraftListClient from "@/components/admin/DraftListClient";
import AdminConsole, { type AdminActivityItem, type AdminQueueItem } from "@/components/admin/AdminConsole";
import AdminHomepageMode from "@/components/admin/AdminHomepageMode";
import AdminStaff, { type StaffProfile } from "@/components/admin/AdminStaff";
import AdminFeaturedMatchupEditor, { type FeaturedFixtureChoice } from "@/components/admin/AdminFeaturedMatchupEditor";
import AdminBangerTitles from "@/components/admin/AdminBangerTitles";
import AdminReportsQueue from "@/components/captain/AdminReportsQueue";
import type { MatchReport, MatchReportGame, LeagueTeam } from "@/lib/matches/types";
import type { HomepageMode } from "@/lib/home/seasonState";
import { fetchHomepageFeaturedSettings } from "@/lib/home/homepageSettings";
import { fetchBangerBoardSettings } from "@/lib/bangers/settings";
import { fetchHomepageSchedule, selectHomepageFeaturedFixture } from "@/lib/home/schedule";
import { fetchAcademyDraftData } from "@/lib/academy/draft";
import { filterAcademyFixtures } from "@/lib/academy/filtering";
import { academyTeamNames } from "@/lib/league/context";
import { fetchLeagueSeasons, seasonBelongsToLeague } from "@/lib/league/season";
import { formatKickoff, stageMeta } from "@/lib/schedule/format";
import { FIXTURE_STAGES, type FixtureRow, type FixtureStage } from "@/lib/schedule/types";

/** The whole bracket ahead, stage-labelled: staff pick playoff games here too,
 *  not just the active week's. */
function featuredFixtureChoices(fixtures: FixtureRow[]): FeaturedFixtureChoice[] {
  return fixtures.map((fixture) => ({
    id: fixture.id,
    label: `${stageMeta(fixture.stage).label}${fixture.division ? ` · ${fixture.division}` : ""} · ${fixture.team_a ?? "TBD"} vs ${fixture.team_b ?? "TBD"}`,
  }));
}

function timeAgo(value: string, now = Date.now()): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "Time unavailable";
  const minutes = Math.max(0, Math.floor((now - timestamp) / 60_000));
  if (minutes === 0) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function teamName(teamNames: Map<string, string>, id: string): string {
  return teamNames.get(id) ?? "Unknown team";
}

async function fetchStaffProfiles(supabase: Awaited<ReturnType<typeof createServerSupabase>>) {
  const current = await supabase
    .from("profiles")
    .select("id, display_name, is_admin, is_owner, is_broadcaster")
    .order("display_name");
  if (!current.error) return (current.data as StaffProfile[]) ?? [];
  if (!isMissingBroadcasterColumn(current.error)) return [];

  const legacy = await supabase
    .from("profiles")
    .select("id, display_name, is_admin, is_owner")
    .order("display_name");
  if (legacy.error) return [];
  return ((legacy.data as Omit<StaffProfile, "is_broadcaster">[]) ?? []).map((profile) => ({
    ...profile,
    is_broadcaster: false,
  }));
}

/** Staff overview with scoped schedule context and the existing admin workspaces. */
type AdminPageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};
type PendingIdentityQueueRow = {
  id: string;
  player_pool_id: string;
  league_team_id: string;
  requested_at: string;
};
type PendingIdentityQueryRow = Omit<PendingIdentityQueueRow, "league_team_id"> & { league_team_id: string | null };
type ApprovedIdentityActivity = Omit<PendingIdentityQueueRow, "requested_at"> & { decided_at: string };
type ApprovedIdentityQueryRow = Omit<ApprovedIdentityActivity, "league_team_id" | "decided_at"> & {
  league_team_id: string | null;
  decided_at: string | null;
};
type ApprovedCardClaimActivity = {
  season: string;
  summoner_name: string;
  tag: string;
  decided_at: string;
};

function AdminPage(): Promise<ReactElement>;
function AdminPage(props: AdminPageProps): Promise<ReactElement>;
async function AdminPage(props?: AdminPageProps) {
  const supabase = await createServerSupabase();
  const { isAdmin, isOwner, isBroadcaster } = await fetchStaffTier(supabase);
  const canUseFullAdmin = isAdmin || isOwner;
  if (!canUseFullAdmin && !isBroadcaster) redirect("/");

  const params = await (
    props?.searchParams ?? Promise.resolve<Record<string, string | string[] | undefined>>({})
  );
  const requestedLeague = Array.isArray(params.league) ? params.league[0] : params.league;
  const league = requestedLeague === "academy" ? "academy" : "premier";
  const requestedSeason = Array.isArray(params.season) ? params.season[0] : params.season;

  // Owners see the staff panel. This gate is presentation only — set_profile_admin
  // re-checks ownership server-side, so an admin who forges their way here can
  // still change nothing.
  const staffProfiles = isOwner
    ? await fetchStaffProfiles(supabase)
    : [];

  const [draftsResult, settingsResult, fixtureSeasonsResult, leagueSeasons] = await Promise.all([
    supabase.from("drafts").select("*").order("created_at", { ascending: false }),
    supabase
      .from("league_settings")
      .select("current_season, academy_season, current_phase, signups_open, homepage_mode")
      .eq("id", 1)
      .single(),
    supabase.from("fixtures").select("season"),
    fetchLeagueSeasons(supabase),
  ]);

  const drafts = (draftsResult.data as Draft[]) ?? [];
  const settings = settingsResult.data as {
    current_season: string;
    academy_season: string;
    current_phase: string;
    signups_open: boolean;
    homepage_mode: HomepageMode;
  } | null;
  const [academyDraftData, premierSettings, academySettings, bangerTitles] = await Promise.all([
    fetchAcademyDraftData(supabase),
    fetchHomepageFeaturedSettings("premier"),
    fetchHomepageFeaturedSettings("academy"),
    fetchBangerBoardSettings(),
  ]);
  const academyTeamNameSet = academyTeamNames(academyDraftData.teams);
  const [premierSchedule, academySchedule] = await Promise.all([
    fetchHomepageSchedule(undefined, settings?.current_season),
    fetchHomepageSchedule((fixtures) => filterAcademyFixtures(fixtures, academyTeamNameSet), settings?.academy_season),
  ]);
  const latestSchedule = league === "academy" ? academySchedule : premierSchedule;
  const defaultSeason = leagueSeasons[league] || (league === "academy" ? "A1" : settings?.current_season ?? "S5");
  const fixtureSeasons = ((fixtureSeasonsResult.data as { season: string }[] | null) ?? [])
    .map((row) => row.season)
    .filter((season) => seasonBelongsToLeague(season, league));
  const seasonOptions = [...new Set([defaultSeason, latestSchedule.season ?? "", ...fixtureSeasons].filter(Boolean))]
    .sort((a, b) => {
      if (a === defaultSeason) return -1;
      if (b === defaultSeason) return 1;
      return Number.parseInt(b.slice(1), 10) - Number.parseInt(a.slice(1), 10);
    });
  const season = requestedSeason && seasonOptions.includes(requestedSeason) ? requestedSeason : defaultSeason;
  const displaySchedule = season === latestSchedule.season
    ? latestSchedule
    : await fetchHomepageSchedule(
        league === "academy" ? (fixtures) => filterAcademyFixtures(fixtures, academyTeamNameSet) : undefined,
        season,
      );
  const homepageSettings = league === "academy" ? academySettings : premierSettings;
  const featuredFixture = selectHomepageFeaturedFixture(latestSchedule.upcoming, homepageSettings.fixtureId);
  const phase = displaySchedule.activeStage
    ? stageMeta(displaySchedule.activeStage).label
    : settings?.current_phase && FIXTURE_STAGES.includes(settings.current_phase as FixtureStage)
      ? stageMeta(settings.current_phase as FixtureStage).label
      : "Season setup";
  const upcomingFixtures = displaySchedule.upcoming.filter((fixture) =>
    fixture.score_a === null &&
    fixture.score_b === null &&
    (!fixture.scheduled_at || new Date(fixture.scheduled_at).getTime() >= Date.now()),
  );
  const upcoming = upcomingFixtures.slice(0, 4).map((fixture) => ({
    id: fixture.id,
    matchup: `${fixture.team_a ?? "TBD"} vs ${fixture.team_b ?? "TBD"}`,
    starts: formatKickoff(fixture.scheduled_at),
    status: fixture.score_a !== null && fixture.score_b !== null ? "Completed" : "Scheduled",
  }));
  const today = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    timeZone: "America/Chicago",
  }).format(new Date()).toUpperCase();

  let queueCounts = { reports: 0, claims: 0 };
  let queueItems: AdminQueueItem[] = [];
  let recentActivity: AdminActivityItem[] = [];
  let queueUnavailable = false;
  let reportQueueUnavailable = false;
  let reportQueue: ReactElement | undefined;

  if (isAdmin) {
    const [reportsResult, pendingClaimsResult, approvedClaimsResult, pendingIdentityResult, approvedIdentityResult] = await Promise.all([
      supabase.from("match_reports").select("*").eq("season", season).order("submitted_at", { ascending: false }),
      supabase
        .from("card_claims")
        .select("season, summoner_name, tag, created_at", { count: "exact" })
        .eq("season", season)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(8),
      supabase
        .from("card_claims")
        .select("season, summoner_name, tag, decided_at")
        .eq("season", season)
        .eq("status", "approved")
        .order("decided_at", { ascending: false })
        .limit(8),
      supabase
        .from("player_identity_links")
        .select("id, player_pool_id, league_team_id, requested_at")
        .eq("league", league)
        .eq("season", season)
        .eq("status", "pending")
        .order("requested_at", { ascending: false }),
      supabase
        .from("player_identity_links")
        .select("id, player_pool_id, league_team_id, decided_at")
        .eq("league", league)
        .eq("season", season)
        .eq("status", "approved")
        .order("decided_at", { ascending: false })
        .limit(8),
    ]);

    const reports = (reportsResult.data as MatchReport[] | null) ?? [];
    const pendingClaims = (pendingClaimsResult.data as {
      season: string;
      summoner_name: string;
      tag: string;
      created_at: string;
    }[] | null) ?? [];
    const approvedClaims = ((approvedClaimsResult.data as {
      season: string;
      summoner_name: string;
      tag: string;
      decided_at: string | null;
    }[] | null) ?? []).filter((claim): claim is ApprovedCardClaimActivity => claim.decided_at !== null);
    const pendingIdentity = ((pendingIdentityResult.data as PendingIdentityQueryRow[] | null) ?? [])
      .filter((claim): claim is PendingIdentityQueueRow => claim.league_team_id !== null);
    const approvedIdentity = ((approvedIdentityResult.data as ApprovedIdentityQueryRow[] | null) ?? [])
      .filter((claim): claim is ApprovedIdentityActivity => claim.league_team_id !== null && claim.decided_at !== null);
    const unresolvedReports = reports.filter((report) =>
      report.status === "pending" || report.status === "needs_sides" || report.status === "failed",
    );
    queueCounts = {
      reports: unresolvedReports.length,
      claims: typeof pendingClaimsResult.count === "number"
        ? pendingClaimsResult.count + pendingIdentity.length
        : pendingClaims.length + pendingIdentity.length,
    };
    reportQueueUnavailable = Boolean(reportsResult.error);
    queueUnavailable = Boolean(
      reportsResult.error
      || pendingClaimsResult.error
      || approvedClaimsResult.error
      || pendingIdentityResult.error
      || approvedIdentityResult.error,
    );

    let reportGames: MatchReportGame[] = [];
    let leagueTeams: LeagueTeam[] = [];
    if (!reportsResult.error) {
      const [gamesResult, teamsResult] = await Promise.all([
        reports.length
          ? supabase.from("match_report_games").select("*").in("report_id", reports.map((report) => report.id)).order("game_number")
          : Promise.resolve({ data: [] as MatchReportGame[], error: null }),
        supabase.from("league_teams").select("id, name, abbreviation, active").order("name"),
      ]);
      reportGames = (gamesResult.data as MatchReportGame[] | null) ?? [];
      leagueTeams = (teamsResult.data as LeagueTeam[] | null) ?? [];
      reportQueueUnavailable = Boolean(gamesResult.error || teamsResult.error);
      queueUnavailable ||= reportQueueUnavailable;
      if (!reportQueueUnavailable && reports.length > 0) {
        reportQueue = <AdminReportsQueue reports={reports} games={reportGames} teams={leagueTeams} initiallyOpen />;
      }
    }

    const names = new Map(leagueTeams.map((team) => [team.id, team.name]));
    const identityPlayerIds = [...new Set([
      ...pendingIdentity.map((claim) => claim.player_pool_id),
      ...approvedIdentity.map((claim) => claim.player_pool_id),
    ])];
    const identityTeamIds = [...new Set([
      ...pendingIdentity.map((claim) => claim.league_team_id),
      ...approvedIdentity.map((claim) => claim.league_team_id),
    ])];
    let identityPlayerNames = new Map<string, string>();
    let identityTeamNames = new Map<string, string>();
    if (identityPlayerIds.length > 0 && identityTeamIds.length > 0) {
      const [playersResult, identityTeamsResult] = await Promise.all([
        supabase.from("player_pool").select("id, display_name").in("id", identityPlayerIds),
        supabase.from("league_teams").select("id, name").in("id", identityTeamIds),
      ]);
      if (playersResult.error || identityTeamsResult.error) {
        queueUnavailable = true;
      } else {
        identityPlayerNames = new Map(((playersResult.data as { id: string; display_name: string }[] | null) ?? [])
          .map((player) => [player.id, player.display_name]));
        identityTeamNames = new Map(((identityTeamsResult.data as { id: string; name: string }[] | null) ?? [])
          .map((team) => [team.id, team.name]));
      }
    }
    const reportItems: AdminQueueItem[] = unresolvedReports.map((report) => {
      const statusDetail = report.status === "failed"
        ? "Stats ingest failed"
        : report.status === "needs_sides"
          ? "Needs blue-side review"
          : "Waiting for stats ingest";
      return {
        id: `report-${report.id}`,
        title: `${teamName(names, report.team_a_id)} ${report.score_a}–${report.score_b} ${teamName(names, report.team_b_id)}`,
        detail: `${statusDetail} · ${report.season} · ${timeAgo(report.submitted_at)}`,
        href: `/admin?league=${league}&season=${encodeURIComponent(season)}#match-reports`,
        action: "Review",
        type: "reports",
        icon: "file",
        createdAt: report.submitted_at,
      };
    });
    const claimItems: AdminQueueItem[] = pendingClaims.map((claim) => ({
      id: `claim-${claim.season}-${claim.summoner_name}-${claim.tag}`,
      title: `${claim.summoner_name}#${claim.tag}`,
      detail: `Card ownership · ${timeAgo(claim.created_at)}`,
      href: `/admin/claims?league=${league}&season=${encodeURIComponent(season)}`,
      action: "Review",
      type: "claims",
      icon: "people",
      createdAt: claim.created_at,
    }));
    const identityItems: AdminQueueItem[] = pendingIdentity.map((claim) => ({
      id: `identity-${claim.id}`,
      title: `${identityPlayerNames.get(claim.player_pool_id) ?? "Roster identity request"} · ${identityTeamNames.get(claim.league_team_id) ?? "Team"}`,
      detail: `Roster identity · ${timeAgo(claim.requested_at)}`,
      href: `/identity-claims?league=${league}&season=${encodeURIComponent(season)}`,
      action: "Review",
      type: "claims",
      icon: "people",
      createdAt: claim.requested_at,
    }));
    queueItems = [
      ...reportItems.slice(0, 6),
      ...claimItems.slice(0, 6),
      ...identityItems.slice(0, 6),
    ]
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));

    const activitySince = Date.now() - 14 * 24 * 60 * 60 * 1000;
    const reportActivity: AdminActivityItem[] = reports
      .filter((report) => Date.parse(report.submitted_at) >= activitySince)
      .map((report) => ({
        id: `report-${report.id}`,
        title: "Match report submitted",
        detail: `${teamName(names, report.team_a_id)} ${report.score_a}–${report.score_b} ${teamName(names, report.team_b_id)} · ${season} ${report.season_phase}`,
        occurredAt: report.submitted_at,
        timeLabel: timeAgo(report.submitted_at),
        icon: "file",
      }));
    const claimActivity: AdminActivityItem[] = approvedClaims
      .filter((claim) => Date.parse(claim.decided_at) >= activitySince)
      .map((claim) => ({
        id: `claim-${claim.season}-${claim.summoner_name}-${claim.tag}`,
        title: "Player card claim approved",
        detail: `${claim.summoner_name}#${claim.tag} · ${season}`,
        occurredAt: claim.decided_at,
        timeLabel: timeAgo(claim.decided_at),
        icon: "people",
      }));
    const identityActivity: AdminActivityItem[] = approvedIdentity
      .filter((claim) => Date.parse(claim.decided_at) >= activitySince)
      .map((claim) => ({
        id: `identity-${claim.id}`,
        title: "Roster identity approved",
        detail: `${identityPlayerNames.get(claim.player_pool_id) ?? "Player"} · ${identityTeamNames.get(claim.league_team_id) ?? "Team"} · ${season}`,
        occurredAt: claim.decided_at,
        timeLabel: timeAgo(claim.decided_at),
        icon: "people",
      }));
    recentActivity = [...reportActivity, ...claimActivity, ...identityActivity]
      .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt))
      .slice(0, 5);
  }

  return (
    <AdminConsole
      view="overview"
      isOwner={isOwner}
      isFullAdmin={canUseFullAdmin}
      league={league}
      season={season}
      featuredSeason={latestSchedule.season ?? defaultSeason}
      defaultSeasons={{ premier: leagueSeasons.premier || "S5", academy: leagueSeasons.academy || "A1" }}
      seasonOptions={seasonOptions}
      phase={phase}
      upcomingCount={upcomingFixtures.length}
      settingsAvailable={!settingsResult.error && settings !== null}
      signupsOpen={settings?.signups_open ?? false}
      homepageMode={settings?.homepage_mode ?? "auto"}
      featuredMatch={featuredFixture?.team_a && featuredFixture.team_b ? {
        teamA: featuredFixture.team_a,
        teamB: featuredFixture.team_b,
        starts: formatKickoff(featuredFixture.scheduled_at),
      } : null}
      upcoming={upcoming}
      today={today}
      canReviewQueues={isAdmin}
      queueCounts={queueCounts}
      queueItems={queueItems}
      queueUnavailable={queueUnavailable}
      recentActivity={recentActivity}
      reportQueue={reportQueue}
      reportQueueUnavailable={reportQueueUnavailable}
    >
      <section id="homepage-controls" aria-labelledby="homepage-control-title" className="flex flex-col gap-3">
        <h2 id="homepage-control-title" className="type-display text-2xl">Homepage &amp; broadcast</h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <AdminFeaturedMatchupEditor
            homepage="premier"
            fixtures={featuredFixtureChoices(premierSchedule.upcoming)}
            settings={premierSettings}
          />
          <AdminFeaturedMatchupEditor
            homepage="academy"
            fixtures={featuredFixtureChoices(academySchedule.upcoming)}
            settings={academySettings}
          />
        </div>
        {isOwner ? (
          <AdminHomepageMode homepageMode={settings?.homepage_mode ?? "auto"} />
        ) : (
          <p className="text-sm text-muted">Some league configuration is owner-only.</p>
        )}
      </section>

      {canUseFullAdmin ? <section id="daily-stu-controls" aria-labelledby="banger-control-title" className="flex flex-col gap-3">
        <h2 id="banger-control-title" className="type-display text-2xl">The Daily Stu</h2>
        <AdminBangerTitles initial={bangerTitles} />
      </section> : null}

      {canUseFullAdmin ? <section id="drafts" aria-label="Drafts" className="flex flex-col gap-4">
        <h2 className="type-display text-2xl">Drafts</h2>
        {isOwner ? (
          <DraftListClient initialDrafts={drafts} />
        ) : (
          <p className="text-sm text-muted">Draft management is owner-only.</p>
        )}
      </section> : null}

      {isOwner ? <section id="staff-controls" aria-label="Staff controls"><AdminStaff profiles={staffProfiles} /></section> : null}
    </AdminConsole>
  );
}

export default AdminPage;
