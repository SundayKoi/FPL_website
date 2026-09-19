"use server";

// The casters' desk needs the same skin catalog the card page's picker uses,
// but through a gate of its own.
//
// `/api/cards/artwork/catalog` cannot serve it: that route is scoped to ONE
// player's own card (`can_edit_card_art`, and only champions that player
// played), which is exactly the wrong question for a desk where staff set
// any champion on somebody else's On Air card. So this action asks the only
// question that matters there — is the caller staff — and then reads Riot's
// catalog through the same cached `fetchChampionSkinCatalog` the roller uses.
//
// Nothing is written here. The write is still the browser client's upsert
// against `on_air_casters` (RLS is that gate, migration 20261020000001);
// this only names the skins so the desk can pick one instead of guessing a
// number.

import { fetchStaffTier } from "@/lib/auth/staffTier";
import { championByName } from "@/lib/match-draft/champions";
import { fetchChampionSkinCatalog, type ChampionSkin } from "@/lib/packs/skins";
import { createServerSupabase } from "@/lib/supabase/server";

export type OnAirSkinCatalogResult =
  | { ok: true; champion: string; available: boolean; skins: ChampionSkin[] }
  | { ok: false; error: string };

async function requireAdmin(): Promise<boolean> {
  const supabase = await createServerSupabase();
  const { isAdmin, isOwner } = await fetchStaffTier(supabase);
  return isAdmin || isOwner;
}

/**
 * A champion's skins, by name, for the On Air desk.
 *
 * `available: false` means Riot could not be read — the caller should fall
 * back to the bare number input rather than pretend the one base entry is
 * the whole list.
 */
export async function fetchOnAirSkinCatalogAction(champion: string): Promise<OnAirSkinCatalogResult> {
  if (!(await requireAdmin())) return { ok: false, error: "Admins only." };

  // Resolved before the fetch so the answer is keyed by Riot's canonical
  // name: the desk types free text, and "ahri", "Ahri" and " Ahri " must
  // not each open their own catalog entry.
  const resolved = championByName(champion);
  if (!resolved) return { ok: false, error: "Unknown champion." };

  const catalog = await fetchChampionSkinCatalog(resolved.name);
  return { ok: true, champion: catalog.champion, available: catalog.available, skins: catalog.skins };
}
