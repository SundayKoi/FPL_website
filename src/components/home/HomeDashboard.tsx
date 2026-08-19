import FeaturedMatchup from "./FeaturedMatchup";
import HomeStandings from "./HomeStandings";
import AwardsDesk from "./AwardsDesk";
import LiveTicker from "./LiveTicker";
import StandingsRace from "./StandingsRace";
import UpcomingSchedule from "./UpcomingSchedule";
import WeeklyStandouts from "./WeeklyStandouts";
import LeaguePageToggle from "@/components/LeaguePageToggle";
import { TWITCH_CHANNEL_LOGIN, TWITCH_URL, type HomepageTwitchData } from "@/lib/home/twitch";
import { buildTickerItems } from "@/lib/home/ticker";
import type { HomepageAwardsData } from "@/lib/home/awards";
import type { HomeStandingsData } from "@/lib/home/standings";
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
  standings: HomeStandingsData;
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
 * The shared regular-season dashboard shell: ticker, featured matchup,
 * standings, awards, standings race, standouts, and the upcoming schedule.
 * Premier and Academy each fetch their own data and render this with their
 * league's knobs.
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
  const isLive = twitch.status.state === "live";
  const tickerItems = buildTickerItems({
    live: isLive,
    fixtures: schedule.fixtures,
    standings: standings.teams,
    awards,
  });

  return (
    <main className="bg-hash flex-1">
      <div className="mx-auto w-full max-w-[1800px] px-4 py-12 sm:px-6 sm:py-16">
        <section aria-label={ariaLabel} className="space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <LiveTicker items={tickerItems} />
            </div>
            <div className="flex shrink-0 justify-end">
              <LeaguePageToggle page="home" view={view} />
            </div>
          </div>
          <div className="grid gap-6 lg:grid-cols-[2fr_1fr] xl:gap-8">
            <FeaturedMatchup
              fixture={featuredFixture}
              channelLogin={TWITCH_CHANNEL_LOGIN}
              clips={twitch.clips}
              streamState={twitch.status.state}
              viewerCount={twitch.status.state === "live" ? twitch.status.viewerCount : null}
              twitchUrl={TWITCH_URL}
              title={featuredSettings.title ?? undefined}
              description={featuredSettings.description ?? undefined}
            />
            <HomeStandings teams={standings.teams} seasonLabel={seasonLabel} />
          </div>
          {/* The generated weekly write-up used to sit here. It kept asserting
              things the data did not support, so the page shows the computed
              award lists only. */}
          <AwardsDesk awards={awards} />
          {standings.race.length > 0 ? (
            <div className="grid gap-6 lg:grid-cols-2 xl:gap-8">
              <StandingsRace race={standings.race} />
              <WeeklyStandouts standouts={standouts} />
            </div>
          ) : (
            <WeeklyStandouts standouts={standouts} />
          )}
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
