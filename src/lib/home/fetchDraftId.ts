import type { createServerSupabase } from "@/lib/supabase/server";

type ServerSupabase = Awaited<ReturnType<typeof createServerSupabase>>;

/**
 * The league's active draft id, read from the single league_settings row.
 * An unseeded settings table (PGRST116) resolves to null; any other error is
 * thrown so each caller can apply its own failure policy.
 */
export async function fetchDraftId(
  supabase: ServerSupabase,
  column: "featured_draft_id" | "academy_draft_id",
): Promise<string | null> {
  const { data, error } = await supabase
    .from("league_settings")
    .select(column)
    .eq("id", 1)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return (data as Record<string, string | null> | null)?.[column] ?? null;
}
