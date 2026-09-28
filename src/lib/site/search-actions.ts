"use server";

import { createServerSupabase } from "@/lib/supabase/server";

/**
 * Records one site search for the staff "what people search for" list.
 * Fire-and-forget: the database function cleans the query and keeps no
 * identity (20261106000001), and a failure here must never touch the
 * search box, so every error is swallowed.
 */
export async function logSiteSearchAction(query: unknown, results: unknown, league: unknown): Promise<void> {
  if (typeof query !== "string" || query.trim().length < 2) return;
  try {
    const supabase = await createServerSupabase();
    const { error } = await supabase.rpc("log_site_search", {
      p_query: query.slice(0, 200),
      p_results: Number.isFinite(Number(results)) ? Math.max(0, Math.round(Number(results))) : 0,
      p_league: league === "academy" ? "academy" : "premier",
    });
    if (error) console.warn("site search: log failed", { code: error.code });
  } catch {
    // Logging is best effort.
  }
}
