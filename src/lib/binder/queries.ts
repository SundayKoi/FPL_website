// Reads over the binder — the handful of copies a collector chooses to show.
//
// Framework-free (takes any SupabaseClient), same as the other card query
// modules. Both tables are deny-all, so every caller hands in a service
// client; the authorization that matters happens here, in the ownership
// re-check, not in a policy.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlayerCardData } from "@/lib/cards/build";

/** Six slots: enough to say something, few enough that choosing matters. */
export const BINDER_SLOTS = 6;

export interface BinderCard {
  slot: number;
  inventoryId: number;
  playerName: string;
  editionWeek: string;
  tier: string;
  foil: boolean;
  signed: boolean;
  card: PlayerCardData;
}

export interface Binder {
  discordId: string;
  token: string;
  title: string | null;
  ownerName: string | null;
  ownerAvatarUrl: string | null;
  cards: BinderCard[];
}

interface SlotJoinRow {
  slot: number;
  inventory_id: number;
  card_inventory: {
    discord_id: string;
    player_name: string;
    edition_week: string;
    tier: string;
    foil: boolean;
    signed: boolean | null;
    card: PlayerCardData;
  } | null;
}

/** The pinned copies, in slot order, for one binder owner.
 *
 *  Every row is re-checked against the owner: a pin survives in the table
 *  until it is overwritten, but a copy that has since been traded away is
 *  no longer theirs to show, so it is dropped here rather than deleted by
 *  a trigger on every transfer path. */
async function fetchBinderCards(
  supabase: SupabaseClient,
  discordId: string,
): Promise<BinderCard[]> {
  const { data, error } = await supabase
    .from("card_binder_slots")
    .select("slot, inventory_id, card_inventory(discord_id, player_name, edition_week, tier, foil, signed, card)")
    .eq("discord_id", discordId)
    .order("slot");
  if (error) return [];
  return ((data as unknown as SlotJoinRow[]) ?? [])
    .filter((row) => row.card_inventory?.discord_id === discordId)
    .map((row) => ({
      slot: row.slot,
      inventoryId: row.inventory_id,
      playerName: row.card_inventory!.player_name,
      editionWeek: row.card_inventory!.edition_week,
      tier: row.card_inventory!.tier,
      foil: row.card_inventory!.foil,
      signed: row.card_inventory!.signed === true,
      card: row.card_inventory!.card,
    }));
}

/** Who the binder belongs to, for the public page's header. Failure is not
 *  fatal — a binder with an unnamed owner still shows its cards. */
async function fetchOwner(
  supabase: SupabaseClient,
  discordId: string,
): Promise<{ name: string | null; avatarUrl: string | null }> {
  const { data, error } = await supabase
    .from("betting_profiles")
    .select("username, avatar_url")
    .eq("discord_id", discordId)
    .maybeSingle();
  if (error || !data) return { name: null, avatarUrl: null };
  const row = data as { username: string | null; avatar_url: string | null };
  return { name: row.username, avatarUrl: row.avatar_url };
}

/** A binder by its share token, or null. The token is the permission: it is
 *  unguessable and never derived from the user id, so binders cannot be
 *  enumerated. */
export async function fetchBinderByToken(supabase: SupabaseClient, token: string): Promise<Binder | null> {
  // Postgres rejects a malformed uuid rather than returning no rows, so a
  // junk token would surface as an error; treat both as "no binder".
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) return null;
  const { data, error } = await supabase
    .from("card_binders")
    .select("discord_id, token, title")
    .eq("token", token)
    .maybeSingle();
  if (error || !data) return null;
  const binder = data as { discord_id: string; token: string; title: string | null };
  const [cards, owner] = await Promise.all([
    fetchBinderCards(supabase, binder.discord_id),
    fetchOwner(supabase, binder.discord_id),
  ]);
  return {
    discordId: binder.discord_id,
    token: binder.token,
    title: binder.title,
    ownerName: owner.name,
    ownerAvatarUrl: owner.avatarUrl,
    cards,
  };
}

/** The caller's own binder, minting one on first use so the share link
 *  exists the moment they look for it. Returns null only if the table is
 *  missing (the migration hasn't been applied to this environment), which
 *  the packs page renders as "no binder section" rather than an error. */
export async function fetchOrCreateOwnBinder(
  supabase: SupabaseClient,
  discordId: string,
): Promise<Binder | null> {
  const { data, error } = await supabase
    .from("card_binders")
    .upsert({ discord_id: discordId }, { onConflict: "discord_id", ignoreDuplicates: true })
    .select("discord_id, token, title")
    .maybeSingle();

  // ignoreDuplicates returns no row when one already existed — read it.
  let binder = data as { discord_id: string; token: string; title: string | null } | null;
  if (!binder && !error) {
    const existing = await supabase
      .from("card_binders")
      .select("discord_id, token, title")
      .eq("discord_id", discordId)
      .maybeSingle();
    binder = existing.data as typeof binder;
  }
  if (error || !binder) return null;

  const [cards, owner] = await Promise.all([
    fetchBinderCards(supabase, discordId),
    fetchOwner(supabase, discordId),
  ]);
  return {
    discordId,
    token: binder.token,
    title: binder.title,
    ownerName: owner.name,
    ownerAvatarUrl: owner.avatarUrl,
    cards,
  };
}
