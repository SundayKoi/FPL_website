import StatsTabs from "@/components/stats/StatsTabs";
import LeaguePageToggle from "@/components/LeaguePageToggle";
import { createServerSupabase } from "@/lib/supabase/server";
import { fetchAcademyDraftData } from "@/lib/academy/draft";
import { normalizeTeamName } from "@/lib/league/context";

export default async function AcademyStatsPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const params = await searchParams;
  const supabase = await createServerSupabase();
  const academy = await fetchAcademyDraftData(supabase);
  const teamNames = academy.teams.map((team) => normalizeTeamName(team.name));
  const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
  return <main className="grid-neon flex-1"><div className="mx-auto w-full max-w-[1800px] px-4 py-12 sm:px-6 sm:py-16"><header className="flex flex-col gap-6 border-b border-line pb-8 lg:flex-row lg:items-end lg:justify-between"><div><span className="mono-label"><span className="text-cyan">&gt;</span> Academy League Data</span><h1 className="type-display text-neon mt-3 text-5xl sm:text-6xl">Academy Stats</h1><p className="mt-4 max-w-2xl text-lg leading-8 text-steel">Stats views for the Academy league.</p></div><LeaguePageToggle page="stats" view="academy" params={{ tab: first(params.tab), season: first(params.season), phase: first(params.phase), player: first(params.player) }} /></header><div className="mt-10"><StatsTabs initialPlayer={first(params.player)} initialTab={first(params.tab)} initialSeason={first(params.season)} initialPhase={first(params.phase)} teamNames={teamNames} /></div></div></main>;
}
