"use server";

// The two ways a card leaves your shelf, from the app side: dust it, or
// trade it.
//
// Same shape as every other betting action (src/lib/packs/actions.ts):
// getBettingUser → access check → service-role client → an RPC that takes
// `p_user` derived from the SESSION, never from the arguments. Only ids and
// amounts travel over the wire; who is dusting, what a card is worth, and
// which season a trade belongs to are all re-derived here, so a client that
// lies about any of them is simply overruled.
//
// The dollar value of a dust is computed server-side from the row's own
// tier/foil/signed columns rather than accepted from the caller — the client
// never gets to name its own price, exactly like PACK_COST on the way in.

import { revalidatePath } from "next/cache";
import { getBettingUser } from "@/lib/betting/wallet";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import type { PlayerCardData } from "@/lib/cards/build";
import { fetchCardSeason, type CardLeague } from "@/lib/cards/queries";
import { fetchProvenance, type ProvenanceEvent } from "@/lib/cards/provenance";
import { ECLIPSE_FOIL_TYPE, MAX_DUST_BATCH, patronDustValue } from "@/lib/packs/config";
import { patronActive } from "@/lib/patron/flames";

/** Whether this wallet gets the patron dust bonus, read at dust time so a
 *  lapsed patronage stops paying the moment it ends. */
async function dustsAsPatron(service: ReturnType<typeof createBettingServiceClient>, discordId: string): Promise<boolean> {
  const { data } = await service
    .from("betting_profiles")
    .select("patron_until")
    .eq("discord_id", discordId)
    .maybeSingle();
  return patronActive((data as { patron_until: string | null } | null)?.patron_until);
}
import { fetchInventory, type InventoryRow } from "@/lib/packs/queries";
import { isAltArt } from "./queries";
import { lockedInventoryIds } from "./guards";

/** Most dollars either side of one trade may carry. A ceiling, not a
 *  balance check — the RPC is the thing that knows what a wallet holds. */
const MAX_TRADE_DOLLARS = 100_000;

/** Cards per side. Enough for a bundle, few enough that one offer can't name
 *  an entire collection (and blow up the accept RPC's id arrays). */
const MAX_TRADE_CARDS = 20;

type DustResult = { ok: true; value: number; balance: number } | { ok: false; error: string };
export type DustAllResult =
  | { ok: true; dusted: number; value: number; balance: number; skipped: number }
  | { ok: false; error: string };
type CreateResult = { ok: true; id: number } | { ok: false; error: string };
type RespondResult = { ok: true } | { ok: false; error: string };

/** A copy as the trade builder lists it — the flat columns, plus the one bit
 *  of the frozen json a summary needs (`altArt`, reduced server-side). The
 *  json itself is still dropped: the builder renders checkbox rows, and a big
 *  collection would ship megabytes of art metadata to the client for the
 *  handful of copies anyone actually opens. The looking is served by
 *  fetchInventoryCardAction, one card at a time. */
type PartnerCard = Pick<
  InventoryRow,
  "id" | "slug" | "playerName" | "role" | "overall" | "tier" | "foil" | "signed" | "editionWeek"
> & { altArt: boolean };

type PartnerInventoryResult = { ok: true; cards: PartnerCard[] } | { ok: false; error: string };

type InventoryCardResult = { ok: true; card: PlayerCardData } | { ok: false; error: string };

type ProvenanceResult = { ok: true; events: ProvenanceEvent[] } | { ok: false; error: string };

interface OwnedCardRow {
  id: number;
  discord_id: string;
  season: string;
  tier: string;
  foil: boolean;
  foil_type: string | null;
  signed: boolean | null;
  /** The generated column off card.mutation — what dust pricing reads. */
  mutation: string | null;
  /** The finishes, read straight off the card json (PostgREST aliases):
   *  dust pricing multiplies on them (packs/config.ts). */
  shiny?: boolean | null;
  secret?: { number: number; of: number } | null;
}

/** Both card pages, in both leagues — a dusted or traded card has to leave
 *  the collection grid everywhere it is shown. */
