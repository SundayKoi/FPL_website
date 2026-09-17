"use server";

import { revalidatePath } from "next/cache";
import { cardSlug } from "@/lib/cards/build";
import { canonicalArtChampion, fetchPlayedChampions, isPlayedChampion } from "@/lib/cards/artwork";
import { fetchChampionSkinCatalog } from "@/lib/packs/skins";
import { createServerSupabase } from "@/lib/supabase/server";

export type SaveCardArtworkResult = { ok: true } | { ok: false; error: string };

/**
 * Save the ordinary Season Card's cosmetic champion/skin pair. The Riot
 * catalog check happens here, while the database RPC repeats authorization,
 * split eligibility, and the atomic write so a forged browser request cannot
 * move a card onto another player's champion.
 */
export async function saveCardArtworkAction(input: {
  season: string;
  summonerName: string;
  tag: string;
  artChampion: string | null;
  skin: number;
}): Promise<SaveCardArtworkResult> {
  const season = input.season.trim();
  const summonerName = input.summonerName.trim();
  const tag = input.tag.trim();
  const artChampion = input.artChampion ? canonicalArtChampion(input.artChampion) : null;
  if (!season || !summonerName || !tag || !Number.isInteger(input.skin) || input.skin < 0 || input.skin > 200) {
    return { ok: false, error: "That artwork selection is not valid." };
  }

  try {
    const supabase = await createServerSupabase();
    const { data: allowed, error: permissionError } = await supabase.rpc("can_edit_card_art", {
      p_season: season,
      p_summoner: summonerName,
      p_tag: tag,
    });
    if (permissionError || allowed !== true) return { ok: false, error: "You may not edit this Season Card." };

    if (artChampion) {
      const played = await fetchPlayedChampions(supabase, season, summonerName, tag);
      if (!played.available) return { ok: false, error: "Played champions could not be verified. Nothing was changed." };
      if (!isPlayedChampion(played.champions, artChampion)) {
        return { ok: false, error: "Choose a champion this player played in the selected split." };
      }
      const catalog = await fetchChampionSkinCatalog(artChampion);
      if (!catalog.available) return { ok: false, error: "That champion's skins are temporarily unavailable. Nothing was changed." };
      if (!catalog.skins.some((skin) => skin.num === input.skin)) {
        return { ok: false, error: "That skin is not available for the selected champion." };
      }
    }

    const { error } = await supabase.rpc("save_card_art_preference", {
      p_season: season,
      p_summoner: summonerName,
      p_tag: tag,
      p_art_champion: artChampion,
      p_skin: input.skin,
    });
    if (error) return { ok: false, error: error.message || "Could not save the Season Card artwork." };

    revalidatePath(`/card/${cardSlug(summonerName, tag)}`);
    revalidatePath("/cards");
    revalidatePath("/academy/cards");
    revalidatePath("/admin/seasons-end");
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not save the Season Card artwork. Nothing was changed." };
  }
}
