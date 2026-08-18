import FeaturedMatchup from "./FeaturedMatchup";
import HomeStandings from "./HomeStandings";
import AwardsDesk from "./AwardsDesk";
import UpcomingSchedule from "./UpcomingSchedule";
import WeeklyStandouts from "./WeeklyStandouts";
import LeaguePageToggle from "@/components/LeaguePageToggle";
import { TWITCH_CHANNEL_LOGIN, TWITCH_URL, type HomepageTwitchData } from "@/lib/home/twitch";
import type { HomepageAwardsData } from "@/lib/home/awards";
import type { HomeStandingTeam } from "@/lib/home/standings";
import type { HomepageScheduleData } from "@/lib/home/schedule";
import type { HomepageFeaturedSettings } from "@/lib/home/homepageSettings";
import type { TeamIdentity } from "@/lib/teams/identity";
import type { WeeklyStandout } from "@/lib/stats/weekly";
import type { FixtureRow } from "@/lib/schedule/types";

type HomeDashboardProps = {
  view: "premier" | "academy";
  ariaLabel: string;
  twitch: HomepageTwitchData;
  featuredFixture: FixtureRow | null;
  featuredSettings: HomepageFeaturedSettings;
  awards: HomepageAwardsData;
  standings: HomeStandingTeam[];
  standouts: WeeklyStandout[];
  schedule: HomepageScheduleData;
  identities: Record<string, TeamIdentity>;
  /** Passed through to HomeStandings; Premier omits it and keeps its default. */
  seasonLabel?: string;
  /** Passed through to UpcomingSchedule — Academy has its own schedule page. */
  scheduleBasePath?: string;
  scheduleTeamBasePath?: string | null;
};

/**
 * The shared regular-season dashboard shell: featured matchup, standings,
 * awards, standouts, and the upcoming schedule. Premier and Academy each fetch
 * their own data and render this with their league's knobs.
 */
export default function HomeDashboard({
  view,
  ariaLabel,
  twitch,
  featuredFixture,
  featuredSettings,
  awards,
  standings,
  standouts,
  schedule,
  identities,
  seasonLabel,
  scheduleBasePath,
  scheduleTeamBasePath,
}: HomeDashboardProps) {
  return (
    <main className="bg-hash flex-1">
      <div className="mx-auto w-full max-w-[1800px] px-4 py-12 sm:px-6 sm:py-16">
        <section aria-label={ariaLabel} className="space-y-6">
          <div className="flex justify-end"><LeaguePageToggle page="home" view={view} /></div>
          <div className="grid gap-6 lg:grid-cols-[2fr_1fr] xl:gap-8">
            <FeaturedMatchup
              fixture={featuredFixture}
              channelLogin={TWITCH_CHANNEL_LOGIN}
              clips={twitch.clips}
              streamState={twitch.status.state}
              twitchUrl={TWITCH_URL}
              title={featuredSettings.title ?? undefined}
              description={featuredSettings.description ?? undefined}
            />
            <HomeStandings teams={standings} seasonLabel={seasonLabel} />
          </div>
          {/* The generated weekly write-up used to sit here. It kept asserting
              things the data did not support, so the page shows the computed
              award lists only. */}
          <AwardsDesk awards={awards} />
          <WeeklyStandouts standouts={standouts} />
          <UpcomingSchedule
            schedule={schedule}
            identities={identities}
            basePath={scheduleBasePath}
            teamBasePath={scheduleTeamBasePath}
          />
        </section>
      </div>
    </main>
  );
}
