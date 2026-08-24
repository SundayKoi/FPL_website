import { createServerSupabase } from "@/lib/supabase/server";

export type BangerBoardSettings = {
  heroTitle: string;
  dailyTitle: string;
  podiumTitle: string;
  stinkerTitle: string;
  recentTitle: string;
  randomTitle: string;
};

export const DEFAULT_BANGER_BOARD_SETTINGS: BangerBoardSettings = {
  heroTitle: "Stu’s Banger Board",
  dailyTitle: "Banger check",
  podiumTitle: "Top 3 all-time",
  stinkerTitle: "Top stinkers",
  recentTitle: "Last 45 days",
  randomTitle: "Random pull",
};

export async function fetchBangerBoardSettings(): Promise<BangerBoardSettings> {
  try {
    const supabase = await createServerSupabase();
    const { data } = await supabase
      .from("banger_board_settings")
      .select("hero_title, daily_title, podium_title, stinker_title, recent_title, random_title")
      .eq("id", true)
      .maybeSingle();
    if (!data) return DEFAULT_BANGER_BOARD_SETTINGS;
    const row = data as Record<string, unknown>;
    const value = (key: string, fallback: string) => (typeof row[key] === "string" && row[key].trim() ? row[key] : fallback) as string;
    return {
      heroTitle: value("hero_title", DEFAULT_BANGER_BOARD_SETTINGS.heroTitle),
      dailyTitle: value("daily_title", DEFAULT_BANGER_BOARD_SETTINGS.dailyTitle),
      podiumTitle: value("podium_title", DEFAULT_BANGER_BOARD_SETTINGS.podiumTitle),
      stinkerTitle: value("stinker_title", DEFAULT_BANGER_BOARD_SETTINGS.stinkerTitle),
      recentTitle: value("recent_title", DEFAULT_BANGER_BOARD_SETTINGS.recentTitle),
      randomTitle: value("random_title", DEFAULT_BANGER_BOARD_SETTINGS.randomTitle),
    };
  } catch {
    return DEFAULT_BANGER_BOARD_SETTINGS;
  }
}
