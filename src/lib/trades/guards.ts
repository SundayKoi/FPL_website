// Which copies are off the table.
//
// A card that is fielded in a fantasy week that hasn't been graded yet can't
// be dusted or traded away: the lineup is live, the games are still being
// played, and pulling a starter out from under it mid-week would let someone
// bank the dust and keep the entry.
//
// Only UNGRADED weeks lock anything. Once a week is scored, its entry is
// self-contained — fantasy_lineups.slots stores a denormalized snapshot of
// each fielded card (see src/lib/fantasy/scoring.ts's StoredSlot), so the
// leaderboard renders a past week without touching card_inventory at all.
// That is what keeps this set small: at most one week's five cards per
// player, not everything they have ever fielded.
//
// Framework-free (takes any SupabaseClient), same as
// src/lib/packs/queries.ts.

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The card_inventory ids referenced by one `fantasy_lineups.slots` jsonb.
 *
 * Pure and defensive: `slots` is a jsonb column, so it is data rather than a
 * promise. Anything that isn't a role object carrying a numeric
 * `inventoryId` is skipped rather than trusted, which also means a legacy or
 * hand-written row can't blow up a dust click.
 */
export function inventoryIdsFromSlots(slots: unknown): number[] {
  if (!slots || typeof slots !== "object") return [];
  const ids: number[] = [];
  for (const slot of Object.values(slots as Record<string, unknown>)) {
    if (!slot || typeof slot !== "object") continue;
    const id = (slot as { inventoryId?: unknown }).inventoryId;
    if (typeof id === "number" && Number.isInteger(id)) ids.push(id);
  }
  return ids;
}

/**
 * Every card id this user has fielded in a week that hasn't been scored yet
 * — the copies they may not dust or trade away right now.
 *
 * Errors read as "nothing locked" rather than throwing: this is a guard over
 * an action that has its own ownership checks, and an environment where the
 * fantasy migration hasn't landed should still be able to dust duplicates.
 * Service client only — fantasy_lineups is publicly readable, but the
 * callers here already hold one.
 */
export async function lockedInventoryIds(
  supabase: SupabaseClient,
  discordId: string,
  season: string,
): Promise<Set<number>> {
  const { data, error } = await supabase
    .from("fantasy_lineups")
    .select("slots")
    .eq("discord_id", discordId)
    .eq("season", season)
    .is("scored_at", null);
  if (error) return new Set();
  const locked = new Set<number>();
  for (const row of (data as { slots: unknown }[]) ?? []) {
    for (const id of inventoryIdsFromSlots(row.slots)) locked.add(id);
  }
  return locked;
}
