import "server-only";

// What the packs page shows: the set packs open from, what the viewer has
// left this week, and the copies they own (newest first).

import type { SupabaseClient } from "@supabase/supabase-js";
import { WEEKLY_ALLOWANCE, type OffseasonCopy } from "./packs";
import type { OffseasonEvent } from "./types";

/** Copies shown on the page; a week of packs is at most 100. */
export const SHELF_LIMIT = 60;

export interface PackShop {
  /** The latest published set of the current event, or null before the first. */
  set: { weekNumber: number; size: number; publishedAt: string } | null;
  remaining: number;
  copies: OffseasonCopy[];
  /** How many copies the viewer owns in all. */
  owned: number;
}

export async function loadPackShop(supabase: SupabaseClient, event: OffseasonEvent | null, userId: string | null): Promise<PackShop> {
  const empty: PackShop = { set: null, remaining: WEEKLY_ALLOWANCE, copies: [], owned: 0 };
  if (!event || event.status === "complete") return empty;

  const [setResult, walletResult, copiesResult] = await Promise.all([
    supabase
      .from("offseason_card_sets")
      .select("week_number, published_at")
      .eq("event_id", event.id)
      .order("week_number", { ascending: false })
      .limit(1)
      .maybeSingle(),
    userId ? supabase.rpc("offseason_pack_wallet").maybeSingle() : Promise.resolve({ data: null, error: null }),
    userId
      ? supabase
          .from("offseason_card_copies")
          .select("id, week_number, foil, shiny, signed, card", { count: "exact" })
          .eq("owner_id", userId)
          .order("created_at", { ascending: false })
          .order("slot")
          .limit(SHELF_LIMIT)
      : Promise.resolve({ data: [], error: null, count: 0 }),
  ]);
  const failed = setResult.error ?? walletResult.error ?? copiesResult.error;
  if (failed) throw new Error(`offseason packs read failed: ${failed.message}`);

  const latest = setResult.data as { week_number: number; published_at: string } | null;
  let set: PackShop["set"] = null;
  if (latest) {
    const { count, error } = await supabase
      .from("offseason_cards")
      .select("entrant_id", { count: "exact", head: true })
      .eq("event_id", event.id)
      .eq("week_number", latest.week_number);
    if (error) throw new Error(`offseason packs read failed: ${error.message}`);
    set = { weekNumber: latest.week_number, size: count ?? 0, publishedAt: latest.published_at };
  }

  const rows = (copiesResult.data ?? []) as {
    id: number;
    week_number: number;
    foil: boolean;
    shiny: boolean;
    signed: boolean;
    card: OffseasonCopy["card"];
  }[];
  return {
    set,
    remaining: (walletResult.data as { remaining: number } | null)?.remaining ?? WEEKLY_ALLOWANCE,
    copies: rows.map((row) => ({ id: row.id, weekNumber: row.week_number, foil: row.foil, shiny: row.shiny, signed: row.signed, card: row.card })),
    owned: ("count" in copiesResult ? copiesResult.count : null) ?? rows.length,
  };
}
