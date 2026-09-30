// Free-pack comps (card_pack_comps): spent and refunded by compare-and-swap.
// Split out of open.ts, which re-exports both helpers.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Spend one comp by compare-and-swap (PostgREST can't decrement in
 *  place): read the count, update only if it still holds. A lost race
 *  retries once against the new count; two clicks can never spend one
 *  comp twice. Returns the remaining count after spending, or null when
 *  no comp was held.
 *
 *  `kind` is the shelf the comp buys from: "champions" for the Faceless
 *  Drop's tribute, "standard" for the shop pack the Weekly Draw pays out.
 *  select("*") rather than a column list, for deploy-before-migration
 *  tolerance — same as the shop's other comps reads. */
export async function spendPackComp(
  service: SupabaseClient,
  discordId: string,
  kind: string,
): Promise<number | null> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data: compRow } = await service
      .from("card_pack_comps")
      .select("*")
      .eq("discord_id", discordId)
      .eq("kind", kind)
      .maybeSingle();
    const held = (compRow as { remaining?: number } | null)?.remaining ?? 0;
    if (held <= 0) return null;
    const { data: spent } = await service
      .from("card_pack_comps")
      .update({ remaining: held - 1 })
      .eq("discord_id", discordId)
      .eq("kind", kind)
      .eq("remaining", held)
      .select("remaining");
    if (spent && spent.length > 0) return held - 1;
  }
  return null;
}

/** Hand one comp back the same compare-and-swap way it was spent, after a
 *  fulfilment that failed. `false` means it is still gone and someone has
 *  to restore it by hand — every caller says that out loud rather than
 *  promising a return it can't stand behind. A missing row is a refusal,
 *  not an insert: minting a comp out of an error is worse than losing one.
 */
export async function refundPackComp(
  service: SupabaseClient,
  discordId: string,
  kind: string,
): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data: compRow } = await service
      .from("card_pack_comps")
      .select("*")
      .eq("discord_id", discordId)
      .eq("kind", kind)
      .maybeSingle();
    const held = (compRow as { remaining?: number } | null)?.remaining;
    if (held === undefined) return false;
    const { data: restored } = await service
      .from("card_pack_comps")
      .update({ remaining: held + 1 })
      .eq("discord_id", discordId)
      .eq("kind", kind)
      .eq("remaining", held)
      .select("remaining");
    if (restored && restored.length > 0) return true;
  }
  return false;
}
