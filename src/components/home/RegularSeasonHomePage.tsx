import FeaturedMatchup from "./FeaturedMatchup";
import HomeStandings from "./HomeStandings";
import AwardsDesk from "./AwardsDesk";
import UpcomingSchedule from "./UpcomingSchedule";
import { getTwitchChannelClips, getTwitchChannelStatus } from "@/lib/twitch/status";
import { fetchHomepageStandings } from "@/lib/home/standings";
import { fetchHomepageSchedule, selectHomepageFeaturedFixture } from "@/lib/home/schedule";
import { fetchHomepageAwards } from "@/lib/home/awards";
import { fetchHomepageFeaturedSettings } from "@/lib/home/homepageSettings";
import { fetchActiveBrief } from "@/lib/home/fetchBrief";
import HomeBrief from "./HomeBrief";
import { fetchTeamIdentities } from "@/lib/teams/identity";
import WeeklyStandouts from "./WeeklyStandouts";
import { fetchLatestWeeklyStandouts } from "@/lib/stats/weekly";
import LeaguePageToggle from "@/components/LeaguePageToggle";

const TWITCH_URL = "https://www.twitch.tv/franchisepremierleague";
const TWITCH_CHANNEL_LOGIN = "franchisepremierleague";

/** The approved post-opening homepage, stored as the Regular Season Home Page. */
export default async function RegularSeasonHomePage() {
  const [twitchStatus, awards, standings, schedule, brief, identities, standouts, featuredSettings] = await Promise.all([
    getTwitchChannelStatus({
      channelLogin: TWITCH_CHANNEL_LOGIN,
    }),
    fetchHomepageAwards(),
    fetchHomepageStandings(),
    fetchHomepageSchedule(),
    fetchActiveBrief(),
    fetchTeamIdentities(),
    fetchLatestWeeklyStandouts(),
    fetchHomepageFeaturedSettings("premier"),
  ]);
  const featuredFixture = selectHomepageFeaturedFixture(schedule.fixtures, featuredSettings.fixtureId);
  const twitchClips =
    twitchStatus.state === "live"
      ? []
      : await getTwitchChannelClips({
          channelLogin: TWITCH_CHANNEL_LOGIN,
        });

  return (
    <main className="bg-hash flex-1">
      <div className="mx-auto w-full max-w-[1800px] px-4 py-12 sm:px-6 sm:py-16">
        <section aria-label="Homepage dashboard" className="space-y-6">
          <div className="flex justify-end"><LeaguePageToggle page="home" view="premier" /></div>
          <div className="grid gap-6 lg:grid-cols-[2fr_1fr] xl:gap-8">
            <FeaturedMatchup
              fixture={featuredFixture}
              channelLogin={TWITCH_CHANNEL_LOGIN}
              clips={twitchClips}
              streamState={twitchStatus.state}
              twitchUrl={TWITCH_URL}
              title={featuredSettings.title ?? undefined}
              description={featuredSettings.description ?? undefined}
            />
            <HomeStandings teams={standings} />
          </div>
          {/* Written copy replaces the computed award lists when a brief is
              published; without one the page keeps the calculated version
              rather than going blank. */}
          {brief ? <HomeBrief brief={brief} /> : <AwardsDesk awards={awards} />}
          <WeeklyStandouts standouts={standouts} />
          <UpcomingSchedule schedule={schedule} identities={identities} />
        </section>
      </div>
    </main>
  );
}
