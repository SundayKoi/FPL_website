"use server";

import { revalidatePath } from "next/cache";
import { fetchStaffTier } from "@/lib/auth/staffTier";
import { createServerSupabase } from "@/lib/supabase/server";
import type { PlayoffPublishPayload } from "@/lib/schedule/previewPayload";
import type { PlayoffPolicy22, PlayoffPolicy40 } from "@/lib/schedule/playoffs";

export type PlayoffActionResult = { ok: boolean; message: string };

async function requirePlayoffStaff() {
  const supabase = await createServerSupabase();
  const staff = await fetchStaffTier(supabase);
  if (!staff.isAdmin && !staff.isOwner) return { supabase: null, message: "Admin or owner access is required." };
  return { supabase, message: null };
}

export async function savePlayoffPolicy(
  season: string,
  pairing22: PlayoffPolicy22 | null,
  pairing40: PlayoffPolicy40 | null,
): Promise<PlayoffActionResult> {
  const { supabase, message } = await requirePlayoffStaff();
  if (!supabase) return { ok: false, message: message ?? "Not authorized." };
  const { data, error } = await supabase.rpc("update_premier_playoff_policy", {
    p_season: season,
    p_pairing_22: pairing22,
    p_pairing_40: pairing40,
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/schedule");
  revalidatePath("/");
  revalidatePath("/broadcaster");
  return { ok: true, message: `Pairing policy saved (configuration ${data}).` };
}

export async function publishPlayoffRound(
  season: string,
  stage: "semifinals" | "finals",
  preview: PlayoffPublishPayload,
): Promise<PlayoffActionResult> {
  const { supabase, message } = await requirePlayoffStaff();
  if (!supabase) return { ok: false, message: message ?? "Not authorized." };
  const { data, error } = await supabase.rpc("publish_premier_playoff_round", {
    p_season: season,
    p_stage: stage,
    p_preview: preview as never,
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/schedule");
  revalidatePath("/");
  revalidatePath("/broadcaster");
  return { ok: true, message: `${stage === "semifinals" ? "Semifinals" : "Finals"} updated: ${JSON.stringify(data)}.` };
}