function revalidateCardSurfaces(): void {
  revalidatePath("/cards/packs");
  revalidatePath("/academy/cards/packs");
  revalidatePath("/cards/trades");
  revalidatePath("/academy/cards/trades");
}

/** `dust_card`'s raw `raise exception` text → friendly copy. Same contract as
 *  friendlyOpenPackError: never surface a raw Postgres error. */
/** Said the same way wherever it is refused — the local check and the RPC's
 *  own refusal are two guards on one rule, and a rule that phrases itself
 *  differently depending on which guard caught it reads as two rules. */
const ECLIPSE_UNDUSTABLE = "An Eclipse is a one-of-one — it can't be dusted, but you can trade it.";

function friendlyDustError(message: string): string {
  // Not dust_card's own text: card_inventory_expedition_guard raises this
  // from under the DELETE, so it reaches this mapper through the RPC.
  if (/card is on expedition/i.test(message)) return "That card is out on an expedition.";
  if (/eclipse cannot be dusted/i.test(message)) return ECLIPSE_UNDUSTABLE;
  if (/card not owned/i.test(message)) return "That card isn't yours.";
  if (/unknown card/i.test(message)) return "That card is already gone.";
  if (/invalid dust value/i.test(message)) return "That card can't be dusted right now.";
  if (/unknown user/i.test(message)) return "Account not found — try signing in again.";
  return "Something went wrong dusting that card.";
}

/** `accept_card_trade`'s raw exception text → friendly copy. */
function friendlyAcceptError(message: string): string {
  // Same guard, reached the other way: accept_card_trade moves discord_id,
  // which is the other write card_inventory_expedition_guard refuses.
  if (/card is on expedition/i.test(message)) return "That card is out on an expedition.";
  // card_inventory_curse_guard, under the same ownership update: a fresh
  // Cursed card cannot change hands for a week.
  if (/card is cursed/i.test(message)) return "A card in this trade is Cursed and can't change hands yet.";
  if (/trade is stale/i.test(message)) return "A card in this trade is no longer available.";
  if (/insufficient balance/i.test(message)) return "One side can't cover the dollars in this trade.";
  if (/not pending/i.test(message)) return "That trade has already been answered.";
  if (/not yours to accept/i.test(message)) return "That trade isn't yours to accept.";
  if (/unknown trade/i.test(message)) return "That trade no longer exists.";
  return "Something went wrong accepting that trade.";
}

/**
 * Sells one owned copy back for betting dollars.
 *
 * The copy is looked up first for three reasons that all have to happen
 * before any money moves: to prove the caller owns it, to price it from its
 * real tier/foil/signed columns, and to learn which season it belongs to so
 * the fantasy lock can be checked against the right week.
 */
export async function dustCardAction(inventoryId: number): Promise<DustResult> {
  if (!Number.isInteger(inventoryId)) return { ok: false, error: "That card can't be dusted." };

  const user = await getBettingUser();
  if (!user) return { ok: false, error: "Sign in with Discord to use the betting site." };
  if (!user.allowed) return { ok: false, error: "FPL Better members only." };

  const service = createBettingServiceClient();
  const { data, error } = await service
    .from("card_inventory")
    .select("id, discord_id, season, tier, foil, foil_type, signed, mutation, shiny:card->shiny, secret:card->secret")
    .eq("id", inventoryId)
    .maybeSingle();
  if (error) return { ok: false, error: "Couldn't read your collection — try again." };

  const row = data as OwnedCardRow | null;
  // Not-yours and doesn't-exist collapse into one message on purpose: a
  // stranger probing ids shouldn't learn which ones are real.
  if (!row || row.discord_id !== user.discordId) return { ok: false, error: "That card isn't yours." };

  if (row.foil_type === ECLIPSE_FOIL_TYPE) return { ok: false, error: ECLIPSE_UNDUSTABLE };

  const locked = await lockedInventoryIds(service, user.discordId, row.season);
  if (locked.has(row.id)) return { ok: false, error: "That card is fielded in this week's lineup." };

  // foil_type included: without it a Cracked Ice would dust for the base
  // foil rate, quietly paying out a fifth of what the copy is worth.
  const value = patronDustValue(
    {
      tier: row.tier,
      foil: row.foil,
      foilType: row.foil_type,
      signed: row.signed === true,
      mutation: row.mutation,
      shiny: Boolean(row.shiny),
      secret: Boolean(row.secret),
    },
    await dustsAsPatron(service, user.discordId),
  );
  const { data: balance, error: rpcError } = await service.rpc("dust_card", {
    p_user: user.discordId,
    p_inventory: row.id,
    p_value: value,
  });
  if (rpcError) return { ok: false, error: friendlyDustError(rpcError.message) };

  revalidateCardSurfaces();
  return { ok: true, value, balance: Number(balance) };
}

