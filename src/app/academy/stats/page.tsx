import type { Metadata } from "next";
import StatsTabs from "@/components/stats/StatsTabs";
import { createServerSupabase } from "@/lib/supabase/server";
import { fetchAcademyDraftData } from "@/lib/academy/draft";
import { fetchLeagueSeasons } from "@/lib/league/season";
import LeaguePageShell from "@/components/league/LeaguePageShell";

export const metadata: Metadata = {
  title: "Stats — FPL Academy",
};

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
    <LeaguePageShell
      league="academy"
      title="Stats"
      season={seasons.academy}
      activeSection="stats"
      description="Season records, player performance, team results, and head-to-head views for Academy."
    >
      <StatsTabs
        initialPlayer={first(params.player)}
        initialTab={first(params.tab)}
        initialTeam={first(params.team)}
        initialSeason={first(params.season)}
        initialPhase={first(params.phase)}
        teamNames={teamNames}
        allowedSeasons={[seasons.academy]}
      />
    </LeaguePageShell>
  );
}
