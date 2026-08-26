"use server";

// The two client-callable pack actions, and nothing else. Every export of a
// "use server" module becomes an invokable endpoint, so the open logic —
// which takes a bare Discord id on trust — lives in ./open.ts behind
// "server-only" and is composed here AFTER the session says who is calling.
// Exporting it from this file would let any browser open packs as anyone.

import { revalidatePath } from "next/cache";
import { getBettingUser } from "@/lib/betting/wallet";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import { PATRON_FLAME_KEYS } from "@/lib/patron/flames";
import type { CardLeague } from "@/lib/cards/queries";
import { PACK_COST } from "./config";
import { openPackFor, type OpenPackResult } from "./open";

export async function openPackAction(
  league: CardLeague,
  /** Which week's cards to mint. Omitted (or unarchived) means the current
   *  live ratings. Every archived week stays purchasable forever — no
   *  edition is ever closed off. */
  requestedWeek?: string,
): Promise<OpenPackResult> {
  const user = await getBettingUser();
  if (!user) return { ok: false, error: "Sign in with Discord to use the betting site." };
  if (!user.allowed) return { ok: false, error: "FPL Better members only." };
  return openPackFor(user.discordId, league, { requestedWeek, fallbackBalance: user.balance - PACK_COST });
}

/**
 * The free daily pack — the Daily Rip.
 *
 * Same pool, same roll, same reveal as a bought pack; the only differences
 * are the RPC (open_daily_pack enforces the one-per-Eastern-day limit — two
 * for patrons — and pays the streak bonus) and that it always mints the
 * newest edition. "Today's rip" choosing a vintage week would make the
 * daily a discount store instead of a ritual.
 */
export async function openDailyRipAction(league: CardLeague): Promise<OpenPackResult> {
  const user = await getBettingUser();
  if (!user) return { ok: false, error: "Sign in with Discord to use the betting site." };
  if (!user.allowed) return { ok: false, error: "FPL Better members only." };
  return openPackFor(user.discordId, league, { daily: true, fallbackBalance: user.balance });
}

/**
 * Stores the caller's Patron Flame pick. Patron-gated server-side: the
 * flame renders only while patronage is active, but letting non-patrons
 * pre-pick would make "become a patron" quietly stateful — cleaner that
 * the wardrobe opens when the flame does.
 */
export async function setPatronFlameAction(flame: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getBettingUser();
  if (!user) return { ok: false, error: "Sign in with Discord first." };
  if (!(PATRON_FLAME_KEYS as readonly string[]).includes(flame)) {
    return { ok: false, error: "That flame isn't in the wardrobe." };
  }
  const service = createBettingServiceClient();
  const { data } = await service
    .from("betting_profiles")
    .select("patron_until")
    .eq("discord_id", user.discordId)
    .maybeSingle();
  const until = (data as { patron_until: string | null } | null)?.patron_until;
  if (!until || new Date(until).getTime() <= Date.now()) {
    return { ok: false, error: "The flame wardrobe is for active patrons." };
  }
  const { error } = await service
    .from("betting_profiles")
    .update({ patron_flame: flame })
    .eq("discord_id", user.discordId);
  if (error) return { ok: false, error: "Could not save that — try again." };
  revalidatePath("/cards/packs");
  revalidatePath("/academy/cards/packs");
  return { ok: true };
}