/**
 * Sells a handful of owned copies back in one go — the "Sell pack" button.
 *
 * Same guards as dustCardAction, priced per copy server-side, but the
 * ownership read and the fantasy-lock read happen ONCE for the batch. The
 * money still moves through dust_card one copy at a time: the RPC's
 * delete-and-credit is the atomic unit, so a copy that fails (already
 * traded away in another tab, say) skips without poisoning the rest.
 *
 * Capped at a pack-and-change: this is for the pack you just opened, not
 * for liquidating a collection.
 */
export async function dustManyAction(inventoryIds: number[]): Promise<DustAllResult> {
  const ids = normalizeIds(inventoryIds);
  if (!ids || ids.length === 0) return { ok: false, error: "Nothing to sell." };
  if (ids.length > MAX_DUST_BATCH) {
    return { ok: false, error: `That's too many cards to sell at once — ${MAX_DUST_BATCH} is the limit.` };
  }

  const user = await getBettingUser();
  if (!user) return { ok: false, error: "Sign in with Discord to use the betting site." };
  if (!user.allowed) return { ok: false, error: "FPL Better members only." };

  const service = createBettingServiceClient();
  const { data, error } = await service
    .from("card_inventory")
    .select("id, discord_id, season, tier, foil, foil_type, signed, mutation, shiny:card->shiny, secret:card->secret")
    .in("id", ids);
  if (error) return { ok: false, error: "Couldn't read your collection — try again." };

  const owned = ((data as OwnedCardRow[]) ?? []).filter((row) => row.discord_id === user.discordId);
  if (owned.length === 0) return { ok: false, error: "Those cards aren't yours." };

  // One lock read per season in the batch (a pack is one season, so
  // normally one), not one per card.
  const seasons = [...new Set(owned.map((row) => row.season))];
  const lockedBySeason = new Map(
    await Promise.all(
      seasons.map(async (season) => [season, await lockedInventoryIds(service, user.discordId, season)] as const),
    ),
  );

  let dusted = 0;
  let value = 0;
  let balance: number | null = null;
  let skipped = ids.length - owned.length;
  const patron = await dustsAsPatron(service, user.discordId);
  for (const row of owned) {
    if (lockedBySeason.get(row.season)?.has(row.id)) {
      skipped += 1;
      continue;
    }
    // Skipped rather than refused: this is the mass-select path, and the
    // one place a one-of-one is most likely to be dusted is inside a
    // fifty-card sweep nobody read carefully. The RPC would reject it
    // anyway — passing over it here means the rest of the sweep still goes
    // through, and the count tells them something was held back.
    if (row.foil_type === ECLIPSE_FOIL_TYPE) {
      skipped += 1;
      continue;
    }
    const rowValue = patronDustValue(
      {
        tier: row.tier,
        foil: row.foil,
        foilType: row.foil_type,
        signed: row.signed === true,
        mutation: row.mutation,
        shiny: Boolean(row.shiny),
        secret: Boolean(row.secret),
      },
      patron,
    );
    const { data: nextBalance, error: rpcError } = await service.rpc("dust_card", {
      p_user: user.discordId,
      p_inventory: row.id,
      p_value: rowValue,
    });
    if (rpcError) {
      skipped += 1;
      continue;
    }
    dusted += 1;
    value += rowValue;
    balance = Number(nextBalance);
  }

  if (dusted === 0 || balance === null) return { ok: false, error: "Couldn't sell those cards." };
  revalidateCardSurfaces();
  return { ok: true, dusted, value, balance, skipped };
}

