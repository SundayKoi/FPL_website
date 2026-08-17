import StatsTabs from "@/components/stats/StatsTabs";
import LeaguePageToggle from "@/components/LeaguePageToggle";
import { createServerSupabase } from "@/lib/supabase/server";
import { fetchLeagueSeasons } from "@/lib/league/season";

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  // Academy runs on its own season code in the same tables; keep it out of
  // the Premier season picker.
  const seasons = await fetchLeagueSeasons(await createServerSupabase());
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const player = first(params.player);
  const tab = first(params.tab);
  const season = first(params.season);
  const phase = first(params.phase);
  return (
    <main className="grid-neon flex-1">
      <div className="mx-auto w-full max-w-[1800px] px-4 py-12 sm:px-6 sm:py-16">
        <header className="relative flex flex-col gap-6 border-b border-line pb-8 lg:flex-row lg:items-end lg:justify-between">
          <span className="mono-label">
            <span className="text-cyan">&gt;</span> League Data
          </span>
          <h1 className="type-display text-neon mt-3 text-5xl sm:text-6xl">Stats</h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-steel">
            League records, player form, and standings.
          </p>
          <LeaguePageToggle page="stats" view="premier" params={{ player, tab, season, phase }} />
        </header>

        <div className="mt-10">
          <StatsTabs
            initialPlayer={player}
            initialTab={tab}
            initialSeason={season}
            initialPhase={phase}
            excludedSeasons={[seasons.academy]}
          />
        </div>
      </div>
    </main>
  );
}
