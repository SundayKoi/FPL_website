import FeaturedMatchup from "./FeaturedMatchup";
import HomeStandings from "./HomeStandings";
import AwardsDesk from "./AwardsDesk";
import LiveTicker from "./LiveTicker";
import StandingsRace from "./StandingsRace";
import UpcomingSchedule from "./UpcomingSchedule";
import TopCards from "./TopCards";
import { twitchChannelLoginFromUrl, twitchUrlFromUrl } from "@/lib/home/twitchChannels";
import type { HomepageTwitchData } from "@/lib/home/twitch";
import { buildTickerItems } from "@/lib/home/ticker";
import type { HomepageAwardsData } from "@/lib/home/awards";
import type { HomeStandingsData } from "@/lib/home/standings";
import type { HomepageScheduleData } from "@/lib/home/schedule";
import type { HomepageFeaturedSettings } from "@/lib/home/homepageSettings";
import type { TeamIdentity } from "@/lib/teams/identity";
import type { PlayerCardData } from "@/lib/cards/build";
import type { FixtureRow } from "@/lib/schedule/types";

type HomeDashboardProps = {
  ariaLabel: string;
  twitch: HomepageTwitchData;
  featuredFixture: FixtureRow | null;
  featuredSettings: HomepageFeaturedSettings;
  awards: HomepageAwardsData;
  standings: HomeStandingsData;
  /** This week's cards, best first. The homepage used to rank players by
   *  powerRanking here while the card hub ranked them by their OVR — two
   *  ladders disagreeing about who had the better week. */
  topCards: PlayerCardData[];
  schedule: HomepageScheduleData;
  identities: Record<string, TeamIdentity>;
  /** Passed through to HomeStandings; Premier omits it and keeps its default. */
  seasonLabel?: string;
  /** Where Top Cards links — Academy has its own card hub. */
  cardsBasePath?: string;
  /** Passed through to UpcomingSchedule — Academy has its own schedule page. */
  scheduleBasePath?: string;
  scheduleTeamBasePath?: string | null;
};

/**
 * The shared regular-season dashboard shell: ticker, featured matchup,
 * standings, awards, standings race, top cards, and the upcoming schedule.
 * Premier and Academy each fetch their own data and render this with their
 * league's knobs.
 */
export default function HomeDashboard({
  ariaLabel,
  twitch,
  featuredFixture,
  featuredSettings,
  awards,
  standings,
  topCards,
  schedule,
  identities,
  seasonLabel,
  cardsBasePath,
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
          <LiveTicker items={tickerItems} />
          <div className="grid gap-6 lg:grid-cols-[2fr_1fr] xl:gap-8">
            <FeaturedMatchup
              fixture={featuredFixture}
              channelLogin={twitchChannelLoginFromUrl(featuredSettings.twitchUrl)}
              clips={twitch.clips}
              streamState={twitch.status.state}
              viewerCount={twitch.status.state === "live" ? twitch.status.viewerCount : null}
              twitchUrl={twitchUrlFromUrl(featuredSettings.twitchUrl)}
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
              <TopCards cards={topCards} basePath={cardsBasePath} />
            </div>
          ) : (
            <TopCards cards={topCards} basePath={cardsBasePath} />
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
