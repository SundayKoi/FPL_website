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
  asOf?: number;
  /** All fixtures for the resolved league/season, including reported ones. */
  seasonFixtures?: FixtureRow[];
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
  candidates: FixtureRow[] = fixtures,
): FixtureRow | null {
  return candidates.find((fixture) => fixture.id === configuredFixtureId) ?? fixtures[0] ?? null;
}

/** Published upcoming UI excludes reported and past fixtures; undated slots follow dated ones. */
export function selectFutureHomepageFixtures(fixtures: FixtureRow[], asOf: number): FixtureRow[] {
  return fixtures
    .filter((fixture) => !hasResult(fixture) && (!fixture.scheduled_at || Date.parse(fixture.scheduled_at) >= asOf))
    .sort((a, b) => {
      if (!a.scheduled_at) return b.scheduled_at ? 1 : a.id.localeCompare(b.id);
      if (!b.scheduled_at) return -1;
      return Date.parse(a.scheduled_at) - Date.parse(b.scheduled_at) || a.id.localeCompare(b.id);
    });
}

const easternKickoffFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
  hourCycle: "h23",
});

function easternKickoffParts(date: Date): Record<string, string> {
  return Object.fromEntries(
    easternKickoffFormatter.formatToParts(date).map(({ type, value }) => [type, value]),
  );
}

function nextMondayAtEasternTime(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const parts = easternKickoffParts(date);
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  const second = Number(parts.second);
  const monday = new Date(Date.UTC(year, month - 1, day + 1));
  const targetWallTime = Date.UTC(
    monday.getUTCFullYear(),
    monday.getUTCMonth(),
    monday.getUTCDate(),
    hour,
    minute,
    second,
  );

  // Resolve the requested Eastern wall time to an ISO instant. The second
  // pass accounts for the offset change at daylight-saving boundaries.
  let instant = targetWallTime;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const localParts = easternKickoffParts(new Date(instant));
    const localWallTime = Date.UTC(
      Number(localParts.year),
      Number(localParts.month) - 1,
      Number(localParts.day),
      Number(localParts.hour),
      Number(localParts.minute),
      Number(localParts.second),
    );
    instant += targetWallTime - localWallTime;
  }

  return new Date(instant).toISOString();
}

/**
 * Older Premier schedule draws could store a Monday kickoff as Sunday in ET.
 * Keep the homepage aligned with Premier's Monday night, weekly cadence by
 * correcting future, unplayed Sunday slots while preserving their ET time.
 */
export function alignFuturePremierHomeFixturesToMonday(schedule: HomepageScheduleData): HomepageScheduleData {
  const asOf = schedule.asOf ?? Date.now();
  const align = (fixture: FixtureRow): FixtureRow => {
    const scheduledAtIso = fixture.scheduled_at;
    const kickoff = scheduledAtIso ? new Date(scheduledAtIso) : null;
    if (
      fixture.season !== schedule.season ||
      hasResult(fixture) ||
      !scheduledAtIso ||
      !kickoff ||
      Number.isNaN(kickoff.getTime()) ||
      kickoff.getTime() < asOf ||
      easternKickoffParts(kickoff).weekday !== "Sun"
    ) {
      return fixture;
    }

    const scheduledAt = nextMondayAtEasternTime(scheduledAtIso);
    return scheduledAt ? { ...fixture, scheduled_at: scheduledAt } : fixture;
  };

  return {
    ...schedule,
    fixtures: schedule.fixtures.map(align),
    upcoming: schedule.upcoming.map(align),
    ...(schedule.seasonFixtures ? { seasonFixtures: schedule.seasonFixtures.map(align) } : {}),
  };
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
  const asOf = Date.now();
  const { data, error } = await supabase.from("fixtures").select("*").order("stage").order("sort_order");

  if (error) throw error;

  const allFixtures = scope ? scope((data ?? []) as FixtureRow[]) : ((data ?? []) as FixtureRow[]);
  const seasons = seasonsOf(allFixtures);
  const season = selectedSeason || resolveSeason(allFixtures, undefined);

  if (!season) {
    return { asOf, season: null, isNewestSeason: true, activeStage: "week_1", fixtures: [], upcoming: [], seasonFixtures: [] };
  }

  const seasonFixtures = allFixtures.filter((fixture) => fixture.season === season);
  const activeStage = selectHomepageStage(seasonFixtures);

  return {
    asOf,
    seasonFixtures,
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
