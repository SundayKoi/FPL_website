// Archived card editions: the weeks on sale, the frozen pools a pack mints
// from, and each card's weekly rating history. Split out of queries.ts,
// which re-exports every name here.

import type { SupabaseClient } from "@supabase/supabase-js";
import { weekDayLabel } from "@/lib/packs/week";
import type { PlayerCardData } from "./build";
import { fetchSeasonFixtures } from "./fixtureQueries";
import { exitsInWeek, isPlayoffWeek, isSendoffVaulted, sendoffVaultClosesAt, sendoffWeekLabel } from "./sendoff";
import { backfillTeamIdentity, fetchTeamIdentity } from "./teamIdentity";

/**
 * Every edition week on offer for `season`, newest first.
 *
 * Empty until the weekly drop has archived at least one week — the pack
 * shop treats that as "current cards only" rather than an error, so packs
 * keep working on a league that has never run a drop.
 */
export async function fetchCardEditionWeeks(
  supabase: SupabaseClient,
  season: string,
  /** Must not exceed the API's max_rows or every page comes back short and
   *  paging stops after the first. Exposed for tests. */
  paging: { pageSize?: number; maxPages?: number; throwOnError?: boolean } = {},
): Promise<string[]> {
  const pageSize = paging.pageSize ?? 1000;
  const maxPages = paging.maxPages ?? 100;
  const weeks = new Set<string>();

  // Paged, because this reads one row per CARD and only wants the distinct
  // weeks. PostgREST caps an unpaged select at max_rows (1000) and says
  // nothing, so at ~50 cards a week the archive crosses that line after
  // about twenty weeks — and since the order is newest-first, the rows that
  // fall off the end are the OLDEST weeks. They would simply stop appearing
  // in the pack shop, with no error anywhere to explain it.
  for (let page = 0; page < maxPages; page += 1) {
    const from = page * pageSize;
    const { data, error } = await supabase
      .from("card_editions")
      .select("edition_week")
      .eq("season", season)
      .order("edition_week", { ascending: false })
      // Total order, not just newest-first: thousands of rows share an
      // edition_week, and paging on a non-unique sort key lets the database
      // return a row twice on one page and skip another. Duplicates the Set
      // absorbs; a skipped row could drop a whole week off the list. The
      // primary key is (season, edition_week, slug), so adding slug makes
      // the ordering unique and the pages disjoint.
      .order("slug", { ascending: true })
      .range(from, from + pageSize - 1);
    // Garnish, not load-bearing for the normal pack-shop callers: an
    // environment without the card_editions migration still sells current-
    // week packs. Strict callers such as the Higher or Lower refresh can opt
    // into surfacing the read failure instead of treating it as an empty list.
    if (error) {
      if (paging.throwOnError) throw error;
      break;
    }
    const batch = (data as { edition_week: string }[]) ?? [];
    for (const row of batch) weeks.add(row.edition_week);
    if (batch.length < pageSize) break;
  }

  return [...weeks];
}

export interface EditionWeekInfo {
  week: string;
  /** What the shop calls it: "Week 3 · Sep 8", or "Send-off · Finals". */
  label: string;
  /** Set on a send-off week. `closesAt` is when the whole send-off vault
   *  shuts (ISO), or null while the finals have no date yet. */
  sendoff: { closesAt: string | null } | null;
}

/**
 * Every archived week on sale, newest first, labelled for the shop's picker.
 *
 * Two kinds of week: a weekly print, numbered ("Week 3 · Sep 8") counting
 * only the weekly prints, so a send-off in the middle of the season does not
 * push the numbering out of step with how people talk about the weeks; and a
 * send-off, named by its round ("Send-off · Finals").
 *
 * VAULTED send-off weeks are left out entirely — they are not on sale, and
 * offering a week the opener refuses is worse than not offering it.
 *
 * Deliberately no per-week card read: whether a week is a send-off is a
 * question about FIXTURES, and a select over card_editions' json for twenty
 * weeks to answer it would cost the shop a page load.
 */
