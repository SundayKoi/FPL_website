"use server";

// The two client-callable expedition actions, and nothing else. Every
// export of a "use server" module becomes an invokable endpoint, so the
// expedition logic — which takes a bare Discord id on trust — lives in
// ./runs.ts behind "server-only" and is composed here AFTER the session
// says who is calling. Exporting it from this file would let any browser
// send anybody's cards out, and claim anybody's payout into their wallet.
//
// Same shape as src/lib/packs/actions.ts: authenticate, check membership,
// delegate, revalidate.

import { revalidatePath } from "next/cache";
import { getBettingUser } from "@/lib/betting/wallet";
import { claimExpeditionFor, launchExpeditionFor, type ClaimResult, type LaunchResult } from "./runs";
import type { ExpeditionTierKey } from "./config";

/** Both expedition surfaces — the board itself, and the shelf whose melt
 *  buttons the deploy lock disables. */
function revalidateExpeditionSurfaces(): void {
  revalidatePath("/cards/expeditions");
  revalidatePath("/cards/packs");
  revalidatePath("/academy/cards/packs");
}

/** Sends three owned copies out on `tier`. */
export async function launchExpeditionAction(
  tier: ExpeditionTierKey,
  squadIds: number[],
): Promise<LaunchResult> {
  const user = await getBettingUser();
  if (!user) return { ok: false, error: "Sign in with Discord to use the betting site." };
  if (!user.allowed) return { ok: false, error: "FPL Better members only." };
  const result = await launchExpeditionFor(user.discordId, tier, squadIds);
  // Only on success: a refused launch changed nothing, and busting the
  // page cache on every rejected click would make a mis-picked squad cost
  // a rerender of the whole collection.
  if (result.ok) revalidateExpeditionSurfaces();
  return result;
}

/** Brings a finished squad home and banks what it found. */
export async function claimExpeditionAction(runId: number): Promise<ClaimResult> {
  const user = await getBettingUser();
  if (!user) return { ok: false, error: "Sign in with Discord to use the betting site." };
  if (!user.allowed) return { ok: false, error: "FPL Better members only." };
  const result = await claimExpeditionFor(user.discordId, runId);
  if (result.ok) revalidateExpeditionSurfaces();
  return result;
}
