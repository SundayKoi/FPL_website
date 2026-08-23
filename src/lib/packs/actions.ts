"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getBettingUser } from "@/lib/betting/wallet";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import { fetchCardSeason, fetchSeasonCards, type CardLeague } from "@/lib/cards/queries";
import { cardSlug, type PlayerCardData } from "@/lib/cards/build";
import { PACK_COST } from "./config";
import { rollPack } from "./rng";
import { applyAutographs } from "./signatures";
import { mondayOf } from "./week";

/** slug -> that player's inked signature, for everyone in `season` who has
 *  drawn one. Read through the service client (card_art_prefs is publicly
 *  readable, but this action already holds one). A failure — the signature
 *  migration not applied to this environment — yields an empty map: nobody
 *  rolls an autograph, and the pack opens normally. */
async function fetchSignatures(
  service: ReturnType<typeof createBettingServiceClient>,
  season: string,
): Promise<Map<string, string>> {
  const { data, error } = await service
    .from("card_art_prefs")
    .select("summoner_name, tag, signature")
    .eq("season", season)
    .not("signature", "is", null);
  if (error) return new Map();
  const rows = (data as { summoner_name: string; tag: string; signature: string | null }[]) ?? [];
  return new Map(
    rows
      .filter((row): row is { summoner_name: string; tag: string; signature: string } => Boolean(row.signature))
      .map((row) => [cardSlug(row.summoner_name, row.tag), row.signature]),
  );
}

/** `open_card_pack`'s raw `raise exception` text → friendly copy. Same
 *  contract as friendlyPlaceBetError: never surface a raw Postgres error. */
function friendlyOpenPackError(message: string): string {
  if (/insufficient balance/i.test(message)) return "Insufficient balance.";
  if (/cost must be positive/i.test(message)) return "That pack isn't for sale right now.";
  if (/unknown user/i.test(message)) return "Account not found — try signing in again.";
  return "Something went wrong opening that pack.";
}

/**
 * Buys and opens one pack for the signed-in caller.
 *
 * Only the league travels over the wire — the Discord id comes from the
 * session and the price from config.ts, both server-side, so a client can
 * neither open someone else's pack nor name its own price.
 *
 * Charge first, fulfill after: `open_card_pack` debits the wallet and hands
 * back an open id, the pulled cards are then written to card_inventory, and
 * a failed write is reversed with `refund_card_pack` — the same
 * compensating-transaction shape the store's buy flow uses (handleBuy in
 * src/lib/betting/discord/commands.ts). The alternative — rolling first and
 * charging after — would hand out free cards whenever the debit failed.
 */
export async function openPackAction(
  league: CardLeague,
): Promise<
  | { ok: true; cards: { card: PlayerCardData; foil: boolean; signed: boolean; inventoryId: number }[]; balance: number }
  | { ok: false; error: string }
> {
  const user = await getBettingUser();
  if (!user) return { ok: false, error: "Sign in with Discord to use the betting site." };
  if (!user.allowed) return { ok: false, error: "FPL Better members only." };

  const service = createBettingServiceClient();

  // Resolve the pool BEFORE charging: a season with no cards has to be an
  // error the user never pays for (same reasoning as handleBuy fetching the
  // store item before start_purchase).
  const season = await fetchCardSeason(service, league);
  if (!season) return { ok: false, error: "No season is set up for packs yet." };

  const cards = await fetchSeasonCards(service, season);
  if (cards.length === 0) return { ok: false, error: "No cards to open yet — check back once games are played." };

  const { data: openId, error: openError } = await service.rpc("open_card_pack", {
    p_user: user.discordId,
    p_season: season,
    p_cost: PACK_COST,
  });
  if (openError) return { ok: false, error: friendlyOpenPackError(openError.message) };

  // CSPRNG, not Math.random: V8's PRNG state is recoverable from observed
  // outputs, and pack contents gate real (betting-dollar) value. Six bytes
  // over 2^48 gives a uniform [0,1) with more than enough resolution for
  // the roll tables.
  const rand = () => randomBytes(6).readUIntBE(0, 6) / 2 ** 48;
  // Roll the pack, then ink it: the autograph pass rides the same CSPRNG so
  // a signed pull is as unguessable as the pull itself.
  const pulls = applyAutographs(rollPack(cards, rand), await fetchSignatures(service, season), rand);
  const editionWeek = mondayOf(new Date());
  const { data: inserted, error: insertError } = await service
    .from("card_inventory")
    .insert(
      pulls.map((pull) => ({
        discord_id: user.discordId,
        season,
        slug: pull.card.slug,
        player_name: pull.card.name,
        role: pull.card.role,
        edition_week: editionWeek,
        overall: pull.card.overall,
        tier: pull.card.tier.key,
        foil: pull.foil,
        signed: pull.signed,
        // the whole card, frozen: ratings restat nightly, collections don't
        // — and the autograph rides along, so this copy keeps the signature
        // it was pulled with even if the player redraws it later
        card: { ...pull.card, autograph: pull.autograph },
        pack_open_id: openId,
      })),
    )
    .select("id");

  if (insertError || !inserted) {
    const { error: refundError } = await service.rpc("refund_card_pack", { p_open: openId });
    if (refundError) {
      // Money is out and the cards never landed — say nothing about a refund
      // we can't stand behind, and leave a trail for whoever reconciles it.
      console.error("packs: refund_card_pack failed", { openId, refundError, insertError });
      return { ok: false, error: "That pack didn't open and we couldn't reverse the charge — staff have been notified." };
    }
    return { ok: false, error: "That pack didn't open — you haven't been charged." };
  }

  // Read the balance back rather than subtracting locally: the wallet may
  // have moved for other reasons (a bet settling) while this ran.
  const { data: profile } = await service
    .from("betting_profiles")
    .select("balance")
    .eq("discord_id", user.discordId)
    .single();

  revalidatePath("/cards/packs");
  revalidatePath("/academy/cards/packs");

  const ids = (inserted as { id: number }[]).map((row) => row.id);
  return {
    ok: true,
    cards: pulls.map((pull, index) => ({
      // the autograph travels inside the card so the reveal shows the ink
      card: { ...pull.card, autograph: pull.autograph },
      foil: pull.foil,
      signed: pull.signed,
      inventoryId: ids[index],
    })),
    balance: (profile as { balance: number } | null)?.balance ?? user.balance - PACK_COST,
  };
}
