import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchLeagueSeasons, seasonBelongsToLeague } from "@/lib/league/season";

export type AdminLeague = "premier" | "academy";

export type AdminLeagueSeason = {
  league: AdminLeague;
  season: string;
  defaultSeasons: Record<AdminLeague, string>;
  seasonOptions: string[];
  optionsAvailable: boolean;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function isSeasonCodeForLeague(value: string, league: AdminLeague) {
  return /^[SA]\d+$/i.test(value) && seasonBelongsToLeague(value, league);
}

export async function resolveAdminLeagueSeason(
  supabase: SupabaseClient,
  params: Record<string, string | string[] | undefined>,
): Promise<AdminLeagueSeason> {
  const requestedLeague = first(params.league);
  const league: AdminLeague = requestedLeague === "academy" ? "academy" : "premier";
  const [fixtureSeasons, currentSeasons] = await Promise.all([
    supabase.from("fixtures").select("season"),
    fetchLeagueSeasons(supabase),
  ]);
  const defaultSeasons = {
    premier: currentSeasons.premier || "S5",
    academy: currentSeasons.academy || "A1",
  };
  const defaultSeason = defaultSeasons[league];
  const seasonOptions = [...new Set([
    defaultSeason,
    ...(((fixtureSeasons.data as { season: string }[] | null) ?? [])
      .map((row) => row.season)
      .filter((value) => isSeasonCodeForLeague(value, league))),
  ])].sort((left, right) => {
    if (left === defaultSeason) return -1;
    if (right === defaultSeason) return 1;
    return Number.parseInt(right.slice(1), 10) - Number.parseInt(left.slice(1), 10);
  });
  const requestedSeason = first(params.season);
  const season = requestedSeason && seasonOptions.includes(requestedSeason) ? requestedSeason : defaultSeason;
  return {
    league,
    season,
    defaultSeasons,
    seasonOptions,
    optionsAvailable: !fixtureSeasons.error,
  };
}
