import type { LeagueKey } from "@/lib/players/identity";
import { leaguePath } from "@/lib/league/links";
import type { PhaseFilter } from "@/components/stats/SeasonSelect";

export function teamStatsHref({
  league,
  teamName,
  season,
  phase,
}: {
  league: LeagueKey;
  teamName: string;
  season?: string;
  phase?: PhaseFilter;
}): string {
  const params = new URLSearchParams();
  params.set("tab", "Teams");
  params.set("team", teamName.trim());
  if (season?.trim()) params.set("season", season.trim());
  if (phase && phase !== "All") params.set("phase", phase);
  return `${leaguePath("stats", league)}?${params.toString()}`;
}
