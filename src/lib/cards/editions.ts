// Writing the card archive.
//
// Reading it lives in queries.ts (fetchCardEditionWeeks / fetchEditionCards);
// this is the other half, split out so the weekly drop is not the only thing
// that can archive a week. Framework-free for the same reason as its
// siblings: both callers are scripts running under tsx.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlayerCardData } from "./build";

/**
 * Freezes `cards` as `season`'s edition for `week` — the WHOLE edition,
 * replacing whatever was there.
 *
 * Keyed on the edition week rather than the run time, so re-archiving a
 * week overwrites it instead of laying down a second copy.
 *
 * The prune at the end is what makes that true of the ROSTER and not just
 * of each row. An upsert alone is additive: re-archiving a week whose
 * roster shrank writes the new cards over the old ones and leaves everyone
 * no longer in the pool sitting there. That is not hypothetical — the
 * first archives were taken on a season-to-date basis, so week 2's edition
 * held every player who had played all season. Rebuilding it on the week's
 * own games wrote the right 61 cards and left 5 week-1-only players
 * behind, and packs kept minting them.
 *
 * Order matters: cards are written FIRST and the stale ones removed after,
 * so the edition is never momentarily empty. A pack opened mid-run sees a
 * superset, which is the state it would have seen anyway; a pack opened
 * against an empty edition would fail outright.
 *
 * Never prunes to nothing — an empty `cards` returns early, so a week that
 * fetched no games leaves its existing edition alone rather than deleting
 * it. Losing an archived week to a transient read is worse than leaving it
 * stale, and the caller cannot tell those two apart.
 *
 * Copies people already pulled live in card_inventory and are untouched.
 *
 * Reports how many stale rows it removed. A delete that says nothing is
 * how a broken rebuild hides: the run before this one silently did not
 * prune, and the only way to find out was to query the database by hand.
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
): Promise<{ error: string | null; pruned: number }> {
  if (cards.length === 0) return { error: null, pruned: 0 };
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
  if (error) return { error: error.message, pruned: 0 };

  // Reconcile the roster. Reading the week's slugs back and deleting the
  // difference, rather than a "not in (...)" filter: slugs are derived from
  // player names, which in this league include Greek and Japanese, and
  // building a filter string out of them invites a quoting bug that would
  // delete the wrong rows.
  const kept = new Set(cards.map((card) => card.slug));
  const { data: existing, error: readError } = await supabase
    .from("card_editions")
    .select("slug")
    .eq("season", season)
    .eq("edition_week", week);
  // The cards are already written, so a failed prune leaves the edition
  // correct-but-wide rather than wrong. Report it; do not undo the write.
  if (readError) return { error: readError.message, pruned: 0 };

  const stale = ((existing as { slug: string }[]) ?? [])
    .map((row) => row.slug)
    .filter((slug) => !kept.has(slug));
  if (stale.length === 0) return { error: null, pruned: 0 };

  const { error: pruneError } = await supabase
    .from("card_editions")
    .delete()
    .eq("season", season)
    .eq("edition_week", week)
    .in("slug", stale);
  return { error: pruneError?.message ?? null, pruned: pruneError ? 0 : stale.length };
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
