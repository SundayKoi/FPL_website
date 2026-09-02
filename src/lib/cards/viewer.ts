import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Who is looking, as a Discord id — read-only.
 *
 * The cards pages that only READ about the viewer (Home, Play) must not go
 * through getBettingUser(): that call runs grant_signup_bonus, which would
 * create a wallet and credit a signup bonus as a side effect of loading a
 * page. This resolves the same id from `profiles` (public read policy) on
 * the cookie-bound client instead, a plain select. Every failure — signed
 * out, no Discord identity, a query error — reads as "nobody", whose page
 * is the harmless one.
 */
export async function readViewerDiscordId(supabase: SupabaseClient): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getUser();
    const profileId = data.user?.id;
    if (!profileId) return null;
    const { data: profile } = await supabase.from("profiles").select("discord_id").eq("id", profileId).maybeSingle();
    return (profile as { discord_id: string | null } | null)?.discord_id ?? null;
  } catch {
    return null;
  }
}
