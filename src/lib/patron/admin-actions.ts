"use server";

// Owner-only patron management, backing /admin/patrons.
//
// Same shape as the other admin actions (src/lib/packs/admin-actions.ts):
// authorize against the caller's own session FIRST, and only then bring
// out the service client. Money-adjacent writes go through the
// grant_patron RPC so the receipt and the grant are one transaction.

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import { fetchStaffTier } from "@/lib/auth/staffTier";

type ActionResult = { ok: true; until?: string } | { ok: false; error: string };

async function requireOwner(): Promise<boolean> {
  const supabase = await createServerSupabase();
  const { isOwner } = await fetchStaffTier(supabase);
  return isOwner;
}

/** Every surface that reads patron state — the panel, the shop's flame
 *  wardrobe, and the public roster. */
function revalidatePatronSurfaces(): void {
  revalidatePath("/admin/patrons");
  revalidatePath("/supporters");
  revalidatePath("/cards/packs");
  revalidatePath("/academy/cards/packs");
}

/**
 * Records a payment and grants its days in one click. The RPC is the
 * atomicity — two separate writes from here could grant without a
 * receipt when the second one failed.
 */
export async function grantPatronAction(input: {
  discordId: string;
  amountUsd: number;
  days: number;
  note?: string;
}): Promise<ActionResult> {
  if (!(await requireOwner())) return { ok: false, error: "Owners only." };

  const amount = Number(input.amountUsd);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 500) {
    return { ok: false, error: "Amount must be between $0 and $500." };
  }
  const days = Math.floor(input.days);
  if (!Number.isFinite(days) || days < 1 || days > 365) {
    return { ok: false, error: "Days must be between 1 and 365." };
  }
  if (!input.discordId) return { ok: false, error: "Pick a member." };

  const service = createBettingServiceClient();
  const { data, error } = await service.rpc("grant_patron", {
    p_user: input.discordId,
    p_amount: amount,
    p_days: days,
    p_note: input.note ?? null,
  });
  if (error) {
    if (/unknown user|foreign key/i.test(error.message)) return { ok: false, error: "That member has no betting profile." };
    return { ok: false, error: "Could not record the grant — is the patron_payments migration applied?" };
  }

  revalidatePatronSurfaces();
  return { ok: true, until: String(data) };
}

/**
 * Ends a patronage now (refund, mistake). The receipts stay — history is
 * history — which is also why this doesn't touch patron_payments.
 */
export async function revokePatronAction(discordId: string): Promise<ActionResult> {
  if (!(await requireOwner())) return { ok: false, error: "Owners only." };
  if (!discordId) return { ok: false, error: "Pick a member." };

  const service = createBettingServiceClient();
  const { error } = await service
    .from("betting_profiles")
    .update({ patron_until: null })
    .eq("discord_id", discordId);
  if (error) return { ok: false, error: "Could not revoke — try again." };

  revalidatePatronSurfaces();
  return { ok: true };
}
