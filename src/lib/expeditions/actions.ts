"use server";

// The client-callable expedition actions, and nothing else. Every export
// of a "use server" module becomes an invokable endpoint, so the
// expedition logic — which takes a bare Discord id on trust — lives in
// ./runs.ts behind "server-only" and is composed here AFTER the session
// says who is calling. Exporting it from this file would let any browser
// send anybody's cards out, and claim anybody's payout into their wallet.
//
// Same shape as src/lib/packs/actions.ts: authenticate, check membership,
// delegate, revalidate.

import { revalidatePath } from "next/cache";
import { getBettingUser } from "@/lib/betting/wallet";
import {
  claimExpeditionFor,
  decideForkFor,
  launchExpeditionFor,
  ransomLostCardFor,
  type ClaimResult,
  type DecideResult,
  type LaunchOptions,
  type LaunchResult,
  type RansomResult,
} from "./runs";
import type { ExpeditionTierKey } from "./config";
import type { ForkChoice } from "./routes";

/** Every expedition surface — the board itself, the shelves whose melt
 *  buttons the deploy lock disables, and the Play tab's status line. */
function revalidateExpeditionSurfaces(): void {
  revalidatePath("/cards/expeditions");
  revalidatePath("/academy/cards/expeditions");
  revalidatePath("/cards/packs");
  revalidatePath("/academy/cards/packs");
  revalidatePath("/cards/collection");
  revalidatePath("/cards/play");
}

const SIGN_IN = "Sign in with Discord to use the betting site.";
const MEMBERS = "FPL Better members only.";

/** Sends three owned copies out on `tier`. */
export async function launchExpeditionAction(
  tier: ExpeditionTierKey,
  squadIds: number[],
  options: LaunchOptions = {},
): Promise<LaunchResult> {
  const user = await getBettingUser();
  if (!user) return { ok: false, error: SIGN_IN };
  if (!user.allowed) return { ok: false, error: MEMBERS };
  const result = await launchExpeditionFor(user.discordId, tier, squadIds, {
    insured: options.insured === true,
    target: typeof options.target === "number" ? options.target : null,
  });
  // Only on success: a refused launch changed nothing, and busting the
  // page cache on every rejected click would make a mis-picked squad cost
  // a rerender of the whole collection.
  if (result.ok) revalidateExpeditionSurfaces();
  return result;
}

/** Answers the fork a squad is waiting at. */
export async function decideForkAction(runId: number, index: number, choice: ForkChoice): Promise<DecideResult> {
  const user = await getBettingUser();
  if (!user) return { ok: false, error: SIGN_IN };
  if (!user.allowed) return { ok: false, error: MEMBERS };
  const result = await decideForkFor(user.discordId, runId, index, choice);
  if (result.ok) revalidateExpeditionSurfaces();
  return result;
}

/** Brings a finished squad home and banks what it found. */
export async function claimExpeditionAction(runId: number): Promise<ClaimResult> {
  const user = await getBettingUser();
  if (!user) return { ok: false, error: SIGN_IN };
  if (!user.allowed) return { ok: false, error: MEMBERS };
  const result = await claimExpeditionFor(user.discordId, runId);
  if (result.ok) revalidateExpeditionSurfaces();
  return result;
}

/** Buys a lost card back. */
export async function ransomLostCardAction(holdId: number): Promise<RansomResult> {
  const user = await getBettingUser();
  if (!user) return { ok: false, error: SIGN_IN };
  if (!user.allowed) return { ok: false, error: MEMBERS };
  const result = await ransomLostCardFor(user.discordId, holdId);
  if (result.ok) revalidateExpeditionSurfaces();
  return result;
}
