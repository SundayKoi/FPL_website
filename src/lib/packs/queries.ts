// Reads over the card-pack economy's tables. Framework-free on purpose
// (takes any SupabaseClient, no next/headers), same as
// src/lib/cards/queries.ts — pages pass the service-role client, and a
// future scripts/ job can reuse these under tsx.
//
// Note that card_inventory has no public RLS policy: only a service-role
// client can read it, so a caller handing in the cookie-bound anon client
// gets an empty collection rather than someone else's.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlayerCardData } from "@/lib/cards/build";

/** One owned copy of a card. The flat columns mirror `card`'s contents at
 *  pull time — read them for filtering/sorting, read `card` to render. */
export interface InventoryRow {
  id: number;
  season: string;
  slug: string;
  playerName: string;
  role: string;
  /** Monday of the week this copy was pulled — its print run. */
  editionWeek: string;
  overall: number;
  tier: string;
  foil: boolean;
  /** The full card as it looked when pulled, frozen against restats. */
  card: PlayerCardData;
  packOpenId: number | null;
  acquiredAt: string;
}

interface InventoryDbRow {
  id: number;
  season: string;
  slug: string;
  player_name: string;
  role: string;
  edition_week: string;
  overall: number;
  tier: string;
  foil: boolean;
  card: PlayerCardData;
  pack_open_id: number | null;
  acquired_at: string;
}

/** A user's collection for one season, newest pull first. Errors return
 *  empty — a collection page should render as "nothing yet" rather than
 *  500 when the migration hasn't been applied to this environment. */
export async function fetchInventory(
  supabase: SupabaseClient,
  discordId: string,
  season: string,
): Promise<InventoryRow[]> {
  const { data, error } = await supabase
    .from("card_inventory")
    .select("id, season, slug, player_name, role, edition_week, overall, tier, foil, card, pack_open_id, acquired_at")
    .eq("discord_id", discordId)
    .eq("season", season)
    .order("acquired_at", { ascending: false });
  if (error) return [];
  return ((data as InventoryDbRow[]) ?? []).map((row) => ({
    id: row.id,
    season: row.season,
    slug: row.slug,
    playerName: row.player_name,
    role: row.role,
    editionWeek: row.edition_week,
    overall: row.overall,
    tier: row.tier,
    foil: row.foil,
    card: row.card,
    packOpenId: row.pack_open_id,
    acquiredAt: row.acquired_at,
  }));
}

/** How many packs this user has opened in `season` — the collector stat
 *  behind "packs opened" counters. */
export async function fetchPackOpenCount(
  supabase: SupabaseClient,
  discordId: string,
  season: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("card_pack_opens")
    .select("id", { count: "exact", head: true })
    .eq("discord_id", discordId)
    .eq("season", season);
  if (error) return 0;
  return count ?? 0;
}
