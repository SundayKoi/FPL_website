"use server";

import { revalidatePath } from "next/cache";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import { getBettingUser } from "@/lib/betting/wallet";

type Result = { ok: true; id?: number; value?: number; balance?: number } | { ok: false; error: string };
const SIGN_IN = "Sign in with Discord to use Season's End commerce.";
const MEMBERS_ONLY = "FPL Better members only.";

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function noteValue(value: unknown): string | null | undefined {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const note = value.trim();
  return note.length <= 80 ? note || null : undefined;
}

function friendly(message: string): string {
  if (/insufficient balance/i.test(message)) return "You don't have enough betting dollars for that.";
  if (/not available|does not match|stale|no longer owned/i.test(message)) return "That Season's End copy is no longer available.";
  if (/not open|already taken|expired/i.test(message)) return "That offer has already changed.";
  if (/own listing|own want/i.test(message)) return "You cannot accept your own offer.";
  if (/invalid|too long/i.test(message)) return "That commerce request is invalid.";
  if (/public/i.test(message)) return "That Season's End release is not open for community commerce.";
  return "Season's End commerce could not be completed.";
}

function revalidateCommerce(): void {
  revalidatePath("/cards/season-end");
  revalidatePath("/academy/cards/season-end");
  revalidatePath("/cards/season-end/market");
  revalidatePath("/academy/cards/season-end/market");
}

async function member(): Promise<{ discordId: string } | Result> {
  const user = await getBettingUser();
  if (!user) return { ok: false, error: SIGN_IN };
  if (!user.allowed) return { ok: false, error: MEMBERS_ONLY };
  return { discordId: user.discordId };
}

function isError(value: { discordId: string } | Result): value is Result {
  return "ok" in value;
}

export async function quoteSeasonEndDustAction(inventoryId: number): Promise<Result> {
  const auth = await member();
  if (isError(auth)) return auth;
  if (!positiveInteger(inventoryId)) return { ok: false, error: "That copy id is invalid." };
  const { data, error } = await createBettingServiceClient().rpc("season_end_dust_quote", { p_user: auth.discordId, p_inventory: inventoryId });
  if (error) return { ok: false, error: friendly(error.message) };
  const row = (Array.isArray(data) ? data[0] : data) as { value?: unknown; balance?: unknown } | null;
  if (!row || !Number.isFinite(Number(row.value))) return { ok: false, error: "That copy could not be valued." };
  return { ok: true, value: Number(row.value), balance: Number(row.balance ?? 0) };
}

export async function dustSeasonEndCopyAction(inventoryId: number): Promise<Result> {
  const auth = await member();
  if (isError(auth)) return auth;
  if (!positiveInteger(inventoryId)) return { ok: false, error: "That copy id is invalid." };
  const { data, error } = await createBettingServiceClient().rpc("dust_season_end_copy", { p_user: auth.discordId, p_inventory: inventoryId });
  if (error) return { ok: false, error: friendly(error.message) };
  const row = (Array.isArray(data) ? data[0] : data) as { value?: unknown; balance?: unknown } | null;
  revalidateCommerce();
  return { ok: true, value: Number(row?.value ?? 0), balance: Number(row?.balance ?? 0) };
}

export async function createSeasonEndListingAction(input: { inventoryId: number; ask: number; note?: string | null }): Promise<Result> {
  const auth = await member();
  if (isError(auth)) return auth;
  if (!positiveInteger(input?.inventoryId) || !positiveInteger(input?.ask) || input.ask > 100000) return { ok: false, error: "Ask for a whole number from 1 to 100,000." };
  const note = noteValue(input?.note);
  if (note === undefined) return { ok: false, error: "Listing notes must be 80 characters or fewer." };
  const { data, error } = await createBettingServiceClient().rpc("create_season_end_listing", { p_user: auth.discordId, p_inventory: input.inventoryId, p_ask: input.ask, p_note: note });
  if (error) return { ok: false, error: friendly(error.message) };
  revalidateCommerce();
  return { ok: true, id: Number(data) };
}

export async function buySeasonEndListingAction(listingId: number): Promise<Result> {
  const auth = await member();
  if (isError(auth)) return auth;
  if (!positiveInteger(listingId)) return { ok: false, error: "That listing id is invalid." };
  const { error } = await createBettingServiceClient().rpc("buy_season_end_listing", { p_listing: listingId, p_buyer: auth.discordId });
  if (error) return { ok: false, error: friendly(error.message) };
  revalidateCommerce();
  return { ok: true };
}

export async function cancelSeasonEndListingAction(listingId: number): Promise<Result> {
  const auth = await member();
  if (isError(auth)) return auth;
  if (!positiveInteger(listingId)) return { ok: false, error: "That listing id is invalid." };
  const { error } = await createBettingServiceClient().rpc("cancel_season_end_listing", { p_listing: listingId, p_user: auth.discordId });
  if (error) return { ok: false, error: friendly(error.message) };
  revalidateCommerce();
  return { ok: true };
}