/** A whole-number count of dollars inside the allowed band. */
function validDollars(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= MAX_TRADE_DOLLARS;
}

/** Deduped integer ids, or null if the list holds anything that isn't one. */
function normalizeIds(ids: number[]): number[] | null {
  if (!Array.isArray(ids)) return null;
  if (ids.some((id) => !Number.isInteger(id))) return null;
  return [...new Set(ids)];
}

/**
 * Writes a pending offer from the caller to another collector.
 *
 * Nothing is escrowed and no money moves here — an offer is an intent, and
 * `accept_card_trade` re-validates every card in it at accept time. What
 * this does check is that the offer was ever *coherent*: the caller really
 * holds what they're offering, the target really holds what's being asked
 * for, and every card in the trade lives in the same season (which is where
 * the trade's own season comes from — it is never taken from the client).
 */
export async function createTradeAction(input: {
  toDiscordId: string;
  offeredIds: number[];
  requestedIds: number[];
  offeredDollars: number;
  requestedDollars: number;
}): Promise<CreateResult> {
  const user = await getBettingUser();
  if (!user) return { ok: false, error: "Sign in with Discord to use the betting site." };
  if (!user.allowed) return { ok: false, error: "FPL Better members only." };

  const toDiscordId = typeof input?.toDiscordId === "string" ? input.toDiscordId.trim() : "";
  if (!toDiscordId) return { ok: false, error: "Pick someone to trade with." };
  if (toDiscordId === user.discordId) return { ok: false, error: "You can't trade with yourself." };

  const offeredIds = normalizeIds(input?.offeredIds ?? []);
  const requestedIds = normalizeIds(input?.requestedIds ?? []);
  if (!offeredIds || !requestedIds) return { ok: false, error: "That trade has an invalid card in it." };
  if (offeredIds.length > MAX_TRADE_CARDS || requestedIds.length > MAX_TRADE_CARDS) {
    return { ok: false, error: `Trades are capped at ${MAX_TRADE_CARDS} cards a side.` };
  }

  const offeredDollars = input?.offeredDollars ?? 0;
  const requestedDollars = input?.requestedDollars ?? 0;
  if (!validDollars(offeredDollars) || !validDollars(requestedDollars)) {
    return { ok: false, error: `Trade dollars have to be a whole number up to ${MAX_TRADE_DOLLARS.toLocaleString("en-US")}.` };
  }
  if (offeredIds.length + requestedIds.length === 0 && offeredDollars + requestedDollars === 0) {
    return { ok: false, error: "An empty trade isn't a trade — add a card or some dollars." };
  }

  const service = createBettingServiceClient();

  const allIds = [...offeredIds, ...requestedIds];
  let season: string | null = null;
  if (allIds.length > 0) {
    const { data, error } = await service
      .from("card_inventory")
      .select("id, discord_id, season, tier, foil, foil_type, signed, mutation, shiny:card->shiny, secret:card->secret")
      .in("id", allIds);
    if (error) return { ok: false, error: "Couldn't read those cards — try again." };

    const rows = new Map<number, OwnedCardRow>();
    for (const row of (data as OwnedCardRow[]) ?? []) rows.set(row.id, row);

    if (offeredIds.some((id) => rows.get(id)?.discord_id !== user.discordId)) {
      return { ok: false, error: "You can only offer cards you own." };
    }
    if (requestedIds.some((id) => rows.get(id)?.discord_id !== toDiscordId)) {
      return { ok: false, error: "They don't own one of the cards you asked for." };
    }

    // One season per trade: the accept RPC checks every card against the
    // trade's season, so a cross-season offer could never execute anyway.
    const seasons = new Set(allIds.map((id) => rows.get(id)!.season));
    if (seasons.size > 1) return { ok: false, error: "A trade can't mix cards from different seasons." };
    season = [...seasons][0];

    const locked = await lockedInventoryIds(service, user.discordId, season);
    if (offeredIds.some((id) => locked.has(id))) {
      return { ok: false, error: "A card you're offering is fielded in this week's lineup." };
    }
  } else {
    // A cards-free offer (pure dollars) still needs a season to live in;
    // take it from either party's collection.
    const { data } = await service
      .from("card_inventory")
      .select("season")
      .in("discord_id", [user.discordId, toDiscordId])
      .limit(1);
    season = (data as { season: string }[] | null)?.[0]?.season ?? null;
    if (!season) return { ok: false, error: "No season is set up for trading yet." };
  }

  const { data: inserted, error: insertError } = await service
    .from("card_trades")
    .insert({
      season,
      from_discord: user.discordId,
      to_discord: toDiscordId,
      offered_inventory_ids: offeredIds,
      requested_inventory_ids: requestedIds,
      offered_dollars: offeredDollars,
      requested_dollars: requestedDollars,
    })
    .select("id")
    .single();
  if (insertError || !inserted) return { ok: false, error: "Couldn't send that trade — try again." };

  revalidateCardSurfaces();
  return { ok: true, id: (inserted as { id: number }).id };
}

