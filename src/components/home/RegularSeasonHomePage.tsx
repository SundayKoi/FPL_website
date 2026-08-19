import HomeDashboard from "./HomeDashboard";
import { fetchHomepageTwitch } from "@/lib/home/twitch";
import { fetchHomepageStandings } from "@/lib/home/standings";
import { fetchHomepageSchedule, selectHomepageFeaturedFixture } from "@/lib/home/schedule";
import { fetchHomepageAwards } from "@/lib/home/awards";
import { fetchHomepageFeaturedSettings } from "@/lib/home/homepageSettings";
import { fetchTeamIdentities } from "@/lib/teams/identity";
import { fetchLatestWeeklyStandouts } from "@/lib/stats/weekly";

/** The approved post-opening homepage, stored as the Regular Season Home Page. */
export default async function RegularSeasonHomePage() {
  const [twitch, awards, standingsData, schedule, identities, standouts, featuredSettings] = await Promise.all([
    fetchHomepageTwitch(),
    fetchHomepageAwards(),
    fetchHomepageStandings(),
    fetchHomepageSchedule(),
    fetchTeamIdentities(),
    fetchLatestWeeklyStandouts(),
    fetchHomepageFeaturedSettings("premier"),
  ]);
  const featuredFixture = selectHomepageFeaturedFixture(schedule.fixtures, featuredSettings.fixtureId);

  return (
    <HomeDashboard
      view="premier"
      ariaLabel="Homepage dashboard"
      twitch={twitch}
      featuredFixture={featuredFixture}
      featuredSettings={featuredSettings}
      awards={awards}
      standings={standingsData}
      standouts={standouts}
      schedule={schedule}
      identities={identities}
    />
  );
}
