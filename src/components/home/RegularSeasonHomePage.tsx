import HomeDashboard from "./HomeDashboard";
import { homeViewer } from "@/lib/home/viewer";
import { fetchHomepageTwitch, twitchChannelLoginFromUrl, type HomepageTwitchData } from "@/lib/home/twitch";
import { fetchHomepageStandings, type HomeStandingsData } from "@/lib/home/standings";
import { alignFuturePremierHomeFixturesToMonday, fetchHomepageSchedule, selectHomepageFeaturedFixture, type HomepageScheduleData } from "@/lib/home/schedule";
import { fetchHomepageAwards, PREMIER_SEASON, type HomepageAwardsData } from "@/lib/home/awards";
import { fetchHomepageFeaturedSettings, type HomepageFeaturedSettings } from "@/lib/home/homepageSettings";
import { fetchTeamIdentities } from "@/lib/teams/identity";
import { fetchCardSeason, fetchCurrentWeekCards } from "@/lib/cards/queries";
import { createServerSupabase } from "@/lib/supabase/server";
import type { PlayerCardData } from "@/lib/cards/build";
import type { TeamIdentity } from "@/lib/teams/identity";

const fallbackTwitch: HomepageTwitchData = {
  status: { state: "unknown", reason: "request-failed" },
  clips: [],
};

function fallbackAwards(season: string): HomepageAwardsData {
  return {
    season,
    periodLabel: season,
    periodKey: null,
    playerOfWeek: {
      title: "Player of the Week",
      name: null,
      tag: null,
      teamName: null,
      detail: `${season} player data unavailable`,
      value: "—",
    },
    teamOfWeek: {
      title: "Team of the Week",
      name: null,
      tag: null,
      teamName: null,
      detail: `${season} team data unavailable`,
      value: "—",
    },
    individualAwards: [],
    teamAwards: [],
  };
}

const fallbackSchedule: HomepageScheduleData = {
  season: null,
  isNewestSeason: true,
  activeStage: "week_1",
  fixtures: [],
  upcoming: [],
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
  const settingsPromise = fallbackTo(fetchHomepageFeaturedSettings("premier"), fallbackFeaturedSettings);
  const twitchPromise = settingsPromise.then((settings) => fallbackTo(
    fetchHomepageTwitch(twitchChannelLoginFromUrl(settings.twitchUrl)), fallbackTwitch,
  ));
  const { supabase, season } = await (async () => {
    try {
      const client = await createServerSupabase();
      return { supabase: client, season: (await fetchCardSeason(client, "premier")) ?? PREMIER_SEASON };
    } catch {
      return { supabase: null, season: PREMIER_SEASON };
    }
  })();
  const [awards, standingsData, schedule, identities, topCards, featuredSettings, viewer, twitch] = await Promise.all([
    fallbackTo(fetchHomepageAwards(season), fallbackAwards(season)),
    fallbackTo<HomeStandingsData>(fetchHomepageStandings(season), { teams: [], race: [] }),
    fallbackTo(fetchHomepageSchedule((fixtures) => fixtures.filter((fixture) => fixture.season === season), season), fallbackSchedule),
    fallbackTo<Record<string, TeamIdentity>>(fetchTeamIdentities(), {}),
    // Use league_settings.current_season for every section so awards,
    // standings, fixtures, and weekly cards stay on one real season.
    supabase ? fallbackTo<PlayerCardData[]>(fetchCurrentWeekCards(supabase, season), []) : Promise.resolve([]),
    settingsPromise,
    homeViewer(),
    twitchPromise,
  ]);
  const homepageSchedule = alignFuturePremierHomeFixturesToMonday(schedule);
  const featuredFixture = selectHomepageFeaturedFixture(homepageSchedule.fixtures, featuredSettings.fixtureId, homepageSchedule.seasonFixtures ?? homepageSchedule.upcoming);

  return (
    <HomeDashboard
      ariaLabel="Homepage dashboard"
      twitch={twitch}
      featuredFixture={featuredFixture}
      featuredSettings={featuredSettings}
      awards={awards}
      standings={standingsData}
      topCards={topCards}
      schedule={homepageSchedule}
      identities={identities}
      viewer={viewer}
      seasonLabel={season}
      appearance="workspace"
    />
  );
}
