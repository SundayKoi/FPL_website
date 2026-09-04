"use server";

// The market, from the app side: put a copy up, take it down, buy someone
// else's, post a bounty, fill one.
//
// Same shape as every other betting action (src/lib/trades/actions.ts):
// getBettingUser → access check → service-role client → an RPC that takes the
// Discord id derived from the SESSION, never from the arguments. Only ids and
// prices travel over the wire; who is selling, which season a listing belongs
// to and what a copy is are all re-derived here, so a client that lies about
// any of them is simply overruled.
//
// The guards duplicated from the trade path — the fantasy lineup lock and the
// expedition deploy lock — are courtesy, not law. `buy_card_listing` reaches
// card_inventory_expedition_guard and refuses a deployed copy anyway, and a
// fielded card would sell perfectly well as far as Postgres is concerned. The
// point of checking here is that both refusals happen at LISTING time, before
// somebody else's money is involved: the alternative is a board full of cards
// that cannot actually be delivered, discovered one failed purchase at a time.
// The wording is the wording trades uses, because a rule that phrases itself
// differently depending on which screen caught it reads as two rules.

import { revalidatePath } from "next/cache";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import { getBettingUser } from "@/lib/betting/wallet";
import { cardImageUrl } from "@/lib/cards/shareImage";
import { fetchCardSeason, type CardLeague } from "@/lib/cards/queries";
import { fetchDeployedCopyIds } from "@/lib/expeditions/queries";
import { GOLD, postCardsWebhook } from "@/lib/packs/announce";
import { editionLabel } from "@/lib/packs/week";
import { fmtPoints } from "@/lib/betting/format";
import { lockedInventoryIds } from "@/lib/trades/guards";
import {
  MAX_LISTING_ASK,
  MAX_OPEN_LISTINGS,
  MAX_OPEN_WANTS,
  MAX_WANT_BOUNTY,
  normalizeNote,
  validPrice,
} from "./config";

type Result = { ok: true } | { ok: false; error: string };
type CreateResult = { ok: true; id: number } | { ok: false; error: string };

interface CopyRow {
  id: number;
  discord_id: string;
  season: string;
  slug: string;
  player_name: string;
  edition_week: string;
}

const SIGN_IN = "Sign in with Discord to use the betting site.";
const MEMBERS_ONLY = "FPL Better members only.";

/** Every surface a sale changes: the market itself, and the collection pages
 *  the copy just left or joined. Both leagues, because a page is cached per
 *  path and a copy does not know which one you were looking at. */
function revalidateMarketSurfaces(): void {
  revalidatePath("/cards/market");
  revalidatePath("/academy/cards/market");
  revalidatePath("/cards/packs");
  revalidatePath("/academy/cards/packs");
  revalidatePath("/cards/trades");
  revalidatePath("/academy/cards/trades");
}

/**
 * The sale RPCs' raw `raise exception` text → friendly copy.
 *
 * One mapper for both boards: buy_card_listing and fill_card_want share
 * execute_card_sale, so they share most of their failures, and a buyer and a
 * filler hitting the same wall should read the same sentence. Never surface a
 * raw Postgres error — same contract as friendlyDustError.
 */
function friendlySaleError(message: string): string {
  // Not the RPC's own text: card_inventory_expedition_guard raises this from
  // under the ownership update, and it reaches this mapper through the sale.
  if (/card is on expedition/i.test(message)) return "That card is out on an expedition.";
  // card_inventory_curse_guard, from under the same update: a fresh Cursed
  // card cannot change hands for a week.
  if (/card is cursed/i.test(message)) return "That card is Cursed and can't change hands yet.";
  if (/insufficient balance/i.test(message)) return "You don't have enough to cover that.";
  if (/listing is not open/i.test(message)) return "That listing has already been taken.";
  if (/listing expired/i.test(message)) return "That listing has expired.";
  if (/want is not open/i.test(message)) return "That want has already been filled.";
  if (/cannot buy your own listing/i.test(message)) return "That's your own listing.";
  if (/cannot fill your own want/i.test(message)) return "That's your own want.";
  if (/card does not match the want/i.test(message)) return "That copy isn't the card they asked for.";
  if (/card not owned/i.test(message)) return "That card has moved on — the sale is off.";
  if (/unknown listing/i.test(message)) return "That listing no longer exists.";
  if (/unknown want/i.test(message)) return "That want no longer exists.";
  if (/unknown user/i.test(message)) return "Account not found — try signing in again.";
  if (/invalid sale price/i.test(message)) return "That price isn't one this market accepts.";
  return "Something went wrong with that sale.";
}

