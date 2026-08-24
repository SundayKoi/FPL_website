import HomeDashboard from "./HomeDashboard";
import { fetchHomepageTwitch, twitchChannelLoginFromUrl, type HomepageTwitchData } from "@/lib/home/twitch";
import { fetchHomepageStandings, type HomeStandingsData } from "@/lib/home/standings";
import { fetchHomepageSchedule, selectHomepageFeaturedFixture, type HomepageScheduleData } from "@/lib/home/schedule";
import { fetchHomepageAwards, PREMIER_SEASON, type HomepageAwardsData } from "@/lib/home/awards";
import { fetchHomepageFeaturedSettings, type HomepageFeaturedSettings } from "@/lib/home/homepageSettings";
import { fetchTeamIdentities } from "@/lib/teams/identity";
import { fetchLatestWeeklyStandouts, type WeeklyStandout } from "@/lib/stats/weekly";
import type { TeamIdentity } from "@/lib/teams/identity";

const fallbackTwitch: HomepageTwitchData = {
  status: { state: "unknown", reason: "request-failed" },
  clips: [],
};

const fallbackAwards: HomepageAwardsData = {
  season: PREMIER_SEASON,
  periodLabel: PREMIER_SEASON,
  playerOfWeek: {
    title: "Player of the Week",
    name: null,
    tag: null,
    teamName: null,
    detail: `${PREMIER_SEASON} player data unavailable`,
    value: "—",
  },
  teamOfWeek: {
    title: "Team of the Week",
    name: null,
    tag: null,
    teamName: null,
    detail: `${PREMIER_SEASON} team data unavailable`,
    value: "—",
  },
  individualAwards: [],
  teamAwards: [],
};

const fallbackSchedule: HomepageScheduleData = {
  season: null,
  isNewestSeason: true,
  activeStage: "week_1",
  fixtures: [],
};

const fallbackFeaturedSettings: HomepageFeaturedSettings = {
  fixtureId: null,
  title: null,
  description: null,
  twitchUrl: null,
};

async function fallbackTo<T>(load: Promise<T>, fallback: T): Promise<T> {
  try {
    return await load;
  } catch {
    return fallback;
  }
}

/** The approved post-opening homepage, stored as the Regular Season Home Page. */
export default async function RegularSeasonHomePage() {
  const [awards, standingsData, schedule, identities, standouts, featuredSettings] = await Promise.all([
    fallbackTo(fetchHomepageAwards(), fallbackAwards),
    fallbackTo<HomeStandingsData>(fetchHomepageStandings(), { teams: [], race: [] }),
    fallbackTo(fetchHomepageSchedule(), fallbackSchedule),
    fallbackTo<Record<string, TeamIdentity>>(fetchTeamIdentities(), {}),
    fallbackTo<WeeklyStandout[]>(fetchLatestWeeklyStandouts(), []),
    fallbackTo(fetchHomepageFeaturedSettings("premier"), fallbackFeaturedSettings),
  ]);
  const twitch = await fallbackTo(
    fetchHomepageTwitch(twitchChannelLoginFromUrl(featuredSettings.twitchUrl)),
    fallbackTwitch,
  );
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