/**
 * Another collector's shelf, for the "you get" side of the trade builder.
 *
 * Auth-gated like every other action here, but not *secret*: a collection is
 * the thing you show off, and you cannot ask for a card you can't see. The
 * gate is there so the endpoint isn't an open enumeration of the league's
 * inventory to the whole internet, not because the rows are sensitive.
 *
 * The season is re-derived from the league rather than taken from the
 * caller, same as everywhere else — the builder only ever gets to name a
 * person.
 */
export async function fetchPartnerInventoryAction(
  discordId: string,
  league: CardLeague = "premier",
): Promise<PartnerInventoryResult> {
  const user = await getBettingUser();
  if (!user) return { ok: false, error: "Sign in with Discord to use the betting site." };
  if (!user.allowed) return { ok: false, error: "FPL Better members only." };

  const target = typeof discordId === "string" ? discordId.trim() : "";
  if (!target) return { ok: false, error: "Pick someone to trade with." };

  const service = createBettingServiceClient();
  const season = await fetchCardSeason(service, league === "academy" ? "academy" : "premier");
  if (!season) return { ok: false, error: "No season is set up for trading yet." };

  const rows = await fetchInventory(service, target, season);
  return {
    ok: true,
    cards: rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      playerName: row.playerName,
      role: row.role,
      overall: row.overall,
      tier: row.tier,
      foil: row.foil,
      signed: row.signed,
      altArt: isAltArt(row.card),
      editionWeek: row.editionWeek,
    })),
  };
}

/**
 * One frozen copy, for the builder's card preview.
 *
 * The counterpart to the json fetchPartnerInventoryAction drops: a shelf of
 * several hundred copies stays a list of flat rows, and the moment someone
 * actually wants to SEE one, that one card comes over on its own.
 *
 * Gated exactly like the shelf listing and no tighter — you can already read
 * every flat column of this row from that action, and a card you can be
 * offered is a card you are entitled to look at before you say yes. The id
 * isn't checked against a particular owner for the same reason: a trade you
 * were sent names copies that aren't yours and never will be unless you
 * accept.
 */
export async function fetchInventoryCardAction(inventoryId: number): Promise<InventoryCardResult> {
  if (!Number.isInteger(inventoryId)) return { ok: false, error: "That card doesn't exist." };

  const user = await getBettingUser();
  if (!user) return { ok: false, error: "Sign in with Discord to use the betting site." };
  if (!user.allowed) return { ok: false, error: "FPL Better members only." };

  const service = createBettingServiceClient();
  const { data, error } = await service.from("card_inventory").select("id, card").eq("id", inventoryId).maybeSingle();
  if (error) return { ok: false, error: "Couldn't load that card — try again." };

  const row = data as { id: number; card: PlayerCardData | null } | null;
  if (!row?.card) return { ok: false, error: "That card is no longer available." };
  return { ok: true, card: row.card };
}

