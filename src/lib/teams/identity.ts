import { createServerSupabase } from "@/lib/supabase/server";
import { teamSlug } from "./teamPage";

export interface TeamIdentity {
  name: string;
  abbreviation: string;
  imageUrl: string | null;
}

/** Crest and short name for each team of a league's draft, keyed by slug so a
 *  fixture's free-text team name can find it. Fixtures store names, not ids,
 *  so this is the only join available. Each league resolves against its own
 *  draft rather than one merged map: the two can field same-named teams, and
 *  a shared map would silently give one league the other's crest. */
export async function fetchTeamIdentities(
  draftColumn: "featured_draft_id" | "academy_draft_id" = "featured_draft_id",
): Promise<Record<string, TeamIdentity>> {
  const supabase = await createServerSupabase();
  const { data: settings } = await supabase
    .from("league_settings")
    .select(draftColumn)
    .eq("id", 1)
    .single();
  const draftId = (settings as Record<string, string | null> | null)?.[draftColumn];
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