/**
 * Retires the caller's listings that have run out of time.
 *
 * Nothing sweeps `expires_at` on a schedule — see the migration's header for
 * why there is no cron here — so a lapsed listing sits at 'open' forever. That
 * is invisible on the board (which filters on expiry) but very visible to the
 * partial unique index: one dead listing would make its copy permanently
 * unlistable. Running this before every create and every count keeps both the
 * cap and the index honest, at the cost of one small UPDATE.
 */
async function expireLapsedListings(
  service: ReturnType<typeof createBettingServiceClient>,
  discordId: string,
): Promise<void> {
  await service
    .from("card_listings")
    .update({ status: "expired", decided_at: new Date().toISOString() })
    .eq("seller_discord", discordId)
    .eq("status", "open")
    .lt("expires_at", new Date().toISOString());
}

/**
 * Whether this season prints that player at all.
 *
 * A want names a slug the form picked out of a list, but the form is not the
 * authority on anything — and a bounty on a slug that does not exist in the
 * season is money advertised for a card nobody can ever hand over. The
 * archived edition is the primary answer; a league that has never run a
 * weekly drop has no archive, so a copy anyone actually holds counts too.
 */
async function slugExistsInSeason(
  service: ReturnType<typeof createBettingServiceClient>,
  season: string,
  slug: string,
): Promise<boolean> {
  const { data: edition } = await service
    .from("card_editions")
    .select("slug")
    .eq("season", season)
    .eq("slug", slug)
    .limit(1);
  if ((((edition as { slug: string }[] | null) ?? []).length) > 0) return true;

  const { data: owned } = await service
    .from("card_inventory")
    .select("id")
    .eq("season", season)
    .eq("slug", slug)
    .limit(1);
  return (((owned as { id: number }[] | null) ?? []).length) > 0;
}

/** Announces a completed sale in #cards. Best-effort by contract: the money
 *  has already moved, and a webhook outage must never turn a settled sale into
 *  an error. */
async function announceSale(
  service: ReturnType<typeof createBettingServiceClient>,
  input: {
    buyerDiscordId: string;
    sellerDiscordId: string;
    slug: string;
    playerName: string;
    editionWeek: string | null;
    price: number;
    kind: "listing" | "want";
  },
): Promise<void> {
  try {
    const { data } = await service
      .from("betting_profiles")
      .select("discord_id, username")
      .in("discord_id", [input.buyerDiscordId, input.sellerDiscordId]);
    const names = new Map<string, string>();
    for (const row of ((data as { discord_id: string; username: string | null }[]) ?? [])) {
      names.set(row.discord_id, row.username ?? row.discord_id);
    }
    const buyer = names.get(input.buyerDiscordId) ?? "Someone";
    const seller = names.get(input.sellerDiscordId) ?? "someone";
    const site = process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "";
    const edition = input.editionWeek ? ` — ${editionLabel(input.editionWeek)} edition` : "";
    await postCardsWebhook({
      title: "💸 SOLD",
      description:
        `**${buyer}** bought **${input.playerName}**${edition} from **${seller}** ` +
        `for ${fmtPoints(input.price)}.` +
        (input.kind === "want" ? "\n\nFilled from the wanted board." : ""),
      color: GOLD,
      ...(site ? { image: { url: cardImageUrl(site, input.slug, input.editionWeek) } } : {}),
    });
  } catch {
    // Garnish, by contract.
  }
}

/**
 * Puts one owned copy on the market at a fixed price.
 *
 * The copy is read first for the same three reasons a dust reads it: to prove
 * the caller owns it, to learn which season it belongs to (the listing's
 * season is never taken from the client), and to check it against the locks
 * that would stop it being delivered.
 */
