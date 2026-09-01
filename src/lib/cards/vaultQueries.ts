// The reads behind /cards/vault.
//
// Framework-free (takes any SupabaseClient, no next/headers), same shape as
// the other card query modules — the page hands in the service-role client
// because card_inventory and card_provenance are deny-all RLS, not because
// the registry is private. It is the opposite of private: a one-of-one is
// league news, and the whole point of the page is that a signed-out visitor
// can look up who holds what.
//
// Every read here is paged on a total order. PostgREST silently caps an
// unpaged select at max_rows and reports no error, so a season whose archive
// outgrew the cap would quietly stop listing its oldest weeks — the exact
// failure mode the collection read was fixed for, and one that would be
// invisible here because a missing unclaimed print looks identical to a
// claimed one.

import type { SupabaseClient } from "@supabase/supabase-js";
import { cardSlug, type PlayerCardData } from "@/lib/cards/build";
import { describeProvenance, fetchProvenance } from "@/lib/cards/provenance";
import { printRunKey } from "@/lib/packs/printRuns";
import { ECLIPSE_FOIL_TYPE } from "@/lib/packs/config";
import { patronFlameOf } from "@/lib/patron/flames";
import type { FoundEclipse, UnclaimedPrint, VaultData } from "./vault";
import { orderFound } from "./vault";

const PAGE = 1000;
const MAX_PAGES = 20;

interface EclipseDbRow {
  id: number;
  discord_id: string;
  slug: string;
  player_name: string;
  role: string;
  edition_week: string;
  overall: number;
  tier: string;
  signed: boolean | null;
  card: PlayerCardData;
  acquired_at: string;
}

/** Every Eclipse in the season, oldest id first. Paged on `id` — the primary
 *  key, and the only column here guaranteed to be unique. */
