import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { fetchStaffTier } from "@/lib/auth/staffTier";
import {
  formatKickoff,
  groupByStage,
  nextUp,
  resolveSeason,
  selectDefaultOpenStages,
  seasonsOf,
  stageMeta,
} from "@/lib/schedule/format";
import type { FixtureRow } from "@/lib/schedule/types";
import AdminFixturesEditor from "@/components/schedule/AdminFixturesEditor";
import AdminSeasonSettings from "@/components/schedule/AdminSeasonSettings";
import AdminLiveDrops from "@/components/schedule/AdminLiveDrops";
import AdminGenerateSchedule from "@/components/schedule/AdminGenerateSchedule";
import FixtureCard from "@/components/schedule/FixtureCard";
import CollapsibleScheduleStage from "@/components/schedule/CollapsibleScheduleStage";
import { fetchTeamIdentities } from "@/lib/teams/identity";
import UpNextBanner from "@/components/schedule/UpNextBanner";
import { fetchLeagueSeasons } from "@/lib/league/season";

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const supabase = await createServerSupabase();
  const { isAdmin, isOwner } = await fetchStaffTier(supabase);

  const [fixturesResult, settingsResult, identities, leagueSeasons, draftsResult] = await Promise.all([
    supabase.from("fixtures").select("*").order("stage").order("sort_order"),
    isAdmin
      ? supabase
          .from("league_settings")
          // select(*) rather than naming columns: the live_* pair arrives in a
          // later migration, and naming absent columns errors the whole read —
          // which would blank season settings on a deploy that beat its
          // migration. Star tolerates both worlds.
          .select("*")
          .eq("id", 1)
          .single()
      : Promise.resolve({ data: null }),
    fetchTeamIdentities(),
    fetchLeagueSeasons(supabase),
    // Which fixtures the site drafter actually recorded. Ids only — the
    // schedule needs to know whether a draft EXISTS, not what is in it.
    supabase.from("match_drafts").select("fixture_id"),
  ]);
  // Academy fixtures live in the same table under their own season code —
  // this is the Premier calendar, so they are not listed here.
  const allFixtures = ((fixturesResult.data as FixtureRow[]) ?? []).filter(
    (fixture) => fixture.season !== leagueSeasons.academy,
  );
  const liveDropsActive = await isLiveDropsActive(settingsResult.data as { live_until?: string | null } | null);
  const settings = settingsResult.data as {
    current_season: string;
    current_phase: string;
    academy_season: string;
    live_until: string | null;
    live_label: string | null;
  } | null;

  const requestedRaw = (await searchParams).season;
  const requested = Array.isArray(requestedRaw) ? requestedRaw[0] : requestedRaw;
  const seasons = seasonsOf(allFixtures);
  const season = resolveSeason(allFixtures, requested);
  // Ids only: the schedule needs to know whether a draft EXISTS, not what
  // is in it. A game drafted in the client, or played before this drafter
  // existed, has no row here and gets no link.
  const draftedFixtureIds = new Set(
    ((draftsResult.data as { fixture_id: string }[] | null) ?? []).map((row) => row.fixture_id),
  );
  const fixtures = season ? allFixtures.filter((f) => f.season === season) : [];

  const grouped = groupByStage(fixtures);
  const upNext = nextUp(fixtures, new Date());
  const defaultOpenStages = selectDefaultOpenStages(fixtures, upNext?.stage ?? null);
  const groups = ["Regular Season", "Gauntlet", "Playoffs"] as const;

  return (
    <main className="bg-hash flex-1">
      <div className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
        <header className="border-b border-line pb-8">
          <div>
            <span className="label-dash">LEAGUE CALENDAR</span>
            <h1 className="type-display mt-3 text-5xl sm:text-6xl">Schedule</h1>
            <p className="mt-4 max-w-2xl text-lg leading-8 text-steel">
              Bo3 fearless, Mondays at 8:00pm ET — regular season, gauntlet, then playoffs.
            </p>
          </div>
        </header>

        {upNext && (
          <UpNextBanner
            stageId={upNext.stage}
            stageLabel={stageMeta(upNext.stage).label}
            kickoffText={formatKickoff(upNext.kickoff)}
            kickoff={upNext.kickoff}
            count={upNext.count}
          />
        )}

        {seasons.length > 1 && (
          <nav aria-label="Season" className="mt-8 flex flex-wrap items-center gap-1.5">
            <span className="label-dash mr-1.5">Season</span>
            {seasons.map((s) => (
              <Link
                key={s}
                href={s === seasons[0] ? "/schedule" : `/schedule?season=${encodeURIComponent(s)}`}
                aria-current={s === season ? "page" : undefined}
                className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                  s === season
                    ? "bg-coral text-navy"
                    : "border border-line bg-panel text-steel hover:text-white"
                }`}
              >
                {s}
              </Link>
            ))}
          </nav>
        )}

        {isAdmin && (
          <div className="mt-8 flex flex-col gap-4">
            {isOwner ? (
              <>
                <AdminSeasonSettings
                  currentSeason={settings?.current_season ?? ""}
                  currentPhase={settings?.current_phase ?? "Regular"}
                  academySeason={settings?.academy_season ?? leagueSeasons.academy}
                />
                <AdminLiveDrops liveUntil={settings?.live_until ?? null} liveLabel={settings?.live_label ?? null} active={liveDropsActive} />
                {/* season is null until fixtures exist, which is exactly when the
                    draw is needed — fall back to the league's current season. */}
                {(season ?? settings?.current_season) && (
                  <AdminGenerateSchedule season={(season ?? settings?.current_season) as string} />
                )}
              </>
            ) : (
              <p className="text-sm text-steel">Some league configuration is owner-only.</p>
            )}
            <AdminFixturesEditor fixtures={fixtures} season={season} isOwner={isOwner} />
          </div>
        )}

        <div className="mt-10 flex flex-col gap-12">
          {groups.map((group) => (
            <section key={group}>
              <h2 className="label-dash">{group}</h2>
              <div className="mt-4 flex flex-col gap-4">
                {grouped
                  .filter(({ meta }) => meta.group === group)
                  .map(({ meta, fixtures: stageFixtures }) => (
                    <CollapsibleScheduleStage
                      key={meta.stage}
                      stageId={meta.stage}
                      label={meta.label}
                      note={meta.note}
                      initiallyOpen={defaultOpenStages.has(meta.stage)}
                    >
                      {stageFixtures.length === 0 ? (
                        <p className="px-4 py-4 text-sm text-steel">
                          Matchups TBD — check back once they&apos;re announced.
                        </p>
                      ) : (
                        stageFixtures.map((fixture) => (
                          <FixtureCard key={fixture.id} fixture={fixture} identities={identities} draftedFixtureIds={draftedFixtureIds} />
                        ))
                      )}
                    </CollapsibleScheduleStage>
                  ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}

/** Off the render path — the purity rule bites bare Date.now() in bodies. */
async function isLiveDropsActive(row: { live_until?: string | null } | null): Promise<boolean> {
  return Boolean(row?.live_until && new Date(row.live_until).getTime() > Date.now());
}
