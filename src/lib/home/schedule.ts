import { createServerSupabase } from "@/lib/supabase/server";
import {
  compareFixtures,
  resolveSeason,
  seasonsOf,
  selectActiveStage,
  stageRank,
} from "@/lib/schedule/format";
import type { FixtureRow, FixtureStage } from "@/lib/schedule/types";

export interface HomepageScheduleData {
  season: string | null;
  isNewestSeason: boolean;
  activeStage: FixtureStage | null;
  /** The active stage's fixtures only. */
  fixtures: FixtureRow[];
  /**
   * Everything still ahead in the season — the active stage and every later
   * stage in bracket order, played or not — so staff can pick a match from
   * the whole bracket, not just tonight. Empty once the season is played out.
   */
  upcoming: FixtureRow[];
}

export function selectHomepageFeaturedFixture(
  fixtures: FixtureRow[],
  configuredFixtureId: string | null,
): FixtureRow | null {
  return fixtures.find((fixture) => fixture.id === configuredFixtureId) ?? fixtures[0] ?? null;
}

/**
 * The active stage's fixtures for one league's homepage. `scope` narrows the
 * fixture list before the season is resolved — Academy passes its own filter
 * so its A1 fixtures resolve independently of Premier's season.
 */
export async function fetchHomepageSchedule(
  scope?: (fixtures: FixtureRow[]) => FixtureRow[],
): Promise<HomepageScheduleData> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("fixtures").select("*").order("stage").order("sort_order");

  if (error) throw error;

  const allFixtures = scope ? scope((data ?? []) as FixtureRow[]) : ((data ?? []) as FixtureRow[]);
  const seasons = seasonsOf(allFixtures);
  const season = resolveSeason(allFixtures, undefined);

  if (!season) {
    return { season: null, isNewestSeason: true, activeStage: "week_1", fixtures: [], upcoming: [] };
  }

  const seasonFixtures = allFixtures.filter((fixture) => fixture.season === season);
  const activeStage = selectActiveStage(seasonFixtures);

  return {
    season,
    isNewestSeason: season === seasons[0],
    activeStage,
    fixtures: activeStage
      ? seasonFixtures.filter((fixture) => fixture.stage === activeStage)
      : [],
    upcoming: activeStage
      ? seasonFixtures
          .filter((fixture) => stageRank(fixture.stage) >= stageRank(activeStage))
          .sort(compareFixtures)
      : [],
  };
}
