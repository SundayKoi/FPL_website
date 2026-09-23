import { createServerSupabase } from "@/lib/supabase/server";
import {
  compareFixtures,
  hasResult,
  REGULAR_SEASON_STAGES,
  resolveSeason,
  seasonsOf,
  selectActiveStage,
  stageRank,
} from "@/lib/schedule/format";
import { FIXTURE_STAGES, type FixtureRow, type FixtureStage } from "@/lib/schedule/types";

export interface HomepageScheduleData {
  season: string | null;
  isNewestSeason: boolean;
  activeStage: FixtureStage | null;
  /** The active stage's fixtures only. */
  fixtures: FixtureRow[];
  /** Everything from the active stage through the rest of the season's bracket. */
  upcoming: FixtureRow[];
}

export function selectHomepageFeaturedFixture(
  fixtures: FixtureRow[],
  configuredFixtureId: string | null,
): FixtureRow | null {
  return fixtures.find((fixture) => fixture.id === configuredFixtureId) ?? fixtures[0] ?? null;
}

/** Expose the shared stage resolver under the homepage's historical name. */
export function selectHomepageStage(fixtures: FixtureRow[]): FixtureStage | null {
  const hasRegularFixtures = fixtures.some((fixture) =>
    (REGULAR_SEASON_STAGES as readonly string[]).includes(fixture.stage),
  );
  if (hasRegularFixtures) return selectActiveStage(fixtures);

  // A playoff-only schedule should not be masked by an empty Week 1.
  const postseasonStages = FIXTURE_STAGES.filter(
    (stage) => !(REGULAR_SEASON_STAGES as readonly string[]).includes(stage),
  );
  return postseasonStages.find((stage) =>
    fixtures.some((fixture) => fixture.stage === stage && !hasResult(fixture)),
  ) ?? null;
}

/**
 * The active stage's fixtures for one league's homepage. `scope` narrows the
 * fixture list before the season is resolved; `selectedSeason` pins Premier
 * and Academy readers to their configured season.
 */
export async function fetchHomepageSchedule(
  scope?: (fixtures: FixtureRow[]) => FixtureRow[],
  selectedSeason?: string | null,
): Promise<HomepageScheduleData> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("fixtures").select("*").order("stage").order("sort_order");

  if (error) throw error;

  const allFixtures = scope ? scope((data ?? []) as FixtureRow[]) : ((data ?? []) as FixtureRow[]);
  const seasons = seasonsOf(allFixtures);
  const season = selectedSeason || resolveSeason(allFixtures, undefined);

  if (!season) {
    return { season: null, isNewestSeason: true, activeStage: "week_1", fixtures: [], upcoming: [] };
  }

  const seasonFixtures = allFixtures.filter((fixture) => fixture.season === season);
  const activeStage = selectHomepageStage(seasonFixtures);

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
