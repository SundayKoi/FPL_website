import type { ReactElement } from "react";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { fetchStaffTier, isMissingBroadcasterColumn } from "@/lib/auth/staffTier";
import type { Draft } from "@/lib/draft/types";
import DraftListClient from "@/components/admin/DraftListClient";
import AdminConsole from "@/components/admin/AdminConsole";
import AdminHomepageMode from "@/components/admin/AdminHomepageMode";
import AdminStaff, { type StaffProfile } from "@/components/admin/AdminStaff";
import AdminFeaturedMatchupEditor, { type FeaturedFixtureChoice } from "@/components/admin/AdminFeaturedMatchupEditor";
import AdminBangerTitles from "@/components/admin/AdminBangerTitles";
import AdminGodPackPreview from "@/components/admin/AdminGodPackPreview";
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
  const now = new Date().getTime();
  const upcomingFixtures = displaySchedule.upcoming.filter((fixture) =>
    fixture.score_a === null &&
    fixture.score_b === null &&
    (!fixture.scheduled_at || new Date(fixture.scheduled_at).getTime() >= now),
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

  return (
    <AdminConsole
      view="overview"
      isOwner={isOwner}
      isFullAdmin={canUseFullAdmin}
      league={league}
      season={season}
      defaultSeasons={{ premier: leagueSeasons.premier || "S5", academy: leagueSeasons.academy || "A1" }}
      seasonOptions={seasonOptions}
      phase={phase}
      upcomingCount={upcomingFixtures.length}
      signupsOpen={settings?.signups_open ?? false}
      homepageMode={settings?.homepage_mode ?? "auto"}
      featuredMatch={featuredFixture?.team_a && featuredFixture.team_b ? {
        teamA: featuredFixture.team_a,
        teamB: featuredFixture.team_b,
        starts: formatKickoff(featuredFixture.scheduled_at),
      } : null}
      upcoming={upcoming}
      today={today}
    >
      {canUseFullAdmin ? <section id="god-pack-preview" aria-label="God Pack preview"><AdminGodPackPreview /></section> : null}

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