async function fetchEclipseCopies(supabase: SupabaseClient, season: string): Promise<EclipseDbRow[]> {
  const rows: EclipseDbRow[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE;
    const { data, error } = await supabase
      .from("card_inventory")
      .select("id, discord_id, slug, player_name, role, edition_week, overall, tier, signed, card, acquired_at")
      .eq("season", season)
      .eq("foil_type", ECLIPSE_FOIL_TYPE)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    // An error on the first page means no registry at all (an environment
    // without the migration); on a later page it means we show what we read
    // rather than throwing it away.
    if (error) break;
    const batch = (data as EclipseDbRow[]) ?? [];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return rows;
}

interface CrownedDbRow {
  edition_week: string;
  slug: string;
  player_name: string;
  role: string;
  tier: string;
}

/** Every crowned print in the season's archive — the Cards of the Week, five
 *  a week, each one an Eclipse slot. Paged on the archive's own primary key
 *  order `(edition_week, slug)` so pages are disjoint. */
async function fetchCrownedPrints(supabase: SupabaseClient, season: string): Promise<CrownedDbRow[]> {
  const rows: CrownedDbRow[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE;
    const { data, error } = await supabase
      .from("card_editions")
      .select("edition_week, slug, player_name, role, tier")
      .eq("season", season)
      // The crown lives inside the frozen json, which is the only place it
      // lives — same `->>` read the weekly drop's board does.
      .filter("card->>standout", "eq", "true")
      .order("edition_week", { ascending: false })
      .order("slug", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) break;
    const batch = (data as CrownedDbRow[]) ?? [];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return rows;
}

/** The slugs of players who have inked a signature this season. One row per
 *  player — a roster, not a collection — so this is the one read here that
 *  cannot approach the row cap. Computed in TypeScript with the same
 *  cardSlug the cards themselves are built with, rather than leaning on the
 *  database's `card_slug()`: the page then works in any environment, applied
 *  migration or not. */
async function fetchSignedSlugs(supabase: SupabaseClient, season: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("card_art_prefs")
    .select("summoner_name, tag, signature")
    .eq("season", season)
    .not("signature", "is", null);
  if (error) return new Set();
  const rows = (data as { summoner_name: string; tag: string; signature: string | null }[]) ?? [];
  return new Set(rows.filter((row) => Boolean(row.signature)).map((row) => cardSlug(row.summoner_name, row.tag)));
}

interface OwnerDbRow {
  discord_id: string;
  username: string | null;
  avatar_url: string | null;
  patron_until: string | null;
  patron_flame: string | null;
}

/** Names, faces and flames for the holders, in one read rather than one per
 *  copy — a collector who owns three Eclipses is the same person three
 *  times. Failure is not fatal: the registry still names them by id. */
async function fetchHolders(
  supabase: SupabaseClient,
  discordIds: readonly string[],
  now: Date,
): Promise<Map<string, { name: string | null; avatarUrl: string | null; flame: string | null }>> {
  const holders = new Map<string, { name: string | null; avatarUrl: string | null; flame: string | null }>();
  if (discordIds.length === 0) return holders;
  const { data, error } = await supabase
    .from("betting_profiles")
    .select("discord_id, username, avatar_url, patron_until, patron_flame")
    .in("discord_id", [...new Set(discordIds)]);
  if (error) return holders;
  for (const row of (data as OwnerDbRow[]) ?? []) {
    const burning = Boolean(row.patron_until && new Date(row.patron_until).getTime() > now.getTime());
    holders.set(row.discord_id, {
      name: row.username,
      avatarUrl: row.avatar_url,
      flame: burning ? patronFlameOf(row.patron_flame) : null,
    });
  }
  return holders;
}

/**
 * The whole registry for one season: what has been found, and what is still
 * out there.
 *
 * `now` is injectable for the same reason patron reads elsewhere take it —
 * a bare Date.now() in a render path is a render impurity, and a test that
 * cannot move the clock cannot pin whether a lapsed patron still burns.
 *
 * The provenance chains are fetched one copy at a time. That is a read per
 * Eclipse, which would be indefensible for a collection and is fine here:
 * an Eclipse is one per crowned print per week, five slots a week, and the
 * ones that have actually been FOUND are a handful. If that ever stops being
 * true the fix is a single query over `inventory_id in (...)`, not a cache.
 */
export async function fetchVault(
  supabase: SupabaseClient,
  season: string,
  now: Date = new Date(),
): Promise<VaultData> {
  const [copies, crowned, signedSlugs] = await Promise.all([
    fetchEclipseCopies(supabase, season),
    fetchCrownedPrints(supabase, season),
    fetchSignedSlugs(supabase, season),
  ]);

  const [holders, chains] = await Promise.all([
    fetchHolders(supabase, copies.map((row) => row.discord_id), now),
    Promise.all(copies.map(async (row) => describeProvenance(await fetchProvenance(supabase, row.id)))),
  ]);

  const found: FoundEclipse[] = copies.map((row, index) => {
    const holder = holders.get(row.discord_id);
    return {
      inventoryId: row.id,
      slug: row.slug,
      playerName: row.player_name,
      role: row.role,
      tier: row.tier,
      overall: row.overall,
      // A date column comes back as YYYY-MM-DD, but a timestamp-shaped one
      // would not — slice so the key below and the label agree either way.
      editionWeek: row.edition_week.slice(0, 10),
      signed: row.signed === true,
      acquiredAt: row.acquired_at,
      expeditionMark: row.card?.expedition?.mark ?? null,
      card: row.card,
      owner: {
        discordId: row.discord_id,
        name: holder?.name ?? row.discord_id,
        avatarUrl: holder?.avatarUrl ?? null,
        flame: holder?.flame ?? null,
      },
      chain: chains[index],
    };
  });

  // A print is claimed once ONE Eclipse exists for it — the partial unique
  // index guarantees there can never be two — so the set is keyed on exactly
  // the columns that index covers.
  const taken = new Set(found.map((copy) => printRunKey(copy.editionWeek, copy.slug)));
  const unclaimed: UnclaimedPrint[] = crowned
    .map((row) => ({
      editionWeek: row.edition_week.slice(0, 10),
      slug: row.slug,
      playerName: row.player_name,
      role: row.role,
      tier: row.tier,
      mintsSigned: signedSlugs.has(row.slug),
    }))
    .filter((print) => !taken.has(printRunKey(print.editionWeek, print.slug)));

  return { found: orderFound(found), unclaimed };
}
