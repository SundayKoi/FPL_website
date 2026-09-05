"use server";

// One admin click posts the overhaul announcement to the cards channel.
// Staff only, through the same door every card announcement uses — and
// the copy is built by a pure function so what goes out is what the test
// read.

import { createServerSupabase } from "@/lib/supabase/server";
import { fetchStaffTier } from "@/lib/auth/staffTier";
import { postCardsWebhook } from "@/lib/packs/announce";
import { gauntletOverhaulAnnouncement } from "./announcement";

export async function announceGauntletOverhaulAction(): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createServerSupabase();
  const { isAdmin, isOwner } = await fetchStaffTier(supabase);
  if (!isAdmin && !isOwner) return { ok: false, error: "Staff only." };
  const site = process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://fpl.gg";
  if (!process.env.DISCORD_CARDS_WEBHOOK_URL && !process.env.DISCORD_BOT_TOKEN) {
    return { ok: false, error: "No Discord webhook or bot token is configured on this deploy." };
  }
  await postCardsWebhook(gauntletOverhaulAnnouncement(site));
  return { ok: true };
}
