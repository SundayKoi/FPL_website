import { createServerSupabase } from "@/lib/supabase/server";
import type { HomepageMode } from "./seasonState";

function isHomepageMode(value: unknown): value is HomepageMode {
  return value === "auto" || value === "preseason" || value === "regular";
}

export async function fetchHomepageMode(): Promise<HomepageMode> {
  try {
    const supabase = await createServerSupabase();
    const { data, error } = await supabase
      .from("league_settings")
      .select("homepage_mode")
      .eq("id", 1)
      .single();

    if (error && error.code !== "PGRST116") return "auto";
    return isHomepageMode((data as { homepage_mode?: unknown } | null)?.homepage_mode)
      ? (data as { homepage_mode: HomepageMode }).homepage_mode
      : "auto";
  } catch {
    return "auto";
  }
}
