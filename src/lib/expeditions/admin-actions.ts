"use server";

// Closing the season's roads: a staff action that awards the three marks
// (close_expedition_season, 20261013000001). Marks only, once per
// season; the RPC is idempotent and the service role is the only caller.

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import { fetchStaffTier } from "@/lib/auth/staffTier";
import { GOLD, postCardsWebhook } from "@/lib/packs/announce";
import { fetchAccolades } from "./queries";
import { ACCOLADE_ORDER, accoladeLine, type Accolade } from "./standings";

export type CloseSeasonResult = { ok: true; accolades: Accolade[] } | { ok: false; error: string };

export async function closeExpeditionSeasonAction(season: string): Promise<CloseSeasonResult> {
  const supabase = await createServerSupabase();
  const { isAdmin, isOwner } = await fetchStaffTier(supabase);
  if (!isAdmin && !isOwner) return { ok: false, error: "Admins only." };
  const trimmed = season.trim();
  if (!trimmed) return { ok: false, error: "Which season?" };

  const service = createBettingServiceClient();
  const { error } = await service.rpc("close_expedition_season", { p_season: trimmed });
  if (error) return { ok: false, error: error.message };
  const accolades = await fetchAccolades(service, trimmed);

  // The news, best effort and after the write.
  if (accolades.length > 0) {
    try {
      const site = process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "";
      const ordered = ACCOLADE_ORDER.map((kind) => accolades.find((accolade) => accolade.kind === kind)).filter((accolade): accolade is Accolade => Boolean(accolade));
      await postCardsWebhook({
        title: `The season's roads are closed — ${trimmed}`,
        description: `${ordered.map(accoladeLine).join("\n")}\n\nMarks only, worn on the expeditions board all next season. ${site ? `${site}/cards/expeditions` : ""}`.trim(),
        color: GOLD,
      });
    } catch (announceError) {
      console.error("expeditions: season close announcement failed", announceError);
    }
  }
  revalidatePath("/cards/expeditions");
  revalidatePath("/cards/expeditions/ledger");
  revalidatePath("/admin/expeditions");
  return { ok: true, accolades };
}
