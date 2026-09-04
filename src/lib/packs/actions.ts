"use server";

// The two client-callable pack actions, and nothing else. Every export of a
// "use server" module becomes an invokable endpoint, so the open logic —
// which takes a bare Discord id on trust — lives in ./open.ts behind
// "server-only" and is composed here AFTER the session says who is calling.
// Exporting it from this file would let any browser open packs as anyone.

import { revalidatePath } from "next/cache";
import { getBettingUser } from "@/lib/betting/wallet";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import { flameUnlocked, PATRON_FLAME_KEYS, PATRON_FLAMES, type PatronFlameKey } from "@/lib/patron/flames";
import { fetchPatronTenureDays } from "@/lib/patron/queries";
import { fetchCardSeason, type CardLeague } from "@/lib/cards/queries";
import { CHAMPIONS_PACK_COST } from "@/lib/cards/champions";
import { PACK_COST } from "./config";
import { openChampionsPack, openPackFor, type OpenPackResult } from "./open";
import { autoDustPulls } from "@/lib/cards/autoDustServer";

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
  return withAutoDust(user.discordId, league, await openPackFor(user.discordId, league, { requestedWeek, fallbackBalance: user.balance - PACK_COST }));
}

/**
 * The collector's auto-dust rule, applied to a pack that just opened.
 * Nothing about the open changes: the pulls are minted, then whatever the
 * rule selects is dusted through dust_card like a tapped dust, and the
 * result says which so the overlay can show them as gone.
 */
async function withAutoDust(discordId: string, league: CardLeague, result: OpenPackResult): Promise<OpenPackResult> {
  if (!result.ok) return result;
  try {
    const service = createBettingServiceClient();
    const season = await fetchCardSeason(service, league);
    if (!season) return result;
    const taken = await autoDustPulls(
      service,
      discordId,
      season,
      result.cards.map((pull) => ({
        inventoryId: pull.inventoryId,
        slug: pull.card.slug,
        tier: pull.card.tier.key,
        overall: pull.card.overall,
        foil: pull.foil,
        foilType: pull.foilType,
        signed: pull.signed,
        relic: Boolean(pull.card.moment || pull.card.champWin || pull.card.team),
        // A pull is FROM the pack's week (a live pack has none, and groups
        // as one edition).
        editionWeek: result.editionWeek ?? "",
      })),
    );
    if (!taken) return result;
    return { ...result, balance: taken.balance ?? result.balance, autoDusted: { ids: taken.ids, dusted: taken.dusted, value: taken.value } };
  } catch (error) {
    console.error("packs: auto-dust after open failed", error);
    return result;
  }
}

/**
 * The free daily pack — the Daily Rip.
 *
 * Same pool, same roll, same reveal as a bought pack; the only difference
 * is the RPC (open_daily_pack enforces the one-per-Eastern-day limit — two
 * for patrons — and pays the streak bonus). The rip follows the shop's
 * week picker like a bought pack does: every archived edition stays
 * rippable, defaulting to the newest.
 */
export async function openDailyRipAction(league: CardLeague, requestedWeek?: string): Promise<OpenPackResult> {
  const user = await getBettingUser();
  if (!user) return { ok: false, error: "Sign in with Discord to use the betting site." };
  if (!user.allowed) return { ok: false, error: "FPL Better members only." };
  return withAutoDust(user.discordId, league, await openPackFor(user.discordId, league, { daily: true, requestedWeek, fallbackBalance: user.balance }));
}

/**
 * The Faceless Drop — one card of the S4 champions' Hand. The window
 * check lives in the core (the shop button disappearing is presentation;
 * the timestamp is the gate).
 */
export async function openChampionsPackAction(): Promise<OpenPackResult> {
  const user = await getBettingUser();
  if (!user) return { ok: false, error: "Sign in with Discord to use the betting site." };
  if (!user.allowed) return { ok: false, error: "FPL Better members only." };
  return openChampionsPack(user.discordId, { fallbackBalance: user.balance - CHAMPIONS_PACK_COST });
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
  // The tenure flames (Sovereign) ask for time served, not just an active
  // month — the wardrobe shows the lock, this enforces it.
  if ((PATRON_FLAMES[flame as PatronFlameKey].tenureDays ?? 0) > 0) {
    const tenure = await fetchPatronTenureDays(service, user.discordId);
    if (!flameUnlocked(flame as PatronFlameKey, tenure)) {
      return { ok: false, error: "That flame unlocks after six months of patronage." };
    }
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
