import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  formatKickoff,
  groupByStage,
  nextUp,
  resolveSeason,
  seasonsOf,
  stageMeta,
} from "@/lib/schedule/format";
import type { FixtureRow } from "@/lib/schedule/types";
import AdminFixturesEditor from "@/components/schedule/AdminFixturesEditor";
import AdminSeasonSettings from "@/components/schedule/AdminSeasonSettings";
import AdminGenerateSchedule from "@/components/schedule/AdminGenerateSchedule";
import FixtureCard from "@/components/schedule/FixtureCard";
import { fetchTeamIdentities } from "@/lib/teams/identity";
import UpNextBanner from "@/components/schedule/UpNextBanner";

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const supabase = await createServerSupabase();
  const { data: userData } = await supabase.auth.getUser();
  let isAdmin = false;

  if (userData.user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", userData.user.id)
      .single();
    isAdmin = profile?.is_admin ?? false;
  }

  const [fixturesResult, settingsResult, identities] = await Promise.all([
    supabase.from("fixtures").select("*").order("stage").order("sort_order"),
    isAdmin
      ? supabase
          .from("league_settings")
          .select("current_season, current_phase")
          .eq("id", 1)
          .single()
      : Promise.resolve({ data: null }),
    fetchTeamIdentities(),
  ]);
  const allFixtures = (fixturesResult.data as FixtureRow[]) ?? [];
  const settings = settingsResult.data as {
    current_season: string;
    current_phase: string;
  } | null;

  const requestedRaw = (await searchParams).season;
  const requested = Array.isArray(requestedRaw) ? requestedRaw[0] : requestedRaw;
  const seasons = seasonsOf(allFixtures);
  const season = resolveSeason(allFixtures, requested);
  const fixtures = season ? allFixtures.filter((f) => f.season === season) : [];

  const grouped = groupByStage(fixtures);
  const upNext = nextUp(fixtures, new Date());
  const groups = ["Regular Season", "Gauntlet", "Playoffs"] as const;

  return (
    <main className="bg-hash flex-1">
      <div className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
        <header className="border-b border-line pb-8">
          <span className="label-dash">LEAGUE CALENDAR</span>
          <h1 className="type-display mt-3 text-5xl sm:text-6xl">Schedule</h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-steel">
            Five weeks of intra-division Bo3s, then the gauntlet and playoffs.
            Matches are played Mondays at 8:00pm ET in Fearless format.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {["Mondays 8pm ET", "Fearless Format", "Solari & Lunari divisions"].map((chip) => (
              <span
                key={chip}
                className="rounded-full border border-line bg-panel px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-steel"
              >
                {chip}
              </span>
            ))}
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
                    ? "bg-gold text-navy"
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
            <AdminSeasonSettings
              currentSeason={settings?.current_season ?? ""}
              currentPhase={settings?.current_phase ?? "Regular"}
            />
            {/* season is null until fixtures exist, which is exactly when the
                draw is needed — fall back to the league's current season. */}
            {(season ?? settings?.current_season) && (
              <AdminGenerateSchedule season={(season ?? settings?.current_season) as string} />
            )}
            <AdminFixturesEditor fixtures={fixtures} season={season} />
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
                    <div id={meta.stage} key={meta.stage} className="card-brand scroll-mt-24 overflow-hidden">
                      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3">
                        <h3 className="type-display text-xl">{meta.label}</h3>
                        <span className="text-xs text-steel">{meta.note}</span>
                      </div>
                      {stageFixtures.length === 0 ? (
                        <p className="px-4 py-4 text-sm text-steel">
                          Matchups TBD — check back once they&apos;re announced.
                        </p>
                      ) : (
                        stageFixtures.map((fixture) => (
                          <FixtureCard key={fixture.id} fixture={fixture} identities={identities} />
                        ))
                      )}
                    </div>
                  ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
