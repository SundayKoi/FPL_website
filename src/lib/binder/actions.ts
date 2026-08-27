"use server";

// Pinning and unpinning binder slots.
//
// Only the slot number and the copy travel over the wire — the owner comes
// from the session, so a client can neither pin into someone else's binder
// nor pin a copy it doesn't hold. Both tables are deny-all; this is the
// only write path.

import { revalidatePath } from "next/cache";
import { getBettingUser } from "@/lib/betting/wallet";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import { patronActive } from "@/lib/patron/flames";
import { binderSlotsFor } from "./queries";

/** Which cap this user's binder has right now — 9 while their patronage
 *  burns, 6 otherwise. A lapsed patron keeps what's pinned (display only
 *  re-checks ownership); they just can't pin past 6 again. */
async function slotCapFor(service: ReturnType<typeof createBettingServiceClient>, discordId: string): Promise<number> {
  const { data } = await service
    .from("betting_profiles")
    .select("patron_until")
    .eq("discord_id", discordId)
    .maybeSingle();
  return binderSlotsFor(patronActive((data as { patron_until: string | null } | null)?.patron_until));
}

/**
 * Puts one owned copy in one slot, or clears the slot when inventoryId is
 * null. Returns a friendly error rather than throwing: this runs behind a
 * select in the collection, and a failed pin should say so in place.
 */
export async function setBinderSlotAction(
  slot: number,
  inventoryId: number | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getBettingUser();
  if (!user) return { ok: false, error: "Sign in with Discord to use the betting site." };
  if (!user.allowed) return { ok: false, error: "FPL Better members only." };

  const service = createBettingServiceClient();
  const cap = await slotCapFor(service, user.discordId);
  if (!Number.isInteger(slot) || slot < 1 || slot > cap) {
    return { ok: false, error: "That isn't a binder slot." };
  }

  // The binder row is the FK target for a slot, so it has to exist before
  // the pin lands — and it is what mints the share token.
  const { error: binderError } = await service
    .from("card_binders")
    .upsert({ discord_id: user.discordId }, { onConflict: "discord_id", ignoreDuplicates: true });
  if (binderError) return { ok: false, error: "Couldn't open your binder." };

  if (inventoryId === null) {
    const { error } = await service
      .from("card_binder_slots")
      .delete()
      .eq("discord_id", user.discordId)
      .eq("slot", slot);
    if (error) return { ok: false, error: "Couldn't clear that slot." };
    revalidatePath("/cards/packs");
    revalidatePath("/academy/cards/packs");
    return { ok: true };
  }

  // Ownership is checked here, against the session's id — the id in the
  // request is a copy id, and a copy id alone must never be enough to
  // display someone else's card.
  const { data: owned, error: ownedError } = await service
    .from("card_inventory")
    .select("id")
    .eq("id", inventoryId)
    .eq("discord_id", user.discordId)
    .maybeSingle();
  if (ownedError) return { ok: false, error: "Couldn't check that card." };
  if (!owned) return { ok: false, error: "That card isn't in your collection." };

  // A copy already pinned elsewhere moves rather than duplicating — the
  // unique index would otherwise reject the second pin and the user would
  // have to find and clear the old slot themselves.
  const { error: moveError } = await service
    .from("card_binder_slots")
    .delete()
    .eq("discord_id", user.discordId)
    .eq("inventory_id", inventoryId);
  if (moveError) return { ok: false, error: "Couldn't move that card." };

  const { error } = await service
    .from("card_binder_slots")
    .upsert({ discord_id: user.discordId, slot, inventory_id: inventoryId }, { onConflict: "discord_id,slot" });
  if (error) return { ok: false, error: "Couldn't pin that card." };

  revalidatePath("/cards/packs");
  revalidatePath("/academy/cards/packs");
  return { ok: true };
}


/**
 * Pin or unpin one copy without naming a slot — the gesture from the
 * collection shelf, where "put this in my binder" is the whole intent and
 * which of six slots it lands in is not a decision anyone wants to make.
 *
 * Pins into the lowest free slot, so the binder fills left to right. The
 * slot editor is still there for arranging them afterwards.
 */
export async function toggleBinderCardAction(
  inventoryId: number,
): Promise<{ ok: true; pinned: boolean } | { ok: false; error: string }> {
  const user = await getBettingUser();
  if (!user) return { ok: false, error: "Sign in with Discord to use the betting site." };
  if (!user.allowed) return { ok: false, error: "FPL Better members only." };

  const service = createBettingServiceClient();

  const { error: binderError } = await service
    .from("card_binders")
    .upsert({ discord_id: user.discordId }, { onConflict: "discord_id", ignoreDuplicates: true });
  if (binderError) return { ok: false, error: "Couldn't open your binder." };

  const { data: slotRows, error: slotsError } = await service
    .from("card_binder_slots")
    .select("slot, inventory_id")
    .eq("discord_id", user.discordId);
  if (slotsError) return { ok: false, error: "Couldn't read your binder." };
  const slots = (slotRows as { slot: number; inventory_id: number }[]) ?? [];

  // Already on display -> the gesture means "take it out".
  const held = slots.find((row) => row.inventory_id === inventoryId);
  if (held) {
    const { error } = await service
      .from("card_binder_slots")
      .delete()
      .eq("discord_id", user.discordId)
      .eq("slot", held.slot);
    if (error) return { ok: false, error: "Couldn't take that out of your binder." };
    revalidatePath("/cards/packs");
    revalidatePath("/academy/cards/packs");
    return { ok: true, pinned: false };
  }

  // Ownership against the session id, same as setBinderSlotAction: a copy
  // id alone must never be enough to display someone else's card.
  const { data: owned, error: ownedError } = await service
    .from("card_inventory")
    .select("id")
    .eq("id", inventoryId)
    .eq("discord_id", user.discordId)
    .maybeSingle();
  if (ownedError) return { ok: false, error: "Couldn't check that card." };
  if (!owned) return { ok: false, error: "That card isn't in your collection." };

  const taken = new Set(slots.map((row) => row.slot));
  const cap = await slotCapFor(service, user.discordId);
  const free = Array.from({ length: cap }, (_, index) => index + 1).find((slot) => !taken.has(slot));
  // Full is a normal state, not a failure — say what to do about it.
  if (!free) return { ok: false, error: `Your binder is full (${cap} cards). Take one out first.` };

  const { error } = await service
    .from("card_binder_slots")
    .insert({ discord_id: user.discordId, slot: free, inventory_id: inventoryId });
  if (error) return { ok: false, error: "Couldn't add that to your binder." };

  revalidatePath("/cards/packs");
  revalidatePath("/academy/cards/packs");
  return { ok: true, pinned: true };
}

/** Renames the binder. Empty clears it back to the default heading. */
export async function setBinderTitleAction(
  title: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getBettingUser();
  if (!user) return { ok: false, error: "Sign in with Discord to use the betting site." };
  if (!user.allowed) return { ok: false, error: "FPL Better members only." };

  const trimmed = title.trim().slice(0, 60);
  const service = createBettingServiceClient();
  const { error } = await service
    .from("card_binders")
    .upsert({ discord_id: user.discordId, title: trimmed || null, updated_at: new Date().toISOString() }, { onConflict: "discord_id" });
  if (error) return { ok: false, error: "Couldn't rename your binder." };

  revalidatePath("/cards/packs");
  revalidatePath("/academy/cards/packs");
  return { ok: true };
}
