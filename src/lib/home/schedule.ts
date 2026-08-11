import { createServerSupabase } from "@/lib/supabase/server";
import {
  resolveSeason,
  seasonsOf,
  selectActiveRegularSeasonStage,
} from "@/lib/schedule/format";
import type { FixtureRow, FixtureStage } from "@/lib/schedule/types";

export interface HomepageScheduleData {
  season: string | null;
  isNewestSeason: boolean;
  activeStage: FixtureStage | null;
  fixtures: FixtureRow[];
}

export async function fetchHomepageSchedule(): Promise<HomepageScheduleData> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("fixtures").select("*").order("stage").order("sort_order");

  if (error) throw error;

  const allFixtures = (data ?? []) as FixtureRow[];
  const seasons = seasonsOf(allFixtures);
  const season = resolveSeason(allFixtures, undefined);

  if (!season) {
    return { season: null, isNewestSeason: true, activeStage: "week_1", fixtures: [] };
  }

  const seasonFixtures = allFixtures.filter((fixture) => fixture.season === season);
  const activeStage = selectActiveRegularSeasonStage(seasonFixtures);

  return {
    season,
    isNewestSeason: season === seasons[0],
    activeStage,
    fixtures: activeStage
      ? seasonFixtures.filter((fixture) => fixture.stage === activeStage)
      : [],
  };
}
