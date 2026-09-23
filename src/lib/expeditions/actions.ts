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

// === the road ahead ==========================================================

import { revealErrorMessage } from "./reveal";

export type RevealRoadResult = { ok: true; fragments: number } | { ok: false; error: string };

/**
 * Spends a map fragment to see a run's whole road. The Discord id comes
 * from the session, never the browser; reveal_expedition_road checks under
 * its locks that the run is this collector's and still walking, that the
 * road is not already theirs or their convoy's, and takes the fragment in
 * the same transaction as the reveal. The page derives the revealed road
 * again on the refresh this triggers — nothing about the road is returned.
 */
export async function revealRoadAction(runId: number): Promise<RevealRoadResult> {
  const user = await getBettingUser();
  if (!user) return { ok: false, error: SIGN_IN };
  if (!user.allowed) return { ok: false, error: MEMBERS };
  if (!Number.isSafeInteger(runId) || runId <= 0) return { ok: false, error: revealErrorMessage("unknown run") };
  const service = createBettingServiceClient();
  const { data, error } = await service.rpc("reveal_expedition_road", { p_user: user.discordId, p_run: runId });
  if (error) return { ok: false, error: revealErrorMessage(error.message ?? String(error)) };
  const row = (Array.isArray(data) ? data[0] : data) as { fragments?: number | string | null } | null;
  const left = Number(row?.fragments);
  revalidateExpeditionSurfaces();
  return { ok: true, fragments: Number.isFinite(left) && left > 0 ? Math.floor(left) : 0 };
}