/**
 * One copy's chain of custody, for the preview's provenance panel.
 *
 * Sits beside fetchInventoryCardAction because it answers the other half of
 * the same question — that one is "what does this copy look like", this one
 * is "where has it been" — and it is gated identically and for identical
 * reasons: a members-only endpoint so the league's ownership history isn't
 * an open read for the whole internet, but not scoped to an owner, because
 * the chain of a copy you are being OFFERED names people who are not you
 * and that is precisely what you want to see before saying yes.
 *
 * Fetched on demand rather than shipped with the card: almost no copy ever
 * gets its history opened, and a collection page that prefetched every
 * chain would pay for hundreds of reads to render a handful of lines.
 */
export async function fetchProvenanceAction(inventoryId: number): Promise<ProvenanceResult> {
  if (!Number.isInteger(inventoryId)) return { ok: false, error: "That card doesn't exist." };

  const user = await getBettingUser();
  if (!user) return { ok: false, error: "Sign in with Discord to use the betting site." };
  if (!user.allowed) return { ok: false, error: "FPL Better members only." };

  const service = createBettingServiceClient();
  return { ok: true, events: await fetchProvenance(service, inventoryId) };
}

/**
 * Answers a pending offer: accept it, decline it (as the recipient), or
 * cancel it (as the sender).
 *
 * Declining and cancelling are the same state change from two directions, so
 * the caller's side of the trade decides which word gets written. Accepting
 * is the only branch that moves anything, and it hands off entirely to
 * `accept_card_trade` — the ownership re-check, the wallet locks and the
 * status flip all have to happen in one transaction, which is not something
 * a sequence of PostgREST calls can promise.
 */
export async function respondTradeAction(tradeId: number, accept: boolean): Promise<RespondResult> {
  if (!Number.isInteger(tradeId)) return { ok: false, error: "That trade doesn't exist." };

  const user = await getBettingUser();
  if (!user) return { ok: false, error: "Sign in with Discord to use the betting site." };
  if (!user.allowed) return { ok: false, error: "FPL Better members only." };

  const service = createBettingServiceClient();
  const { data, error } = await service
    .from("card_trades")
    .select("id, season, from_discord, to_discord, requested_inventory_ids, status")
    .eq("id", tradeId)
    .maybeSingle();
  if (error) return { ok: false, error: "Couldn't read that trade — try again." };

  const trade = data as {
    id: number;
    season: string;
    from_discord: string;
    to_discord: string;
    requested_inventory_ids: number[] | null;
    status: string;
  } | null;
  if (!trade) return { ok: false, error: "That trade no longer exists." };
  if (trade.status !== "pending") return { ok: false, error: "That trade has already been answered." };

  if (!accept) {
    // Recipient declines, sender cancels; anyone else isn't party to it.
    const status =
      trade.to_discord === user.discordId ? "declined" : trade.from_discord === user.discordId ? "cancelled" : null;
    if (!status) return { ok: false, error: "That trade isn't yours." };

    const { error: updateError } = await service
      .from("card_trades")
      .update({ status, decided_at: new Date().toISOString() })
      .eq("id", trade.id)
      .eq("status", "pending"); // don't stomp a decision that landed first
    if (updateError) return { ok: false, error: "Couldn't answer that trade — try again." };

    revalidateCardSurfaces();
    return { ok: true };
  }

  if (trade.to_discord !== user.discordId) return { ok: false, error: "That trade isn't yours to accept." };

  // The sender's side is guarded when they create the offer; the recipient's
  // cards are only known to be free right here, at the moment they agree.
  const locked = await lockedInventoryIds(service, user.discordId, trade.season);
  if ((trade.requested_inventory_ids ?? []).some((id) => locked.has(id))) {
    return { ok: false, error: "A card they asked for is fielded in this week's lineup." };
  }

  const { error: rpcError } = await service.rpc("accept_card_trade", {
    p_trade: trade.id,
    p_user: user.discordId,
  });
  if (rpcError) return { ok: false, error: friendlyAcceptError(rpcError.message) };

  revalidateCardSurfaces();
  return { ok: true };
}
