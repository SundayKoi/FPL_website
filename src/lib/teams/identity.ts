import { createServerSupabase } from "@/lib/supabase/server";
import { teamSlug } from "./teamPage";

export interface TeamIdentity {
  name: string;
  abbreviation: string;
  imageUrl: string | null;
}

/** Crest and short name for each team of the featured draft, keyed by slug so
 *  a fixture's free-text team name can find it. Fixtures store names, not ids,
 *  so this is the only join available. */
export async function fetchTeamIdentities(): Promise<Record<string, TeamIdentity>> {
  const supabase = await createServerSupabase();
  const { data: settings } = await supabase
    .from("league_settings")
    .select("featured_draft_id")
    .eq("id", 1)
    .single();
  const draftId = (settings as { featured_draft_id?: string | null } | null)?.featured_draft_id;
  if (!draftId) return {};

  const { data } = await supabase
    .from("teams")
    .select("name, abbreviation, image_url")
    .eq("draft_id", draftId);

  const out: Record<string, TeamIdentity> = {};
  for (const row of (data as { name: string; abbreviation: string | null; image_url: string | null }[]) ?? []) {
    out[teamSlug(row.name)] = {
      name: row.name,
      abbreviation: row.abbreviation || row.name.slice(0, 3).toUpperCase(),
      imageUrl: row.image_url,
    };
  }
  return out;
}
