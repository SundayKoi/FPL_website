import HomeOrientation from "./HomeOrientation";
import SiteDirectoryGrid from "./SiteDirectoryGrid";
import FeaturedMatchup from "./FeaturedMatchup";
import HomeStandings from "./HomeStandings";
import AwardsDesk from "./AwardsDesk";
import LiveTicker from "./LiveTicker";
import StandingsRace from "./StandingsRace";
import UpcomingSchedule from "./UpcomingSchedule";
import HomeMatchStrip from "./HomeMatchStrip";
import PlayerOfWeekSpotlight from "./PlayerOfWeekSpotlight";
import TopCards from "./TopCards";
import HomeCardsPromo from "./HomeCardsPromo";
import HomeFooter from "./HomeFooter";
import HomePlayoffBracket from "./HomePlayoffBracket";
import { twitchChannelLoginFromUrl, twitchUrlFromUrl } from "@/lib/home/twitchChannels";
import type { HomepageTwitchData } from "@/lib/home/twitch";
import { buildTickerItems } from "@/lib/home/ticker";
import { hasResult } from "@/lib/schedule/format";
import { selectFutureHomepageFixtures } from "@/lib/home/schedule";
import type { HomepageAwardsData } from "@/lib/home/awards";
import type { HomeStandingsData } from "@/lib/home/standings";
import type { HomepageScheduleData } from "@/lib/home/schedule";
import type { HomepageFeaturedSettings } from "@/lib/home/homepageSettings";
import type { TeamIdentity } from "@/lib/teams/identity";
import type { PlayerCardData } from "@/lib/cards/build";
import type { FixtureRow } from "@/lib/schedule/types";
import type { HomeViewer } from "@/lib/home/viewer";
import type { HomeAppearance } from "./appearance";
import styles from "./HomeWorkspace.module.css";

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
  /** Who is looking — decides the third door of the orientation block. */
  viewer?: HomeViewer;
  appearance?: HomeAppearance;
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
  viewer = "signed-out",
  appearance = "legacy",
}: HomeDashboardProps) {
  const workspace = appearance === "workspace";
  const league = cardsBasePath?.startsWith("/academy") ? "academy" : "premier";
  const isLive = twitch.status.state === "live";
  const tickerItems = buildTickerItems({
    live: isLive,
    fixtures: schedule.fixtures,
    standings: standings.teams,
    awards,
  });
  const scheduleHref = scheduleBasePath ?? (league === "academy" ? "/academy/schedule" : "/schedule");
  const standingsHref = league === "academy" ? "/academy/standings" : "/standings";
  const teamBasePath = scheduleTeamBasePath === undefined
    ? league === "academy" ? null : "/teams"
    : scheduleTeamBasePath;
  const upcomingFixtures = schedule.upcoming ?? [];
  const stripFixtures = selectFutureHomepageFixtures(
    upcomingFixtures.length > 0 ? upcomingFixtures : schedule.fixtures,
    schedule.asOf ?? 0,
  ).slice(0, 4);
  const stripFixtureIds = new Set(stripFixtures.map((fixture) => fixture.id));
  const matchCenterFixtures = upcomingFixtures
    .filter((fixture) => hasResult(fixture) && !stripFixtureIds.has(fixture.id))
    .slice(-4);

  if (workspace) {
    return <main className={`${styles.page} ${styles.identityHome}`} data-appearance="workspace">
      <FeaturedMatchup
        fixture={featuredFixture} identities={identities} teamBasePath={teamBasePath}
        scheduleHref={scheduleHref} seasonLabel={seasonLabel ?? schedule.season ?? undefined}
        channelLogin={twitchChannelLoginFromUrl(featuredSettings.twitchUrl)}
        clips={twitch.clips} streamState={twitch.status.state}
        viewerCount={twitch.status.state === "live" ? twitch.status.viewerCount : null}
        twitchUrl={twitchUrlFromUrl(featuredSettings.twitchUrl)}
        title={featuredSettings.title ?? undefined} description={featuredSettings.description ?? undefined}
        appearance="workspace"
      />
      <div className={styles.newStripBand}>
        <div className={styles.bandInner}>
          <HomeMatchStrip
            fixtures={stripFixtures}
            identities={identities}
            season={seasonLabel ?? schedule.season}
            scheduleHref={scheduleHref}
            channelState={twitch.status.state}
          />
        </div>
      </div>
      <div className={styles.bracketBand}>
        <div className={styles.bandInner}>
          <HomePlayoffBracket
            season={seasonLabel ?? schedule.season}
            activeStage={schedule.activeStage}
            fixtures={schedule.seasonFixtures ?? schedule.upcoming ?? schedule.fixtures}
            seeds={standings.playoffSeeds}
            overallSeeds={standings.overallPlayoffSeeds}
            seedMode={league === "academy" ? "league-wide" : "divisions"}
            identities={identities}
            scheduleHref={scheduleHref}
            teamBasePath={teamBasePath}
          />
        </div>
      </div>
      <HomeCardsPromo cards={topCards} basePath={cardsBasePath} />
      <div className={styles.secondaryLinks}><div className={styles.bandInner}><SiteDirectoryGrid league={league} appearance="workspace" /></div></div>
      <HomeFooter />
    </main>;
  }

  return (
    <main className={workspace ? styles.page : "page-backdrop flex-1"} data-appearance={appearance}>
      <div className={workspace ? styles.container : "page-container page-spacing w-full"}>
        <section aria-label={ariaLabel} className={workspace ? styles.content : "space-y-6"}>
          {workspace ? (
            <>
              <HomeMatchStrip
                fixtures={stripFixtures}
                identities={identities}
                season={seasonLabel ?? schedule.season}
                scheduleHref={scheduleHref}
                channelState={twitch.status.state}
              />
              <HomeOrientation
                league={league}
                viewer={viewer}
                fixture={featuredFixture}
                seasonLabel={seasonLabel ?? schedule.season}
                appearance={appearance}
                workspacePart="intro"
              />
              <div className={styles.featureGrid}>
                <FeaturedMatchup
                  fixture={featuredFixture}
                  identities={identities}
                  standings={standings.teams}
                  teamBasePath={teamBasePath}
                  scheduleHref={scheduleHref}
                  channelLogin={twitchChannelLoginFromUrl(featuredSettings.twitchUrl)}
                  clips={twitch.clips}
                  streamState={twitch.status.state}
                  viewerCount={twitch.status.state === "live" ? twitch.status.viewerCount : null}
                  twitchUrl={twitchUrlFromUrl(featuredSettings.twitchUrl)}
                  title={featuredSettings.title ?? undefined}
                  description={featuredSettings.description ?? undefined}
                  appearance={appearance}
                />
                <PlayerOfWeekSpotlight awards={awards} cards={topCards} identities={identities} />
              </div>
              <HomeStandings
                teams={standings.teams}
                identities={identities}
                standingsHref={standingsHref}
                teamBasePath={teamBasePath}
                seasonLabel={seasonLabel ?? schedule.season ?? undefined}
                appearance={appearance}
              />
              <UpcomingSchedule
                schedule={schedule}
                identities={identities}
                basePath={scheduleHref}
                teamBasePath={teamBasePath}
                appearance={appearance}
              />
              <HomeMatchStrip
                fixtures={matchCenterFixtures}
                identities={identities}
                season={seasonLabel ?? schedule.season}
                scheduleHref={scheduleHref}
                title="MATCH CENTER"
              />
              <HomeOrientation
                league={league}
                viewer={viewer}
                fixture={featuredFixture}
                seasonLabel={seasonLabel ?? schedule.season}
                appearance={appearance}
                workspacePart="supporting"
              />
              {/* The awards desk keeps team and category honors below the
                  promoted player spotlight. */}
              <AwardsDesk awards={awards} appearance={appearance} omitPlayerOfWeekHero />
            </>
          ) : (
            <>
              <HomeOrientation
                league={league}
                viewer={viewer}
                fixture={featuredFixture}
                seasonLabel={seasonLabel ?? schedule.season}
                appearance={appearance}
              />
              <LiveTicker items={tickerItems} appearance={appearance} />
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
                  appearance={appearance}
                />
                <HomeStandings teams={standings.teams} seasonLabel={seasonLabel} appearance={appearance} />
              </div>
              <UpcomingSchedule
                schedule={schedule}
                identities={identities}
                basePath={scheduleBasePath}
                teamBasePath={scheduleTeamBasePath}
                appearance={appearance}
              />
              <AwardsDesk awards={awards} appearance={appearance} />
            </>
          )}
          {/* The generated weekly write-up stays out of both versions: only
              persisted, calculable awards are shown. */}
          {standings.race.length > 0 ? (
            <div className="grid gap-6 lg:grid-cols-2 xl:gap-8">
              <StandingsRace race={standings.race} appearance={appearance} />
              <TopCards cards={topCards} basePath={cardsBasePath} appearance={appearance} />
            </div>
          ) : (
            <TopCards cards={topCards} basePath={cardsBasePath} appearance={appearance} />
          )}
          <SiteDirectoryGrid league={league} appearance={appearance} />
        </section>
      </div>
    </main>
  );
}
