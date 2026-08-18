import FeaturedMatchup from "./FeaturedMatchup";
import HomeStandings from "./HomeStandings";
import AwardsDesk from "./AwardsDesk";
import UpcomingSchedule from "./UpcomingSchedule";
import WeeklyStandouts from "./WeeklyStandouts";
import { getTwitchChannelClips, getTwitchChannelStatus } from "@/lib/twitch/status";
import { fetchHomepageStandings } from "@/lib/home/standings";
import { fetchHomepageSchedule, selectHomepageFeaturedFixture } from "@/lib/home/schedule";
import { fetchHomepageAwards } from "@/lib/home/awards";
import { fetchHomepageFeaturedSettings } from "@/lib/home/homepageSettings";
import { fetchTeamIdentities } from "@/lib/teams/identity";
import { fetchLatestWeeklyStandouts } from "@/lib/stats/weekly";
import { createServerSupabase } from "@/lib/supabase/server";
import { fetchAcademyDraftData } from "@/lib/academy/draft";
import { filterAcademyFixtures } from "@/lib/academy/filtering";
import { academyTeamNames } from "@/lib/league/context";
import { fetchLeagueSeasons } from "@/lib/league/season";
import LeaguePageToggle from "@/components/LeaguePageToggle";

// Academy plays on the league's channel, same broadcast as Premier.
const TWITCH_URL = "https://www.twitch.tv/franchisepremierleague";
const TWITCH_CHANNEL_LOGIN = "franchisepremierleague";

/**
 * The Academy homepage: the same dashboard as the Premier regular-season home
 * (featured matchup, standings, awards, standouts, upcoming schedule),
 * every panel scoped to the Academy draft's teams and the Academy season code.
 */
export default async function AcademyHomePage() {
  const supabase = await createServerSupabase();
  const [draftData, seasons] = await Promise.all([
    fetchAcademyDraftData(supabase),
    fetchLeagueSeasons(supabase),
  ]);
  const teamNameSet = academyTeamNames(draftData.teams);
  const teamNames = draftData.teams.map((team) => team.name);

  const [twitchStatus, awards, standings, schedule, identities, standouts, featuredSettings] = await Promise.all([
    getTwitchChannelStatus({ channelLogin: TWITCH_CHANNEL_LOGIN }),
    fetchHomepageAwards(seasons.academy, teamNames, "academy_draft_id"),
    fetchHomepageStandings(seasons.academy, teamNames, "academy_draft_id"),
    fetchHomepageSchedule((fixtures) => filterAcademyFixtures(fixtures, teamNameSet)),
    fetchTeamIdentities("academy_draft_id"),
    fetchLatestWeeklyStandouts(5, seasons.academy, teamNames),
    fetchHomepageFeaturedSettings("academy"),
  ]);
  const featuredFixture = selectHomepageFeaturedFixture(schedule.fixtures, featuredSettings.fixtureId);
  const twitchClips =
    twitchStatus.state === "live"
      ? []
      : await getTwitchChannelClips({ channelLogin: TWITCH_CHANNEL_LOGIN });

  return (
    <main className="bg-hash flex-1">
      <div className="mx-auto w-full max-w-[1800px] px-4 py-12 sm:px-6 sm:py-16">
        <section aria-label="Academy homepage dashboard" className="space-y-6">
          <div className="flex justify-end"><LeaguePageToggle page="home" view="academy" /></div>
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
            <HomeStandings teams={standings} seasonLabel={seasons.academy} />
          </div>
          {/* The generated weekly write-up used to sit here. It kept asserting
              things the data did not support, so the page shows the computed
              award lists only. */}
          <AwardsDesk awards={awards} />
          <WeeklyStandouts standouts={standouts} />
          <UpcomingSchedule schedule={schedule} identities={identities} basePath="/academy/schedule" teamBasePath={null} />
        </section>
      </div>
    </main>
  );
}