export async function createListing(input: {
  inventoryId: number;
  ask: number;
  note?: string | null;
}): Promise<CreateResult> {
  const user = await getBettingUser();
  if (!user) return { ok: false, error: SIGN_IN };
  if (!user.allowed) return { ok: false, error: MEMBERS_ONLY };

  const inventoryId = input?.inventoryId;
  if (!Number.isInteger(inventoryId)) return { ok: false, error: "That card can't be listed." };
  if (!validPrice(input?.ask, MAX_LISTING_ASK)) {
    return {
      ok: false,
      error: `An ask has to be a whole number from $1 to ${fmtPoints(MAX_LISTING_ASK)}.`,
    };
  }
  const note = normalizeNote(input?.note);
  if (note === undefined) return { ok: false, error: "That note is too long." };

  const service = createBettingServiceClient();
  const { data, error } = await service
    .from("card_inventory")
    .select("id, discord_id, season, slug, player_name, edition_week")
    .eq("id", inventoryId)
    .maybeSingle();
  if (error) return { ok: false, error: "Couldn't read your collection — try again." };

  const copy = data as CopyRow | null;
  // Not-yours and doesn't-exist collapse into one message on purpose: a
  // stranger probing ids shouldn't learn which ones are real.
  if (!copy || copy.discord_id !== user.discordId) return { ok: false, error: "That card isn't yours." };

  const [locked, deployed] = await Promise.all([
    lockedInventoryIds(service, user.discordId, copy.season),
    fetchDeployedCopyIds(service, user.discordId),
  ]);
  if (locked.has(copy.id)) return { ok: false, error: "That card is fielded in this week's lineup." };
  if (deployed.has(copy.id)) return { ok: false, error: "That card is out on an expedition." };

  await expireLapsedListings(service, user.discordId);

  const { data: openRows, error: countError } = await service
    .from("card_listings")
    .select("id")
    .eq("seller_discord", user.discordId)
    .eq("status", "open");
  if (countError) return { ok: false, error: "Couldn't read your listings — try again." };
  if (((openRows as { id: number }[]) ?? []).length >= MAX_OPEN_LISTINGS) {
    return { ok: false, error: `You can have ${MAX_OPEN_LISTINGS} listings up at once — cancel one first.` };
  }

  const { data: inserted, error: insertError } = await service
    .from("card_listings")
    .insert({
      season: copy.season,
      inventory_id: copy.id,
      seller_discord: user.discordId,
      ask: input.ask,
      note,
    })
    .select("id")
    .single();
  if (insertError || !inserted) {
    // 23505 is the one open listing per copy index, which is a sentence the
    // seller can act on rather than a database code.
    if (insertError?.code === "23505") return { ok: false, error: "That card is already on the market." };
    return { ok: false, error: "Couldn't list that card — try again." };
  }

  revalidateMarketSurfaces();
  return { ok: true, id: (inserted as { id: number }).id };
}

/** Takes one of your own listings down. A plain update rather than an RPC:
 *  nothing moves, and the `eq("status", "open")` is what stops a cancel from
 *  stomping a sale that landed a moment earlier. */
export async function cancelListing(listingId: number): Promise<Result> {
  if (!Number.isInteger(listingId)) return { ok: false, error: "That listing doesn't exist." };

  const user = await getBettingUser();
  if (!user) return { ok: false, error: SIGN_IN };
  if (!user.allowed) return { ok: false, error: MEMBERS_ONLY };

  const service = createBettingServiceClient();
  const { data, error } = await service
    .from("card_listings")
    .update({ status: "cancelled", decided_at: new Date().toISOString() })
    .eq("id", listingId)
    .eq("seller_discord", user.discordId)
    .eq("status", "open")
    .select("id");
  if (error) return { ok: false, error: "Couldn't cancel that listing — try again." };
  if (((data as { id: number }[]) ?? []).length === 0) {
    return { ok: false, error: "That listing is already closed." };
  }

  revalidateMarketSurfaces();
  return { ok: true };
}

/**
 * Buys a listing at its asking price.
 *
 * Everything that matters happens inside `buy_card_listing` — the listing
 * lock, the expiry and status checks, the ownership re-check, both wallet
 * locks, the ledger pair and the transfer all have to be one transaction, and
 * that is not something a sequence of PostgREST calls can promise. What
 * happens out here is the session check and the announcement.
 */