export async function createSeasonEndWantAction(input: { releaseId: string; designId: string; bounty: number; note?: string | null }): Promise<Result> {
  const auth = await member();
  if (isError(auth)) return auth;
  if (typeof input?.releaseId !== "string" || typeof input?.designId !== "string" || !positiveInteger(input?.bounty) || input.bounty > 100000) return { ok: false, error: "That wanted offer is invalid." };
  const note = noteValue(input?.note);
  if (note === undefined) return { ok: false, error: "Wanted notes must be 80 characters or fewer." };
  const { data, error } = await createBettingServiceClient().rpc("create_season_end_want", { p_user: auth.discordId, p_release: input.releaseId, p_design_id: input.designId, p_bounty: input.bounty, p_note: note });
  if (error) return { ok: false, error: friendly(error.message) };
  revalidateCommerce();
  return { ok: true, id: Number(data) };
}

export async function fillSeasonEndWantAction(wantId: number, inventoryId: number): Promise<Result> {
  const auth = await member();
  if (isError(auth)) return auth;
  if (!positiveInteger(wantId) || !positiveInteger(inventoryId)) return { ok: false, error: "That wanted offer is invalid." };
  const { error } = await createBettingServiceClient().rpc("fill_season_end_want", { p_want: wantId, p_seller: auth.discordId, p_inventory: inventoryId });
  if (error) return { ok: false, error: friendly(error.message) };
  revalidateCommerce();
  return { ok: true };
}

export async function cancelSeasonEndWantAction(wantId: number): Promise<Result> {
  const auth = await member();
  if (isError(auth)) return auth;
  if (!positiveInteger(wantId)) return { ok: false, error: "That wanted offer id is invalid." };
  const { error } = await createBettingServiceClient().rpc("cancel_season_end_want", { p_want: wantId, p_user: auth.discordId });
  if (error) return { ok: false, error: friendly(error.message) };
  revalidateCommerce();
  return { ok: true };
}

export async function createSeasonEndTradeAction(input: { releaseId: string; toDiscordId: string; offeredInventoryIds: number[]; requestedInventoryIds: number[]; offeredDollars?: number; requestedDollars?: number }): Promise<Result> {
  const auth = await member();
  if (isError(auth)) return auth;
  if (!Array.isArray(input?.offeredInventoryIds) || !Array.isArray(input?.requestedInventoryIds)) return { ok: false, error: "That trade's copy ids are invalid." };
  const offered = input.offeredInventoryIds;
  const requested = input.requestedInventoryIds;
  if ([...offered, ...requested].some((id) => !positiveInteger(id))) return { ok: false, error: "Every trade copy id must be a positive whole number; no ids were discarded." };
  const offeredDollars = Number.isSafeInteger(input?.offeredDollars ?? 0) ? Number(input?.offeredDollars ?? 0) : -1;
  const requestedDollars = Number.isSafeInteger(input?.requestedDollars ?? 0) ? Number(input?.requestedDollars ?? 0) : -1;
  if (typeof input?.releaseId !== "string" || typeof input?.toDiscordId !== "string" || !input.toDiscordId || offeredDollars < 0 || requestedDollars < 0 || (offered.length + requested.length === 0 && offeredDollars + requestedDollars === 0)) return { ok: false, error: "That trade needs a copy or betting dollars on at least one side." };
  const { data, error } = await createBettingServiceClient().rpc("create_season_end_trade", { p_from: auth.discordId, p_to: input.toDiscordId, p_release: input.releaseId, p_offered: offered, p_requested: requested, p_offered_dollars: offeredDollars, p_requested_dollars: requestedDollars });
  if (error) return { ok: false, error: friendly(error.message) };
  revalidateCommerce();
  return { ok: true, id: Number(data) };
}

export async function acceptSeasonEndTradeAction(tradeId: number): Promise<Result> {
  const auth = await member();
  if (isError(auth)) return auth;
  if (!positiveInteger(tradeId)) return { ok: false, error: "That trade id is invalid." };
  const { error } = await createBettingServiceClient().rpc("accept_season_end_trade", { p_trade: tradeId, p_user: auth.discordId });
  if (error) return { ok: false, error: friendly(error.message) };
  revalidateCommerce();
  return { ok: true };
}

export async function declineSeasonEndTradeAction(tradeId: number): Promise<Result> {
  const auth = await member();
  if (isError(auth)) return auth;
  if (!positiveInteger(tradeId)) return { ok: false, error: "That trade id is invalid." };
  const { error } = await createBettingServiceClient().rpc("decline_season_end_trade", { p_trade: tradeId, p_user: auth.discordId });
  if (error) return { ok: false, error: friendly(error.message) };
  revalidateCommerce();
  return { ok: true };
}

export async function cancelSeasonEndTradeAction(tradeId: number): Promise<Result> {
  const auth = await member();
  if (isError(auth)) return auth;
  if (!positiveInteger(tradeId)) return { ok: false, error: "That trade id is invalid." };
  const { error } = await createBettingServiceClient().rpc("cancel_season_end_trade", { p_trade: tradeId, p_user: auth.discordId });
  if (error) return { ok: false, error: friendly(error.message) };
  revalidateCommerce();
  return { ok: true };
}
