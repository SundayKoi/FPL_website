"use server";

// The patron's weekly die: re-roll the ART on one owned copy.
//
// Cosmetic only, by construction — the roll can touch nothing but the
// frozen json's artSkin. Rarity, foil, parallel, signature and rating are
// never read, let alone written, so the perk cannot move a card's value
// (dust prices off the flat columns; none of them change here).
//
// One per week, claimed burn-first: the (discord_id, week_start) primary
// key insert IS the spend, made before the art moves, so a double-click
// can never re-roll twice. The row is deleted (un-burn) if the roll or
// the write fails, mirroring the signing links' compensation pattern.

import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { getBettingUser } from "@/lib/betting/wallet";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import { patronActive } from "@/lib/patron/flames";
import { mondayOf } from "@/lib/packs/week";
import { fetchChampionSkinNums, printArtExists, splashArtExists } from "@/lib/packs/skins";
import type { PlayerCardData } from "@/lib/cards/build";

export async function rerollPrintAction(
  inventoryId: number,
): Promise<{ ok: true; artSkin: number } | { ok: false; error: string }> {
  const user = await getBettingUser();
  if (!user) return { ok: false, error: "Sign in with Discord first." };
  if (!Number.isInteger(inventoryId)) return { ok: false, error: "That isn't a card." };

  const service = createBettingServiceClient();
  const { data: profile } = await service
    .from("betting_profiles")
    .select("patron_until")
    .eq("discord_id", user.discordId)
    .maybeSingle();
  if (!patronActive((profile as { patron_until: string | null } | null)?.patron_until)) {
    return { ok: false, error: "The weekly re-roll is a patron perk." };
  }

  const { data: rowData } = await service
    .from("card_inventory")
    .select("id, discord_id, card")
    .eq("id", inventoryId)
    .maybeSingle();
  const row = rowData as { id: number; discord_id: string; card: PlayerCardData } | null;
  // Not-yours and doesn't-exist collapse on purpose, same as dusting.
  if (!row || row.discord_id !== user.discordId) return { ok: false, error: "That card isn't yours." };

  // Which champion's catalog the copy prints from — and which validator:
  // a champions relic renders the regular splash directory only.
  const champWin = row.card.champWin;
  const champion = champWin ? champWin.champion : row.card.signature?.champion;
  const artExists = champWin ? splashArtExists : printArtExists;
  if (row.card.moment || !champion) {
    return { ok: false, error: "That copy has no champion art to re-roll." };
  }

  const skinNums = await fetchChampionSkinNums(champion);
  const current = row.card.artSkin ?? 0;
  const candidates = [...new Set(skinNums)].filter((num) => num !== current);
  if (candidates.length === 0) {
    return { ok: false, error: `${champion} has no other art to roll.` };
  }

  // Burn FIRST: the weekly claim is the primary-key insert. A conflict
  // means this week's die is already spent — in this click's race or a
  // previous one, either way the answer is the same.
  const week = mondayOf(new Date());
  const { error: burnError } = await service
    .from("card_print_rerolls")
    .insert({ discord_id: user.discordId, week_start: week, inventory_id: inventoryId });
  if (burnError) {
    return { ok: false, error: "You've used this week's re-roll — the die comes back Monday." };
  }
  const unburn = () =>
    service.from("card_print_rerolls").delete().eq("discord_id", user.discordId).eq("week_start", week);

  // Uniform over what's left, validated against the CDN like every print
  // roll — a re-roll frozen against a 403 would render a hole forever.
  const rand = () => randomBytes(6).readUIntBE(0, 6) / 2 ** 48;
  let artSkin: number | null = null;
  const pool = [...candidates];
  for (let attempt = 0; attempt < 6 && pool.length > 0; attempt += 1) {
    const index = Math.min(pool.length - 1, Math.floor(rand() * pool.length));
    const num = pool[index];
    if (await artExists(champion, num)) {
      artSkin = num;
      break;
    }
    pool.splice(index, 1);
  }
  if (artSkin === null) {
    await unburn();
    return { ok: false, error: `${champion} has no other art to roll.` };
  }

  const { error: writeError } = await service
    .from("card_inventory")
    .update({ card: { ...row.card, artSkin } })
    .eq("id", inventoryId)
    .eq("discord_id", user.discordId);
  if (writeError) {
    await unburn();
    return { ok: false, error: "Couldn't save the new print — your re-roll wasn't spent." };
  }

  revalidatePath("/cards/packs");
  revalidatePath("/academy/cards/packs");
  return { ok: true, artSkin };
}