export async function fetchEditionWeekInfo(
  supabase: SupabaseClient,
  season: string,
  now: Date = new Date(),
): Promise<EditionWeekInfo[]> {
  const [weeks, fixtures] = await Promise.all([
    fetchCardEditionWeeks(supabase, season),
    fetchSeasonFixtures(supabase, season),
  ]);
  const vaulted = isSendoffVaulted(fixtures, now);
  const closesAt = sendoffVaultClosesAt(fixtures);

  // Oldest first so the weekly numbering counts up the way the season ran.
  const ordered = [...weeks].sort();
  let weeklyNumber = 0;
  const rows: EditionWeekInfo[] = [];
  for (const week of ordered) {
    const sendoffLabel = isPlayoffWeek(fixtures, week) ? sendoffWeekLabel(exitsInWeek(fixtures, week)) : null;
    if (sendoffLabel) {
      if (vaulted) continue;
      rows.push({ week, label: sendoffLabel, sendoff: { closesAt } });
      continue;
    }
    weeklyNumber += 1;
    rows.push({ week, label: `Week ${weeklyNumber} · ${weekDayLabel(week)}`, sendoff: null });
  }
  return rows.reverse();
}

/**
 * The cards exactly as they stood in one archived week — the pool a pack
 * bought for that week mints from. Returns [] when the week was never
 * archived, which callers read as "fall back to the live cards".
 */
export async function fetchEditionCards(
  supabase: SupabaseClient,
  season: string,
  editionWeek: string,
): Promise<PlayerCardData[]> {
  const { data, error } = await supabase
    .from("card_editions")
    .select("card")
    .eq("season", season)
    .eq("edition_week", editionWeek);
  if (error) return [];
  const cards = ((data as { card: PlayerCardData }[]) ?? []).map((row) => row.card);
  return backfillTeamIdentity(cards, await fetchTeamIdentity(supabase, season));
}

/**
 * One archived card, exactly as it was printed in a given week.
 *
 * The share PNG needs this because a pull is FROM a week: a card ripped out
 * of the 18 August edition should picture the 18 August print, not whatever
 * that player's rating says today. Reads the one row rather than the week's
 * whole pool, which is ~50 cards of frozen json for a single picture.
 *
 * Null when that week was never archived, or holds no such slug — callers
 * fall back to the live card, same as fetchEditionCards.
 */
export async function fetchEditionCardBySlug(
  supabase: SupabaseClient,
  season: string,
  editionWeek: string,
  slug: string,
): Promise<PlayerCardData | null> {
  const { data, error } = await supabase
    .from("card_editions")
    .select("card")
    .eq("season", season)
    .eq("edition_week", editionWeek)
    .eq("slug", slug)
    .maybeSingle();
  if (error || !data) return null;
  const card = (data as { card: PlayerCardData }).card;
  // Team colours and crests live outside the frozen json, so an archived
  // card needs the same backfill the week's pool gets.
  const [withIdentity] = await backfillTeamIdentity([card], await fetchTeamIdentity(supabase, season));
  return withIdentity ?? card;
}

export interface RatingHistoryPoint {
  overall: number;
  tier: string;
  takenAt: string;
}

/** One card's weekly rating readings, oldest first — the season journey.
 *  Errors (e.g. the history migration not applied yet) return empty: the
 *  journey strip is garnish. */
export async function fetchRatingHistory(
  supabase: SupabaseClient,
  season: string,
  slug: string,
): Promise<RatingHistoryPoint[]> {
  const { data, error } = await supabase
    .from("card_rating_history")
    .select("overall, tier, taken_at")
    .eq("season", season)
    .eq("slug", slug)
    .order("taken_at");
  if (error) return [];
  return ((data as { overall: number; tier: string; taken_at: string }[]) ?? []).map((row) => ({
    overall: row.overall,
    tier: row.tier,
    takenAt: row.taken_at,
  }));
}
