// Reads behind roster sets — what a collector has already been paid for,
// and which copies are spent.
//
// Framework-free (any SupabaseClient), like its siblings. Every read fails
// soft to "nothing claimed": these back a section of a page, and an
// environment without 20260903000001_card_set_claims.sql applied should
// render the sets un-clamed rather than 500 the collection.

import type { SupabaseClient } from "@supabase/supabase-js";

/** A set is identified by its week and its team — the same pair the
 *  claims table is unique on. */
export function setKey(weekStart: string, teamName: string): string {
  return `${weekStart}|${teamName}`;
}

export interface SetClaimState {
  /** setKey() of every set this collector has already been paid for. */
  claimed: Set<string>;
  /**
   * Copies that can never fill a slot again, because some claim already
   * spent them. Restricted to the ids passed in — the table is league-wide
   * and grows forever, and the only rows that matter here are the ones
   * sitting in this collection.
   *
   * Not just this collector's own claims: a copy spent by whoever owned it
   * before is spent for its new owner too, which is the whole point of
   * keying that table on the copy.
   */
  spent: Set<number>;
}

const EMPTY: SetClaimState = { claimed: new Set(), spent: new Set() };

export async function fetchSetClaimState(
  supabase: SupabaseClient,
  discordId: string,
  season: string,
  copyIds: readonly number[],
): Promise<SetClaimState> {
  const claimsResult = await supabase
    .from("card_set_claims")
    .select("edition_week, team_name")
    .eq("discord_id", discordId)
    .eq("season", season);
  if (claimsResult.error) return EMPTY;

  const claimed = new Set(
    ((claimsResult.data as { edition_week: string; team_name: string }[]) ?? []).map((row) =>
      // edition_week is a date column and comes back as YYYY-MM-DD, the
      // same shape mondayOf produces — but slice anyway so a driver that
      // ever hands back a timestamp cannot silently stop matching.
      setKey(row.edition_week.slice(0, 10), row.team_name),
    ),
  );

  if (copyIds.length === 0) return { claimed, spent: new Set() };
  const spentResult = await supabase
    .from("card_set_claim_copies")
    .select("inventory_id")
    .in("inventory_id", [...copyIds]);
  if (spentResult.error) return { claimed, spent: new Set() };
  return {
    claimed,
    spent: new Set(((spentResult.data as { inventory_id: number }[]) ?? []).map((row) => row.inventory_id)),
  };
}
