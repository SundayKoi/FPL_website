// Patron tenure, read from the receipts.
//
// patron_payments is the durable record every grant writes (the
// grant_patron RPC refuses to extend patron_until without one), so summing
// days_granted IS the tenure — it survives lapses and rejoins, which is
// the generous reading: six months of support is six months of support
// even with a gap in the middle.

import type { SupabaseClient } from "@supabase/supabase-js";

/** Total days of patronage ever granted to this user. 0 on no rows and 0
 *  when the receipts table is missing (deploy-before-migration). */
export async function fetchPatronTenureDays(supabase: SupabaseClient, discordId: string): Promise<number> {
  const { data, error } = await supabase
    .from("patron_payments")
    .select("days_granted")
    .eq("discord_id", discordId);
  if (error) return 0;
  return ((data as { days_granted: number | null }[]) ?? []).reduce(
    (total, row) => total + (row.days_granted ?? 0),
    0,
  );
}
