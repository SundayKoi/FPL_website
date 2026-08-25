// Writing the card archive.
//
// Reading it lives in queries.ts (fetchCardEditionWeeks / fetchEditionCards);
// this is the other half, split out so the weekly drop is not the only thing
// that can archive a week. Framework-free for the same reason as its
// siblings: both callers are scripts running under tsx.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlayerCardData } from "./build";

/**
 * Freezes `cards` as `season`'s edition for `week`.
 *
 * Keyed on the edition week rather than the run time, so re-archiving a
 * week overwrites it instead of laying down a second copy — which is what
 * makes a re-run of the drop safe.
 *
 * Returns an error message rather than throwing: the weekly drop treats a
 * failed archive as tolerable (an environment without the card_editions
 * migration should still get its snapshot and its movers post), and the
 * standalone archiver decides for itself that it is fatal.
 */
export async function archiveEdition(
  supabase: SupabaseClient,
  season: string,
  week: string,
  cards: PlayerCardData[],
  takenAt: string = new Date().toISOString(),
): Promise<string | null> {
  if (cards.length === 0) return null;
  const { error } = await supabase.from("card_editions").upsert(
    cards.map((card) => ({
      season,
      edition_week: week,
      slug: card.slug,
      player_name: card.name,
      role: card.role,
      overall: card.overall,
      tier: card.tier.label,
      card,
      taken_at: takenAt,
    })),
    { onConflict: "season,edition_week,slug" },
  );
  return error?.message ?? null;
}

/** The literal a caller passes to rebuild the whole archive. */
export const ALL_WEEKS = "all";

/**
 * Which weeks one archiver run should write.
 *
 * `all` returns every week already archived, plus the current one — the
 * current week matters because it may not be archived yet, and the pack
 * shop offers the newest ARCHIVED week by default. Rebuilding the rest
 * while leaving that one behind would fix every edition except the one
 * most people are actually buying.
 *
 * Newest first, deduped, so a run's log reads in the order the shop lists
 * them and re-archiving a week that is also the current one does not do
 * the work twice.
 */
export function weeksToArchive(requested: string, archived: string[], currentWeek: string): string[] {
  if (requested === ALL_WEEKS) {
    return [...new Set([...archived, currentWeek])].sort((a, b) => b.localeCompare(a));
  }
  return [requested || currentWeek];
}
