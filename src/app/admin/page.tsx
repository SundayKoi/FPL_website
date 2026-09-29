import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { fetchStaffTier } from "@/lib/auth/staffTier";
import AdminConsole, { type AdminActivityItem, type AdminQueueItem } from "@/components/admin/AdminConsole";
import type { HomepageMode } from "@/lib/home/seasonState";
import { fetchHomepageFeaturedSettings } from "@/lib/home/homepageSettings";
import { fetchHomepageSchedule, selectHomepageFeaturedFixture } from "@/lib/home/schedule";
import { fetchAcademyDraftData } from "@/lib/academy/draft";
import { filterAcademyFixtures } from "@/lib/academy/filtering";
import { academyTeamNames } from "@/lib/league/context";
import { resolveAdminLeagueSeason } from "@/lib/admin/scope";
import { formatKickoff, stageMeta } from "@/lib/schedule/format";
import { FIXTURE_STAGES } from "@/lib/schedule/types";
import type { FixtureRow, FixtureStage } from "@/lib/schedule/types";
import type { MatchReport } from "@/lib/matches/types";

type AdminPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};
type AdminSearchParams = Record<string, string | string[] | undefined>;
type PendingIdentityRow = {
  id: string;
  player_pool_id: string;
  league_team_id: string | null;
  requested_at: string;
};
type RecentIdentityRow = {
  id: string;
  player_pool_id: string;
  league_team_id: string | null;
  decided_at: string | null;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function timeAgo(value: string, now = Date.now()) {
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

function teamName(teamNames: Map<string, string>, id: string | null) {
  return id ? teamNames.get(id) ?? "Unknown team" : "Unknown team";
}

async function loadCurrentTime() {
  return Date.now();
}

/** Concise staff dashboard. Full editors live on their route-backed workspaces. */
export default async function AdminPage({
  searchParams,
}: AdminPageProps = {}) {
  const supabase = await createServerSupabase();
  const { isAdmin, isOwner, isBroadcaster } = await fetchStaffTier(supabase);
  const isFullAdmin = isAdmin || isOwner;
  if (!isFullAdmin && !isBroadcaster) redirect("/");

  const params: AdminSearchParams = await (searchParams ?? Promise.resolve({} as AdminSearchParams));
  const requestedLeague = first(params.league);
  const homepageLeague = requestedLeague === "academy" ? "academy" : "premier";
  const [settingsResult, context, homepageSettings] = await Promise.all([
    supabase.from("league_settings").select("current_season, current_phase, signups_open, homepage_mode").eq("id", 1).single(),
    resolveAdminLeagueSeason(supabase, params),
    fetchHomepageFeaturedSettings(homepageLeague),
  ]);
  const { league, season, defaultSeasons, seasonOptions } = context;
  const settings = settingsResult.data as {
    current_season?: string | null;
    current_phase?: string | null;
    signups_open?: boolean | null;
    homepage_mode?: HomepageMode | null;
  } | null;
  const academyDraft = league === "academy" ? await fetchAcademyDraftData(supabase) : null;
  const academyNames = academyDraft ? academyTeamNames(academyDraft.teams) : new Set<string>();
  const scope = league === "academy"
    ? (fixtures: FixtureRow[]) => filterAcademyFixtures(fixtures, academyNames)
    : (fixtures: FixtureRow[]) => fixtures.filter((fixture) => /^[SA]\d+$/i.test(fixture.season) && fixture.season.toUpperCase().startsWith("S"));
  const latestSchedule = await fetchHomepageSchedule(scope);
  const displaySchedule = season === latestSchedule.season ? latestSchedule : await fetchHomepageSchedule(scope, season);
  const featuredFixture = selectHomepageFeaturedFixture(latestSchedule.upcoming, homepageSettings.fixtureId);
  const phase = displaySchedule.activeStage
    ? stageMeta(displaySchedule.activeStage).label
    : settings?.current_phase && FIXTURE_STAGES.includes(settings.current_phase as FixtureStage)
      ? stageMeta(settings.current_phase as FixtureStage).label
      : "Season setup";
  const now = await loadCurrentTime();
  const upcomingFixtures = displaySchedule.upcoming.filter((fixture) =>
    fixture.score_a === null && fixture.score_b === null && (!fixture.scheduled_at || Date.parse(fixture.scheduled_at) >= now),
  );
  const upcoming = upcomingFixtures.slice(0, 4).map((fixture) => ({
    id: fixture.id,
    matchup: `${fixture.team_a ?? "TBD"} vs ${fixture.team_b ?? "TBD"}`,
    starts: formatKickoff(fixture.scheduled_at),
    status: "Scheduled",
  }));
  const today = new Intl.DateTimeFormat("en-US", {
    weekday: "short", day: "2-digit", month: "short", timeZone: "America/Chicago",
  }).format(new Date()).toUpperCase();

  let queueCounts = { reports: 0, claims: 0 };
  let queueItems: AdminQueueItem[] = [];
  let recentActivity: AdminActivityItem[] = [];
  let queueUnavailable = false;
  if (isAdmin) {
    const [reportsResult, cardClaimsResult, identityClaimsResult, reportActivityResult, cardActivityResult, identityActivityResult] = await Promise.all([
      supabase.from("match_reports").select("id, fixture_id, team_a_id, team_b_id, score_a, score_b, season, season_phase, status, submitted_at", { count: "exact" })
        .eq("season", season).in("status", ["pending", "needs_sides", "failed"]).order("submitted_at", { ascending: false }).limit(6),
      supabase.from("card_claims").select("season, summoner_name, tag, created_at", { count: "exact" })
        .eq("season", season).eq("status", "pending").order("created_at", { ascending: false }).limit(6),
      supabase.from("player_identity_links").select("id, player_pool_id, league_team_id, requested_at", { count: "exact" })
        .eq("league", league).eq("season", season).eq("status", "pending").order("requested_at", { ascending: false }).limit(6),
      supabase.from("match_reports").select("id, team_a_id, team_b_id, score_a, score_b, season, season_phase, submitted_at")
        .eq("season", season).order("submitted_at", { ascending: false }).limit(8),
      supabase.from("card_claims").select("season, summoner_name, tag, decided_at").eq("season", season).eq("status", "approved")
        .order("decided_at", { ascending: false }).limit(8),
      supabase.from("player_identity_links").select("id, player_pool_id, league_team_id, decided_at").eq("league", league).eq("season", season).eq("status", "approved")
        .order("decided_at", { ascending: false }).limit(8),
    ]);
    queueUnavailable = Boolean(
      reportsResult.error || reportsResult.count === null || cardClaimsResult.error || cardClaimsResult.count === null
      || identityClaimsResult.error || identityClaimsResult.count === null || reportActivityResult.error
      || cardActivityResult.error || identityActivityResult.error,
    );
    queueCounts = {
      reports: reportsResult.count ?? 0,
      claims: (cardClaimsResult.count ?? 0) + (identityClaimsResult.count ?? 0),
    };

    const reports = (reportsResult.data as Array<Pick<MatchReport, "id" | "fixture_id" | "team_a_id" | "team_b_id" | "score_a" | "score_b" | "season" | "season_phase" | "status" | "submitted_at">> | null) ?? [];
    const pendingClaims = (cardClaimsResult.data as { season: string; summoner_name: string; tag: string; created_at: string }[] | null) ?? [];
    const pendingIdentity = ((identityClaimsResult.data as PendingIdentityRow[] | null) ?? []).filter((row): row is PendingIdentityRow & { league_team_id: string } => Boolean(row.league_team_id));
    const approvedClaims = ((cardActivityResult.data as { season: string; summoner_name: string; tag: string; decided_at: string | null }[] | null) ?? []).filter(
      (row): row is { season: string; summoner_name: string; tag: string; decided_at: string } => Boolean(row.decided_at),
    );
    const approvedIdentity = ((identityActivityResult.data as RecentIdentityRow[] | null) ?? []).filter(
      (row): row is RecentIdentityRow & { league_team_id: string; decided_at: string } => Boolean(row.league_team_id && row.decided_at),
    );
    const reportActivityRows = (reportActivityResult.data as Array<Pick<MatchReport, "id" | "team_a_id" | "team_b_id" | "score_a" | "score_b" | "season" | "season_phase" | "submitted_at">> | null) ?? [];
    const activityNamesIds = [...new Set([
      ...reports.flatMap((row) => [row.team_a_id, row.team_b_id]),
      ...reportActivityRows.flatMap((row) => [row.team_a_id, row.team_b_id]),
      ...pendingIdentity.map((row) => row.league_team_id),
      ...approvedIdentity.map((row) => row.league_team_id),
    ].filter((id): id is string => Boolean(id)))];
    const playerIds = [...new Set([...pendingIdentity.map((row) => row.player_pool_id), ...approvedIdentity.map((row) => row.player_pool_id)])];
    const [teamsResult, playersResult] = await Promise.all([
      activityNamesIds.length ? supabase.from("league_teams").select("id, name").in("id", activityNamesIds) : Promise.resolve({ data: [], error: null }),
      playerIds.length ? supabase.from("player_pool").select("id, display_name").in("id", playerIds) : Promise.resolve({ data: [], error: null }),
    ]);
    if (teamsResult.error || playersResult.error) queueUnavailable = true;
    const teamNames = new Map(((teamsResult.data as { id: string; name: string }[] | null) ?? []).map((row) => [row.id, row.name]));
    const playerNames = new Map(((playersResult.data as { id: string; display_name: string }[] | null) ?? []).map((row) => [row.id, row.display_name]));

    const reportItems: AdminQueueItem[] = reports.map((report) => ({
      id: `report-${report.id}`,
      title: `${teamName(teamNames, report.team_a_id)} ${report.score_a}–${report.score_b} ${teamName(teamNames, report.team_b_id)}`,
      detail: `${report.status === "failed" ? "Stats ingest failed" : report.status === "needs_sides" ? "Needs blue-side review" : "Waiting for stats ingest"} · ${report.season} · ${timeAgo(report.submitted_at)}`,
      href: `/admin/reviews?league=${league}&season=${encodeURIComponent(season)}&report=${encodeURIComponent(report.id)}#report-${encodeURIComponent(report.id)}`,
      action: "Review", type: "reports", icon: "file", createdAt: report.submitted_at,
    }));
    const claimItems: AdminQueueItem[] = pendingClaims.map((claim) => ({
      id: `claim-${claim.season}-${claim.summoner_name}-${claim.tag}`,
      title: `${claim.summoner_name}#${claim.tag}`,
      detail: `Card ownership · ${timeAgo(claim.created_at)}`,
      href: `/admin/claims?league=${league}&season=${encodeURIComponent(season)}`,
      action: "Review", type: "claims", icon: "people", createdAt: claim.created_at,
    }));
    const identityItems: AdminQueueItem[] = pendingIdentity.map((claim) => ({
      id: `identity-${claim.id}`,
      title: `${playerNames.get(claim.player_pool_id) ?? "Roster identity request"} · ${teamNames.get(claim.league_team_id) ?? "Team"}`,
      detail: `Roster identity · ${timeAgo(claim.requested_at)}`,
      href: `/admin/reviews/identity?league=${league}&season=${encodeURIComponent(season)}&record=${encodeURIComponent(claim.id)}#identity-${encodeURIComponent(claim.id)}`,
      action: "Review", type: "claims", icon: "people", createdAt: claim.requested_at,
    }));
    queueItems = [...reportItems, ...claimItems, ...identityItems]
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));

    const cutoff = now - 14 * 24 * 60 * 60 * 1000;
    const recentReports: AdminActivityItem[] = reportActivityRows
      .filter((row) => Date.parse(row.submitted_at) >= cutoff)
      .map((row) => ({
        id: `report-${row.id}`, title: "Match report submitted",
        detail: `${teamName(teamNames, row.team_a_id)} ${row.score_a}–${row.score_b} ${teamName(teamNames, row.team_b_id)} · ${row.season} ${row.season_phase}`,
        occurredAt: row.submitted_at, timeLabel: timeAgo(row.submitted_at), icon: "file",
      }));
    const claimActivity: AdminActivityItem[] = approvedClaims
      .filter((row) => Date.parse(row.decided_at) >= cutoff)
      .map((row) => ({
        id: `claim-${row.season}-${row.summoner_name}-${row.tag}`, title: "Player card claim approved",
        detail: `${row.summoner_name}#${row.tag} · ${row.season}`, occurredAt: row.decided_at, timeLabel: timeAgo(row.decided_at), icon: "people",
      }));
    const identityActivity: AdminActivityItem[] = approvedIdentity
      .filter((row) => Date.parse(row.decided_at) >= cutoff)
      .map((row) => ({
        id: `identity-${row.id}`, title: "Roster identity approved",
        detail: `${playerNames.get(row.player_pool_id) ?? "Player"} · ${teamNames.get(row.league_team_id) ?? "Team"} · ${season}`,
        occurredAt: row.decided_at, timeLabel: timeAgo(row.decided_at), icon: "people",
      }));
    recentActivity = [...recentReports, ...claimActivity, ...identityActivity]
      .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt)).slice(0, 5);
  }

  return (
    <AdminConsole
      view="overview"
      isOwner={isOwner}
      isFullAdmin={isFullAdmin}
      league={league}
      season={season}
      featuredSeason={latestSchedule.season ?? defaultSeasons[league]}
      defaultSeasons={defaultSeasons}
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
    />
  );
}
