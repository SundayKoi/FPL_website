import { createServerSupabase } from "@/lib/supabase/server";
import type { HomepageMode } from "./seasonState";

export type HomepageFeaturedSettings = {
  fixtureId: string | null;
  title: string | null;
  description: string | null;
};

type Homepage = "premier" | "academy";

const emptyHomepageFeaturedSettings: HomepageFeaturedSettings = {
  fixtureId: null,
  title: null,
  description: null,
};

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

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

export async function fetchHomepageFeaturedSettings(homepage: Homepage): Promise<HomepageFeaturedSettings> {
  try {
    const supabase = await createServerSupabase();
    const { data, error } = await supabase
      .from("homepage_featured_settings")
      .select("fixture_id, title, description")
      .eq("homepage", homepage)
      .single();

    if (error) return emptyHomepageFeaturedSettings;

    const row = data as { fixture_id?: unknown; title?: unknown; description?: unknown } | null;
    return {
      fixtureId: optionalString(row?.fixture_id),
      title: optionalString(row?.title),
      description: optionalString(row?.description),
    };
  } catch {
    return emptyHomepageFeaturedSettings;
  }
}
