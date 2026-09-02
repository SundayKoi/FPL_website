import StatsTabs from "@/components/stats/StatsTabs";
import { createServerSupabase } from "@/lib/supabase/server";
import { fetchAcademyDraftData } from "@/lib/academy/draft";
import { fetchLeagueSeasons } from "@/lib/league/season";

export default async function AcademyStatsPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const params = await searchParams;
  const supabase = await createServerSupabase();
  const [academy, seasons] = await Promise.all([
    fetchAcademyDraftData(supabase),
    fetchLeagueSeasons(supabase),
  ]);
  const teamNames = academy.teams.map((team) => team.name);
  const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
  return (
    <main className="grid-neon flex-1">
      <div className="mx-auto w-full max-w-[1800px] px-4 py-12 sm:px-6 sm:py-16">
        <header className="border-b border-border-subtle pb-8">
          <span className="mono-label">
            <span className="text-league-accent">&gt;</span> Academy League Data
          </span>
          <h1 className="type-display text-neon mt-3 text-5xl sm:text-6xl">Academy Stats</h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-muted">
            Stats views for the Academy league, its first season.
          </p>
        </header>
        <div className="mt-10">
          <StatsTabs
            initialPlayer={first(params.player)}
            initialTab={first(params.tab)}
            initialSeason={first(params.season)}
            initialPhase={first(params.phase)}
            teamNames={teamNames}
            allowedSeasons={[seasons.academy]}
          />
        </div>
      </div>
    </main>
  );
}
