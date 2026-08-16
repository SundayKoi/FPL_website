import { createServerSupabase } from "@/lib/supabase/server";
import { fetchAcademyDraftData } from "@/lib/academy/draft";
import { filterAcademyFixtures } from "@/lib/academy/filtering";
import { academyTeamNames } from "@/lib/league/context";
import type { FixtureRow } from "@/lib/schedule/types";
import { resolveSeason, selectActiveRegularSeasonStage } from "@/lib/schedule/format";
import LeaguePageToggle from "@/components/LeaguePageToggle";
import HomeStandings from "@/components/home/HomeStandings";
import UpcomingSchedule from "@/components/home/UpcomingSchedule";

export default async function AcademyHomePage() {
  const supabase = await createServerSupabase();
  const [draftData, fixtureResult] = await Promise.all([
    fetchAcademyDraftData(supabase),
    supabase.from("fixtures").select("*").order("stage").order("sort_order"),
  ]);
  const fixtures = filterAcademyFixtures((fixtureResult.data as FixtureRow[]) ?? [], academyTeamNames(draftData.teams));
  const season = resolveSeason(fixtures, undefined);
  const seasonFixtures = season ? fixtures.filter((fixture) => fixture.season === season) : [];
  const activeStage = selectActiveRegularSeasonStage(seasonFixtures);
  const teams = draftData.teams.map((team) => ({ id: team.id, name: team.name, abbreviation: team.abbreviation, nomination_position: team.nomination_position, wins: 0, losses: 0 }));
  return (
    <main className="bg-hash flex-1"><div className="mx-auto w-full max-w-[1800px] px-4 py-12 sm:px-6 sm:py-16">
      <header className="flex flex-col gap-6 border-b border-line pb-8 lg:flex-row lg:items-end lg:justify-between"><div><span className="label-dash">ACADEMY LEAGUE HUB</span><h1 className="type-display mt-3 text-5xl sm:text-6xl">Academy Home</h1><p className="mt-4 max-w-2xl text-lg leading-8 text-steel">The S1 Academy draft, standings, and Academy-only schedule.</p></div><LeaguePageToggle page="home" view="academy" /></header>
      <div className="mt-8 grid gap-6 lg:grid-cols-2"><HomeStandings teams={teams} /><UpcomingSchedule schedule={{ season, isNewestSeason: true, activeStage, fixtures: activeStage ? seasonFixtures.filter((fixture) => fixture.stage === activeStage) : [] }} /></div>
    </div></main>
  );
}
