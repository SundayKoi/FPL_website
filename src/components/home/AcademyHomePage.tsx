import HomeDashboard from "./HomeDashboard";
import { fetchHomepageTwitch } from "@/lib/home/twitch";
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

  const [twitch, awards, standings, schedule, identities, standouts, featuredSettings] = await Promise.all([
    fetchHomepageTwitch(),
    fetchHomepageAwards(seasons.academy, teamNames, "academy_draft_id"),
    fetchHomepageStandings(seasons.academy, teamNames, "academy_draft_id"),
    fetchHomepageSchedule((fixtures) => filterAcademyFixtures(fixtures, teamNameSet)),
    fetchTeamIdentities("academy_draft_id"),
    fetchLatestWeeklyStandouts(5, seasons.academy, teamNames),
    fetchHomepageFeaturedSettings("academy"),
  ]);
  const featuredFixture = selectHomepageFeaturedFixture(schedule.fixtures, featuredSettings.fixtureId);

  return (
    <HomeDashboard
      view="academy"
      ariaLabel="Academy homepage dashboard"
      twitch={twitch}
      featuredFixture={featuredFixture}
      featuredSettings={featuredSettings}
      awards={awards}
      standings={standings}
      standouts={standouts}
      schedule={schedule}
      identities={identities}
      seasonLabel={seasons.academy}
      scheduleBasePath="/academy/schedule"
      scheduleTeamBasePath={null}
    />
  );
}
