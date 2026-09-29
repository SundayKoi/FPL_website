import { redirect } from "next/navigation";
import Link from "next/link";
import AdminBangerTitles from "@/components/admin/AdminBangerTitles";
import AdminFeaturedMatchupEditor, { type FeaturedFixtureChoice } from "@/components/admin/AdminFeaturedMatchupEditor";
import AdminHomepageMode from "@/components/admin/AdminHomepageMode";
import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import AdminInfoResources from "@/components/info/AdminInfoResources";
import { fetchStaffTier } from "@/lib/auth/staffTier";
import { fetchAcademyDraftData } from "@/lib/academy/draft";
import { academyTeamNames } from "@/lib/league/context";
import { DEFAULT_BANGER_BOARD_SETTINGS, fetchBangerBoardSettings } from "@/lib/bangers/settings";
import { fetchHomepageFeaturedSettings } from "@/lib/home/homepageSettings";
import { fetchHomepageSchedule } from "@/lib/home/schedule";
import { filterAcademyFixtures } from "@/lib/academy/filtering";
import { createServerSupabase } from "@/lib/supabase/server";
import { getInfoPageData } from "@/lib/info/resources";
import { stageMeta } from "@/lib/schedule/format";
import type { FixtureRow } from "@/lib/schedule/types";

export const metadata = { title: "Content & broadcast — FPL Admin" };

function fixtureChoices(fixtures: FixtureRow[]): FeaturedFixtureChoice[] {
  return fixtures.map((fixture) => ({
    id: fixture.id,
    label: `${stageMeta(fixture.stage).label}${fixture.division ? ` · ${fixture.division}` : ""} · ${fixture.team_a ?? "TBD"} vs ${fixture.team_b ?? "TBD"}`,
  }));
}

export default async function AdminContentPage() {
  const supabase = await createServerSupabase();
  const tier = await fetchStaffTier(supabase);
  const isStaff = tier.isAdmin || tier.isOwner || tier.isBroadcaster;
  if (!isStaff) redirect("/");

  const [premierSettings, academySettings, premierSchedule, academyDraft, globalSettings, bangerTitles, infoData] = await Promise.all([
    fetchHomepageFeaturedSettings("premier"),
    fetchHomepageFeaturedSettings("academy"),
    fetchHomepageSchedule((fixtures) => fixtures.filter((fixture) => fixture.season.startsWith("S"))),
    fetchAcademyDraftData(supabase),
    tier.isOwner
      ? supabase.from("league_settings").select("homepage_mode").eq("id", 1).single()
      : Promise.resolve({ data: null, error: null }),
    tier.isAdmin || tier.isOwner ? fetchBangerBoardSettings() : Promise.resolve(null),
    tier.isAdmin ? getInfoPageData() : Promise.resolve(null),
  ]);
  const academyNames = academyTeamNames(academyDraft.teams);
  const academySchedule = await fetchHomepageSchedule((fixtures) => filterAcademyFixtures(fixtures, academyNames));

  return (
    <main className="page-backdrop mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 text-content sm:px-6 lg:px-8">
      <AdminSectionHeader
        title="Content & broadcast"
        description="Featured matchups belong to each league. Homepage mode and The Daily Stu are site-wide controls."
      />

      <section id="homepage-controls" className="flex flex-col gap-4" aria-labelledby="featured-heading">
        <div>
          <p className="label-dash">League-specific</p>
          <h2 id="featured-heading" className="type-display mt-1 text-2xl">Featured matchups</h2>
          <p className="mt-1 text-sm text-muted">Each editor offers upcoming fixtures from the matching league, including the playoff bracket ahead.</p>
        </div>
        <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2">
          <AdminFeaturedMatchupEditor homepage="premier" fixtures={fixtureChoices(premierSchedule.upcoming)} settings={premierSettings} />
          <AdminFeaturedMatchupEditor homepage="academy" fixtures={fixtureChoices(academySchedule.upcoming)} settings={academySettings} />
        </div>
      </section>

      {tier.isOwner ? (
        <section className="card-brand flex flex-col gap-3 p-4 sm:p-5" aria-label="Site-wide homepage mode">
          <p className="label-dash">Site-wide · owner access</p>
          {globalSettings.error ? <p role="alert" className="text-sm text-red-300">Homepage mode is unavailable.</p> : null}
          <AdminHomepageMode homepageMode={globalSettings.data?.homepage_mode ?? "auto"} />
        </section>
      ) : (
        <p className="text-xs text-muted">Homepage mode is site-wide and owner-only.</p>
      )}

      {tier.isAdmin || tier.isOwner ? (
        <section id="daily-stu-controls" className="flex flex-col gap-3" aria-labelledby="stu-heading">
          <div>
            <p className="label-dash">Site-wide</p>
            <h2 id="stu-heading" className="type-display mt-1 text-2xl">The Daily Stu</h2>
          </div>
          <AdminBangerTitles initial={bangerTitles ?? DEFAULT_BANGER_BOARD_SETTINGS} />
        </section>
      ) : null}

      {tier.isAdmin && infoData ? (
        <section className="flex flex-col gap-3" aria-labelledby="resources-heading">
          <div>
            <p className="label-dash">Site-wide</p>
            <h2 id="resources-heading" className="type-display mt-1 text-2xl">Information resources</h2>
          </div>
          <AdminInfoResources resources={infoData.resources} />
        </section>
      ) : null}

      <section className="card-brand flex flex-col gap-3 p-4 sm:p-5" aria-label="Announcement preparation">
        <div>
          <p className="label-dash">Prepared content</p>
          <h2 className="type-display mt-1 text-xl">Announcements</h2>
          <p className="mt-1 text-sm text-muted">Prepare channel posts and rarity announcements in the focused publisher.</p>
        </div>
        <Link href="/admin/announce" className="w-fit rounded border border-border-strong px-3 py-2 text-sm text-action-text hover:border-action-text">Open announcement desk →</Link>
      </section>
    </main>
  );
}
