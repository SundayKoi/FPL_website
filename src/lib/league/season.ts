import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The two leagues run on separate season codes: Premier is on its own
 * numbering (S5 at time of writing) while Academy started fresh at A1, so
 * Premier's S1-S4 history never appears in an Academy-scoped query. Both live
 * on league_settings id=1 and are admin-set from the schedule page.
 */
export interface LeagueSeasons {
  premier: string;
  academy: string;
}

type SettingsRow = { current_season?: string | null; academy_season?: string | null };

export const DEFAULT_ACADEMY_SEASON = "A1";

/**
 * Season codes are the persistent league boundary for shared stats tables:
 * Academy uses A-prefixed seasons and Premier uses the S-prefixed series.
 * Keep this check in one place so historical queries cannot treat a reused
 * team name as proof that a row belongs to the selected league.
 */
export function seasonBelongsToLeague(
  season: string | null | undefined,
  league: "premier" | "academy",
): boolean {
  const value = season?.trim().toLocaleUpperCase();
  if (!value) return false;
  const isAcademy = value.startsWith("A");
  return league === "academy" ? isAcademy : !isAcademy;
}

/**
 * Orders season codes the way the league counts them: by prefix, then by
 * the number at the end, so S2 comes before S10 (a string sort puts S10
 * first). Codes without a trailing number sort after numbered ones of the
 * same prefix, alphabetically.
 */
export function compareSeasonCodes(a: string, b: string): number {
  const parse = (code: string) => {
    const value = code.trim().toLocaleUpperCase();
    const match = value.match(/^(.*?)(\d+)$/);
    return match ? { prefix: match[1], number: Number(match[2]), value } : { prefix: value, number: Number.POSITIVE_INFINITY, value };
  };
  const left = parse(a);
  const right = parse(b);
  return left.prefix.localeCompare(right.prefix) || left.number - right.number || left.value.localeCompare(right.value);
}

export async function fetchLeagueSeasons(supabase: SupabaseClient): Promise<LeagueSeasons> {
  const { data } = await supabase
    .from("league_settings")
    .select("current_season, academy_season")
    .eq("id", 1)
    .single();
  const row = (data as SettingsRow | null) ?? null;
  return {
    premier: row?.current_season ?? "",
    academy: row?.academy_season ?? DEFAULT_ACADEMY_SEASON,
  };
}
