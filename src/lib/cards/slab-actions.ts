"use server";

// Slab a copy: the owner's one-way choice to seal it. The RPC proves
// ownership, refuses a copy that is away on a route, and writes the seal;
// the slab_seal trigger makes it permanent from then on. Cosmetic by
// construction — nothing here reads or writes a price.

import { revalidatePath } from "next/cache";
import { getBettingUser } from "@/lib/betting/wallet";
import { createBettingServiceClient } from "@/lib/betting/service-client";

export async function slabCardAction(inventoryId: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getBettingUser();
  if (!user) return { ok: false, error: "Sign in with Discord first." };
  if (!user.allowed) return { ok: false, error: "FPL Better members only." };
  if (!Number.isInteger(inventoryId)) return { ok: false, error: "That isn't a card." };

  const service = createBettingServiceClient();
  const { error } = await service.rpc("slab_card", { p_user: user.discordId, p_inventory: inventoryId });
  if (error) {
    if (/card not owned/i.test(error.message)) return { ok: false, error: "That card isn't yours." };
    if (/already slabbed/i.test(error.message)) return { ok: false, error: "That copy is already slabbed." };
    if (/already deployed/i.test(error.message)) return { ok: false, error: "That copy is out on an expedition — slab it when it's home." };
    return { ok: false, error: "Couldn't slab that copy — is the finishes migration applied?" };
  }
  revalidatePath("/cards/collection");
  revalidatePath("/academy/cards/collection");
  return { ok: true };
}