export async function buyListing(listingId: number): Promise<Result> {
  if (!Number.isInteger(listingId)) return { ok: false, error: "That listing doesn't exist." };

  const user = await getBettingUser();
  if (!user) return { ok: false, error: SIGN_IN };
  if (!user.allowed) return { ok: false, error: MEMBERS_ONLY };

  const service = createBettingServiceClient();
  const { data, error } = await service
    .from("card_listings")
    .select("id, season, inventory_id, seller_discord, ask, status")
    .eq("id", listingId)
    .maybeSingle();
  if (error) return { ok: false, error: "Couldn't read that listing — try again." };

  const listing = data as {
    id: number;
    season: string;
    inventory_id: number;
    seller_discord: string;
    ask: number;
    status: string;
  } | null;
  if (!listing) return { ok: false, error: "That listing no longer exists." };
  if (listing.status !== "open") return { ok: false, error: "That listing has already been taken." };
  if (listing.seller_discord === user.discordId) return { ok: false, error: "That's your own listing." };

  // Read for the announcement before the sale, while the copy is still
  // findable under the seller — after the transfer it is the buyer's, and
  // after a dust it would be nothing at all.
  const { data: copyData } = await service
    .from("card_inventory")
    .select("id, discord_id, season, slug, player_name, edition_week")
    .eq("id", listing.inventory_id)
    .maybeSingle();
  const copy = copyData as CopyRow | null;

  const { error: rpcError } = await service.rpc("buy_card_listing", {
    p_listing: listing.id,
    p_buyer: user.discordId,
  });
  if (rpcError) return { ok: false, error: friendlySaleError(rpcError.message) };

  if (copy) {
    await announceSale(service, {
      buyerDiscordId: user.discordId,
      sellerDiscordId: listing.seller_discord,
      slug: copy.slug,
      playerName: copy.player_name,
      editionWeek: copy.edition_week,
      price: listing.ask,
      kind: "listing",
    });
  }

  revalidateMarketSurfaces();
  return { ok: true };
}

/**
 * Posts a bounty on a player.
 *
 * The season comes from the league, not from the caller, exactly like
 * fetchPartnerInventoryAction — the form only ever gets to name a slug. The
 * slug itself is checked against the season's own cards so a want cannot be
 * written for a player who does not print in it, which would be a bounty
 * nobody could ever collect.
 */
export async function createWant(input: {
  slug: string;
  bounty: number;
  note?: string | null;
  league?: CardLeague;
}): Promise<CreateResult> {
  const user = await getBettingUser();
  if (!user) return { ok: false, error: SIGN_IN };
  if (!user.allowed) return { ok: false, error: MEMBERS_ONLY };

  const slug = typeof input?.slug === "string" ? input.slug.trim() : "";
  if (!slug) return { ok: false, error: "Pick a player to ask for." };
  if (!validPrice(input?.bounty, MAX_WANT_BOUNTY)) {
    return {
      ok: false,
      error: `A bounty has to be a whole number from $1 to ${fmtPoints(MAX_WANT_BOUNTY)}.`,
    };
  }
  const note = normalizeNote(input?.note);
  if (note === undefined) return { ok: false, error: "That note is too long." };

  const service = createBettingServiceClient();
  const season = await fetchCardSeason(service, input?.league === "academy" ? "academy" : "premier");
  if (!season) return { ok: false, error: "No season is set up for the market yet." };
  if (!(await slugExistsInSeason(service, season, slug))) {
    return { ok: false, error: "That player isn't in this season's cards." };
  }

  const { data: openRows, error: countError } = await service
    .from("card_wants")
    .select("id")
    .eq("discord_id", user.discordId)
    .eq("status", "open");
  if (countError) return { ok: false, error: "Couldn't read your wants — try again." };
  if (((openRows as { id: number }[]) ?? []).length >= MAX_OPEN_WANTS) {
    return { ok: false, error: `You can have ${MAX_OPEN_WANTS} wants up at once — cancel one first.` };
  }

  const { data: inserted, error: insertError } = await service
    .from("card_wants")
    .insert({ season, discord_id: user.discordId, slug, bounty: input.bounty, note })
    .select("id")
    .single();
  if (insertError || !inserted) return { ok: false, error: "Couldn't post that want — try again." };

  revalidateMarketSurfaces();
  return { ok: true, id: (inserted as { id: number }).id };
}

