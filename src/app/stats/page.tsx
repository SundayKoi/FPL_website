import type { Metadata } from "next";
import StatsTabs from "@/components/stats/StatsTabs";
import { createServerSupabase } from "@/lib/supabase/server";
import { fetchLeagueSeasons } from "@/lib/league/season";
import LeaguePageShell from "@/components/league/LeaguePageShell";
import { firstParam } from "@/lib/searchParams";

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
  const player = firstParam(params.player);
  const tab = firstParam(params.tab);
  const team = firstParam(params.team);
  const season = firstParam(params.season);
  const phase = firstParam(params.phase);
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
