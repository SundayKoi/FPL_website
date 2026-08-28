// Reads behind roster sets — what a collector has already been paid for,
// and which copies are spent.
//
// Framework-free (any SupabaseClient), like its siblings. Every read fails
// soft to "nothing claimed": these back a section of a page, and an
// environment without 20260903000001_card_set_claims.sql applied should
// render the sets un-clamed rather than 500 the collection.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { SetPlayer } from "./sets";

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

/**
 * The edition, slimmed to what a SET needs — five names and which team
 * they played for.
 *
 * fetchEditionCards hands back the whole frozen card json for every
 * player: sub-stats, top champions, form, highlights, the autograph. A set
 * reads none of it. Asking for all of it once per week made switching
 * weeks a page-sized read, and the section's whole job is to be flicked
 * through.
 *
 * teamName comes out of the json because that is the only place it lives
 * (card_editions has no team column), the same `->>` read the ledger uses
 * for artSkin.
 *
 * Paged, for the same reason every other read here is: this asks for
 * several weeks at once, and a season's worth of editions passes a
 * thousand rows long before a collector runs out of weeks to look at.
 */
export interface SetEditionCard extends SetPlayer {
  editionWeek: string;
}

const EDITION_PAGE = 1000;
const EDITION_MAX_PAGES = 20;

export async function fetchSetEditionCards(
  supabase: SupabaseClient,
  season: string,
  weeks: readonly string[],
): Promise<SetEditionCard[]> {
  if (weeks.length === 0) return [];
  const rows: SetEditionCard[] = [];
  for (let page = 0; page < EDITION_MAX_PAGES; page += 1) {
    const from = page * EDITION_PAGE;
    const { data, error } = await supabase
      .from("card_editions")
      .select("edition_week, slug, player_name, role, overall, teamName:card->>teamName, teamImageUrl:card->>teamImageUrl")
      .eq("season", season)
      .in("edition_week", [...weeks])
      .order("slug")
      .range(from, from + EDITION_PAGE - 1);
    if (error) break;
    const batch = (data as {
      edition_week: string;
      slug: string;
      player_name: string;
      role: string;
      overall: number;
      teamName: string | null;
      teamImageUrl: string | null;
    }[]) ?? [];
    rows.push(
      ...batch.map((row) => ({
        editionWeek: row.edition_week.slice(0, 10),
        slug: row.slug,
        name: row.player_name,
        role: row.role,
        overall: row.overall,
        teamName: row.teamName,
        teamImageUrl: row.teamImageUrl,
      })),
    );
    if (batch.length < EDITION_PAGE) break;
  }
  return rows;
}

/**
 * The collector's copies from one week, as thin as a set needs them.
 *
 * The claim used to read the WHOLE collection — every copy of every week,
 * each carrying its frozen card json — to find five ids. On a collection
 * past a thousand copies that is the slowest thing the claim does, and it
 * happens between the click and the money.
 */
export async function fetchWeekCopyIds(
  supabase: SupabaseClient,
  discordId: string,
  season: string,
  week: string,
): Promise<{ id: number; slug: string; editionWeek: string }[]> {
  const { data, error } = await supabase
    .from("card_inventory")
    .select("id, slug, edition_week")
    .eq("discord_id", discordId)
    .eq("season", season)
    .eq("edition_week", week);
  if (error) return [];
  return ((data as { id: number; slug: string; edition_week: string }[]) ?? []).map((row) => ({
    id: row.id,
    slug: row.slug,
    editionWeek: row.edition_week.slice(0, 10),
  }));
}
