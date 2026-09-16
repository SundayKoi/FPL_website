import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllPages } from "@/lib/supabase/pagination";
import { seasonBelongsToLeague } from "@/lib/league/season";
import { buildPreviewCards } from "./cardData";
import { buildSeasonAwards, type SeasonRow, type SeasonFixture } from "./awards";

export async function fetchSeasonsEnd(supabase: SupabaseClient, league: "premier" | "academy", requested?: string) {
  const seasons = await fetchAllPages<{season:string}>((from,to)=>supabase.from("stats_player_agg").select("season").order("season").order("summoner_name").order("tag").order("season_phase").range(from,to));
  const options=[...new Set(seasons.map(r=>r.season).filter(s=>seasonBelongsToLeague(s,league)))].sort((a,b)=>b.localeCompare(a,undefined,{numeric:true}));
  const season=requested && options.includes(requested) ? requested : options[0];
  if(!season) return {options,season:null,result:null};
  const [rows,fixtures]=await Promise.all([
    fetchAllPages<SeasonRow>((from,to)=>supabase.from("raw_stats").select("*").eq("season",season).eq("season_phase","Regular").order("id").range(from,to)),
    fetchAllPages<SeasonFixture>((from,to)=>supabase.from("fixtures").select("id, season, stage, division, team_a, team_b, score_a, score_b").eq("season",season).in("stage",["week_1","week_2","week_3","week_4","week_5"]).order("id").range(from,to)),
  ]);
  const result=buildSeasonAwards(rows,fixtures,season);
  return {options,season,result:{...result,cards:buildPreviewCards(result.rows)}};
}
