import { createServerSupabase } from "@/lib/supabase/server";
import { activeBrief, type HomepageBrief } from "./brief";

/** The published brief the homepage should show, or null when none exists —
 *  in which case the computed award lists stay on the page. */
export async function fetchActiveBrief(): Promise<HomepageBrief | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("homepage_briefs")
    .select("*")
    .eq("published", true)
    .order("generated_at", { ascending: false })
    .limit(5);
  return activeBrief((data as HomepageBrief[]) ?? []);
}