/** Takes one of your own wants down. Same shape, and the same reason for the
 *  status filter, as cancelListing. */
export async function cancelWant(wantId: number): Promise<Result> {
  if (!Number.isInteger(wantId)) return { ok: false, error: "That want doesn't exist." };

  const user = await getBettingUser();
  if (!user) return { ok: false, error: SIGN_IN };
  if (!user.allowed) return { ok: false, error: MEMBERS_ONLY };

  const service = createBettingServiceClient();
  const { data, error } = await service
    .from("card_wants")
    .update({ status: "cancelled", decided_at: new Date().toISOString() })
    .eq("id", wantId)
    .eq("discord_id", user.discordId)
    .eq("status", "open")
    .select("id");
  if (error) return { ok: false, error: "Couldn't cancel that want — try again." };
  if (((data as { id: number }[]) ?? []).length === 0) {
    return { ok: false, error: "That want is already closed." };
  }

  revalidateMarketSurfaces();
  return { ok: true };
}

/**
 * Answers somebody's bounty with a copy you own.
 *
 * The mirror of a purchase, and guarded on the same two locks as a listing —
 * a fielded or deployed copy cannot be handed over, and finding that out
 * inside the RPC would mean the click failed with the poster's money already
 * in play. `fill_card_want` re-checks ownership, the slug and the season
 * itself; these checks exist so the refusal is a sentence rather than a
 * rollback.
 */
export async function fillWant(wantId: number, inventoryId: number): Promise<Result> {
  if (!Number.isInteger(wantId) || !Number.isInteger(inventoryId)) {
    return { ok: false, error: "That want doesn't exist." };
  }

  const user = await getBettingUser();
  if (!user) return { ok: false, error: SIGN_IN };
  if (!user.allowed) return { ok: false, error: MEMBERS_ONLY };

  const service = createBettingServiceClient();
  const [wantResult, copyResult] = await Promise.all([
    service
      .from("card_wants")
      .select("id, season, discord_id, slug, bounty, status")
      .eq("id", wantId)
      .maybeSingle(),
    service
      .from("card_inventory")
      .select("id, discord_id, season, slug, player_name, edition_week")
      .eq("id", inventoryId)
      .maybeSingle(),
  ]);
  if (wantResult.error || copyResult.error) return { ok: false, error: "Couldn't read that want — try again." };

  const want = wantResult.data as {
    id: number;
    season: string;
    discord_id: string;
    slug: string;
    bounty: number;
    status: string;
  } | null;
  const copy = copyResult.data as CopyRow | null;
  if (!want) return { ok: false, error: "That want no longer exists." };
  if (want.status !== "open") return { ok: false, error: "That want has already been filled." };
  if (want.discord_id === user.discordId) return { ok: false, error: "That's your own want." };
  if (!copy || copy.discord_id !== user.discordId) return { ok: false, error: "That card isn't yours." };
  if (copy.slug !== want.slug || copy.season !== want.season) {
    return { ok: false, error: "That copy isn't the card they asked for." };
  }

  const [locked, deployed] = await Promise.all([
    lockedInventoryIds(service, user.discordId, copy.season),
    fetchDeployedCopyIds(service, user.discordId),
  ]);
  if (locked.has(copy.id)) return { ok: false, error: "That card is fielded in this week's lineup." };
  if (deployed.has(copy.id)) return { ok: false, error: "That card is out on an expedition." };

  const { error: rpcError } = await service.rpc("fill_card_want", {
    p_want: want.id,
    p_seller: user.discordId,
    p_inventory: copy.id,
  });
  if (rpcError) return { ok: false, error: friendlySaleError(rpcError.message) };

  await announceSale(service, {
    buyerDiscordId: want.discord_id,
    sellerDiscordId: user.discordId,
    slug: copy.slug,
    playerName: copy.player_name,
    editionWeek: copy.edition_week,
    price: want.bounty,
    kind: "want",
  });

  revalidateMarketSurfaces();
  return { ok: true };
}
