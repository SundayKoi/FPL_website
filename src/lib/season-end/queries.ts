import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { seasonBelongsToLeague } from "@/lib/league/season";
import type { FixtureRow } from "@/lib/schedule/types";
import { deriveSeasonEnd, type SeasonRow } from "./derive";

// Ordered pages are essential: a season exceeds the API's 1,000-row cap.
// No silent safety-cap truncation: failure leaves the entire result unavailable.
export async function loadSeasonEnd(client: SupabaseClient, league: "premier" | "academy", season: string) {
  if (!seasonBelongsToLeague(season, league)) throw new Error("Season does not belong to this league.");
  const [rows, fixtures] = await Promise.all([
    readPages<SeasonRow>(async (from, to) => client.from("raw_stats").select("*").eq("season", season).eq("season_phase", "Regular").order("id").range(from, to)),
    readPages<FixtureRow>(async (from, to) => client.from("fixtures").select("*").eq("season", season).order("id").range(from, to)),
  ]);
  return deriveSeasonEnd(rows, fixtures, season, league);
}
async function readPages<T>(read: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = [];
  // A short page can reflect a server cap smaller than requested. Continue
  // by actual rows returned until an empty page proves exhaustion.
  for (let page = 0; page < 1000; page++) {
    const { data, error } = await read(rows.length, rows.length + 999);
    if (error) throw new Error(error.message);
    if (!data?.length) return rows;
    rows.push(...data as T[]);
  }
  throw new Error("Season data exceeded the paging safety limit; no awards were calculated.");
}
