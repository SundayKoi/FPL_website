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
  friendlyExpeditionError,
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
import { createBettingServiceClient } from "@/lib/betting/service-client";
import { CAMPAIGNS, type CampaignKey } from "./campaigns";
import { CAMP_UPGRADES, campFromRow, friendlyCampError, nextLevel, nextPurchase, type CampPurchase, type CampState, type CampUpgrade } from "./camp";
import { fetchCamp } from "./queries";

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
    convoy: typeof options.convoy === "string" && options.convoy.length > 0 ? options.convoy.slice(0, 12) : null,
    campaign: typeof options.campaign === "number" && Number.isInteger(options.campaign) ? options.campaign : null,
    forged: options.forged === true,
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

export type CampaignActionResult = { ok: true } | { ok: false; error: string };

/** Opens a campaign for the season being browsed. One open at a time. */
export async function startCampaignAction(key: CampaignKey, season: string): Promise<CampaignActionResult> {
  const user = await getBettingUser();
  if (!user) return { ok: false, error: SIGN_IN };
  if (!user.allowed) return { ok: false, error: MEMBERS };
  if (!(key in CAMPAIGNS)) return { ok: false, error: "No such campaign." };
  const service = createBettingServiceClient();
  const { error } = await service.rpc("start_expedition_campaign", { p_user: user.discordId, p_season: season.slice(0, 40), p_key: key });
  if (error) return { ok: false, error: error.message.includes("already open") ? "A campaign is already open — finish or abandon it first." : friendlyExpeditionError(error.message) };
  revalidateExpeditionSurfaces();
  return { ok: true };
}

/** Closes an unfinished campaign. A run already out for it walks on. */
export async function abandonCampaignAction(id: number): Promise<CampaignActionResult> {
  const user = await getBettingUser();
  if (!user) return { ok: false, error: SIGN_IN };
  if (!user.allowed) return { ok: false, error: MEMBERS };
  if (!Number.isInteger(id)) return { ok: false, error: "No such campaign." };
  const service = createBettingServiceClient();
  const { error } = await service.rpc("abandon_expedition_campaign", { p_user: user.discordId, p_campaign: id });
  if (error) return { ok: false, error: friendlyExpeditionError(error.message) };
  revalidateExpeditionSurfaces();
  return { ok: true };
}

export type CampActionResult =
  | { ok: true; camp: CampState; balance: number; fragments: number }
  | { ok: false; error: string };

/**
 * One purchase at the base camp, for the caller the session named. Not
 * exported: only the two actions below, which authenticate first, reach it.
 *
 * `shown` is what the player was looking at when they clicked — the level
 * they meant to build, or how many forged policies they held. A camp that
 * has moved since (a second tab, a double click that got here second) is
 * refused rather than sold the NEXT thing at the next price. The price is
 * then read off the table for the level the camp is at, and
 * upgrade_expedition_camp re-prices that level under the lock and refuses
 * any other ('bad price'), which is the part a race cannot get past.
 */
async function buyForCamp(discordId: string, purchase: CampPurchase, shown: (camp: CampState) => boolean): Promise<CampActionResult> {
  const service = createBettingServiceClient();
  const camp = await fetchCamp(service, discordId);
  // Null is "the camp is not here" (the migration is not applied, or the
  // read broke): nothing to sell against.
  if (!camp) return { ok: false, error: "The base camp isn't open yet — try again later." };
  if (!shown(camp)) return { ok: false, error: friendlyCampError("bad price") ?? friendlyExpeditionError("bad price") };
  const next = nextPurchase(camp, purchase);
  if (!next) {
    const reason = purchase !== "policy" ? "already built" : camp.forge < 1 ? "forge not built" : "forge is full";
    return { ok: false, error: friendlyCampError(reason) ?? friendlyExpeditionError(reason) };
  }
  const { data, error } = await service.rpc("upgrade_expedition_camp", {
    p_user: discordId,
    p_upgrade: purchase,
    p_dollars: next.price.dollars,
    p_fragments: next.price.fragments,
  });
  if (error) return { ok: false, error: friendlyCampError(error.message) ?? friendlyExpeditionError(error.message) };
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  if (!row) return { ok: false, error: "Something went wrong with that purchase — nothing was taken." };
  revalidateExpeditionSurfaces();
  return {
    ok: true,
    // The RPC hands back the levels, not the running total: the total is
    // what it was plus what this cost.
    camp: campFromRow({ ...row, spent: camp.spent + next.price.dollars }),
    balance: Number(row.balance ?? 0),
    fragments: Number(row.fragments ?? 0),
  };
}

/** Builds the next level of one base-camp upgrade. `level` is the level
 *  the player was shown and clicked to build. */
export async function upgradeCampAction(upgrade: CampUpgrade, level: number): Promise<CampActionResult> {
  const user = await getBettingUser();
  if (!user) return { ok: false, error: SIGN_IN };
  if (!user.allowed) return { ok: false, error: MEMBERS };
  if (!CAMP_UPGRADES.includes(upgrade)) return { ok: false, error: friendlyCampError("unknown upgrade") ?? friendlyExpeditionError("unknown upgrade") };
  if (!Number.isInteger(level)) return { ok: false, error: friendlyCampError("bad price") ?? friendlyExpeditionError("bad price") };
  return buyForCamp(user.discordId, upgrade, (camp) => nextLevel(camp, upgrade) === level);
}

/** Forges one policy at the base camp's forge, from map fragments.
 *  `held` is how many forged policies the player was shown holding. */
export async function forgePolicyAction(held: number): Promise<CampActionResult> {
  const user = await getBettingUser();
  if (!user) return { ok: false, error: SIGN_IN };
  if (!user.allowed) return { ok: false, error: MEMBERS };
  if (!Number.isInteger(held)) return { ok: false, error: friendlyCampError("bad price") ?? friendlyExpeditionError("bad price") };
  return buyForCamp(user.discordId, "policy", (camp) => camp.forgedPolicies === held);
}
