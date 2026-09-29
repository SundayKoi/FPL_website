import type { Metadata } from "next";
import StatsTabs from "@/components/stats/StatsTabs";
import { createServerSupabase } from "@/lib/supabase/server";
import { fetchLeagueSeasons } from "@/lib/league/season";
import LeaguePageShell from "@/components/league/LeaguePageShell";

export const metadata: Metadata = {
  title: "Stats — FPL",
};

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
  const team = first(params.team);
  const season = first(params.season);
  const phase = first(params.phase);
  return (
    <LeaguePageShell
      league="premier"
      title="Stats"
      season={season ?? seasons.premier}
      activeSection="stats"
      description="League records, player performance, team results, and season history."
    >
      <StatsTabs
        initialPlayer={player}
        initialTab={tab}
        initialTeam={team}
        initialSeason={season}
        initialPhase={phase}
        excludedSeasons={[seasons.academy]}
      />
    </LeaguePageShell>
  );
}
