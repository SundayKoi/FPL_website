import { createServerSupabase } from "@/lib/supabase/server";
import type { LeagueView } from "@/lib/league/context";
import { activeBrief, type HomepageBrief } from "./brief";

/** The published brief the league's homepage should show, or null when none
 *  exists — in which case the computed award lists stay on the page. */
export async function fetchActiveBrief(league: LeagueView = "premier"): Promise<HomepageBrief | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("homepage_briefs")
    .select("*")
    .eq("league", league)
    .eq("published", true)
    .order("generated_at", { ascending: false })
    .limit(5);
  return activeBrief((data as HomepageBrief[]) ?? []);
}
