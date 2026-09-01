// Reads over card_listings and card_wants. Framework-free (takes any
// SupabaseClient, no next/headers), the same shape as src/lib/trades/queries.ts
// — pages pass the service-role client in.
//
// Both tables have RLS on with no policies at all
// (20260912000003_card_market.sql), so a caller handing in the cookie-bound
// anon client gets empty results rather than the board. Deciding WHO may see
// the market is the page's job, not this module's.
//
// Every read here is paged on `id`. PostgREST silently caps an unpaged select
// at max_rows and reports no error, so a board that outgrew the cap would
// simply stop showing its oldest listings with nothing anywhere to explain it
// — the same failure fetchCollectors was fixed for.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlayerCardData } from "@/lib/cards/build";
import { fetchBettingUsernames } from "@/lib/fantasy/queries";
import { isAltArt } from "@/lib/trades/queries";

export type ListingStatus = "open" | "sold" | "cancelled" | "expired";
export type WantStatus = "open" | "filled" | "cancelled";

/** The copy a listing points at, hydrated out of card_inventory. */
export interface MarketCopy {
  id: number;
  slug: string;
  playerName: string;
  role: string;
  overall: number;
  tier: string;
  foil: boolean;
  foilType: string | null;
  signed: boolean;
  /** This copy printed in an alternate skin — see isAltArt. */
  altArt: boolean;
  editionWeek: string;
  /** The frozen card, for the preview. */
  card: PlayerCardData | null;
}

export interface MarketListing {
  id: number;
  season: string;
  inventoryId: number;
  sellerDiscordId: string;
  sellerUsername: string;
  ask: number;
  note: string | null;
  status: ListingStatus;
  createdAt: string;
  expiresAt: string;
  decidedAt: string | null;
  buyerDiscordId: string | null;
  buyerUsername: string | null;
  /** Null when the copy has been dusted since the listing went up. */
  copy: MarketCopy | null;
  /**
   * The copy is not where the listing says it is — dusted, traded away, or
   * sold elsewhere since. `buy_card_listing` would raise 'card not owned', so
   * the board says so rather than offering a Buy button that always fails.
   *
   * Only ever true on an OPEN listing: once a listing is sold the copy has
   * legitimately changed hands, and flagging that would mark every completed
   * sale in the history broken.
   */
  stale: boolean;
}

export interface MarketWant {
  id: number;
  season: string;
  discordId: string;
  username: string;
  slug: string;
  bounty: number;
  note: string | null;
  status: WantStatus;
  createdAt: string;
  decidedAt: string | null;
  filledInventoryId: number | null;
  filledBy: string | null;
  filledByUsername: string | null;
}

/** A player who can be named by a want — the slug picker's list. */
export interface WantablePlayer {
  slug: string;
  name: string;
}

interface ListingDbRow {
  id: number;
  season: string;
  inventory_id: number;
  seller_discord: string;
  ask: number;
  note: string | null;
  status: ListingStatus;
  created_at: string;
  expires_at: string;
  decided_at: string | null;
  buyer_discord: string | null;
}

interface WantDbRow {
  id: number;
  season: string;
  discord_id: string;
  slug: string;
  bounty: number;
  note: string | null;
  status: WantStatus;
  created_at: string;
  decided_at: string | null;
  filled_inventory_id: number | null;
  filled_by: string | null;
}

interface CopyDbRow {
  id: number;
  discord_id: string;
  season: string;
  slug: string;
  player_name: string;
  role: string;
  edition_week: string;
  overall: number;
  tier: string;
  foil: boolean;
  foil_type: string | null;
  signed: boolean | null;
  card: PlayerCardData;
}

const LISTING_COLUMNS =
  "id, season, inventory_id, seller_discord, ask, note, status, created_at, expires_at, decided_at, buyer_discord";

const WANT_COLUMNS =
  "id, season, discord_id, slug, bounty, note, status, created_at, decided_at, filled_inventory_id, filled_by";

const COPY_COLUMNS =
  "id, discord_id, season, slug, player_name, role, edition_week, overall, tier, foil, foil_type, signed, card";

/** How many closed rows either board keeps in the history strip. Recent
 *  activity, not an archive. */
const HISTORY_LIMIT = 20;

type QueryResult = { data: unknown; error: unknown };

/**
 * Reads every page of a filtered select, ordered on a TOTAL key.
 *
 * `build` is handed the inclusive range for one page and returns the query.
 * Callers must order on `id` and nothing else: paging on a non-unique sort
 * key lets Postgres hand back a row twice on one page and skip another,
 * which on a market board would mean a listing that exists and never
 * renders.
 *
 * An error stops paging and returns what was already collected, so a board
 * degrades to "fewer listings" rather than to a 500 — same tolerance every
 * other card read keeps for an environment where the migration hasn't landed.
 */
async function pageAll<T>(
  build: (from: number, to: number) => PromiseLike<QueryResult>,
  pageSize = 1000,
  maxPages = 20,
): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 0; page < maxPages; page += 1) {
    const from = page * pageSize;
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) return rows;
    const batch = (data as T[]) ?? [];
    rows.push(...batch);
    if (batch.length < pageSize) return rows;
  }
  return rows;
}

function toCopy(row: CopyDbRow): MarketCopy {
  return {
    id: row.id,
    slug: row.slug,
    playerName: row.player_name,
    role: row.role,
    overall: row.overall,
    tier: row.tier,
    foil: row.foil,
    foilType: row.foil_type,
    signed: row.signed === true,
    altArt: isAltArt(row.card),
    editionWeek: row.edition_week,
    card: row.card ?? null,
  };
}

/**
 * Hydrates listing rows with their copies and every named party's username.
 *
 * Two round trips for the whole page rather than one per listing, and the
 * copies come back keyed by id so a listing whose card has been dusted lands
 * on `copy: null` instead of dropping out of the board — a listing that
 * vanishes silently is indistinguishable from one that was never written.
 */
async function hydrateListings(
  supabase: SupabaseClient,
  rows: ListingDbRow[],
): Promise<MarketListing[]> {
  if (rows.length === 0) return [];

  const copyIds = [...new Set(rows.map((row) => row.inventory_id))];
  const parties = [
    ...new Set(rows.flatMap((row) => [row.seller_discord, ...(row.buyer_discord ? [row.buyer_discord] : [])])),
  ];

  const [copiesResult, names] = await Promise.all([
    supabase.from("card_inventory").select(COPY_COLUMNS).in("id", copyIds),
    fetchBettingUsernames(supabase, parties),
  ]);

  const copies = new Map<number, CopyDbRow>();
  for (const row of ((copiesResult.error ? [] : (copiesResult.data as CopyDbRow[])) ?? []) as CopyDbRow[]) {
    copies.set(row.id, row);
  }

  return rows.map((row) => {
    const copy = copies.get(row.inventory_id);
    return {
      id: row.id,
      season: row.season,
      inventoryId: row.inventory_id,
      sellerDiscordId: row.seller_discord,
      sellerUsername: names.get(row.seller_discord) ?? row.seller_discord,
      ask: row.ask,
      note: row.note,
      status: row.status,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      decidedAt: row.decided_at,
      buyerDiscordId: row.buyer_discord,
      buyerUsername: row.buyer_discord ? (names.get(row.buyer_discord) ?? row.buyer_discord) : null,
      copy: copy ? toCopy(copy) : null,
      stale: row.status === "open" && (!copy || copy.discord_id !== row.seller_discord),
    };
  });
}

async function hydrateWants(supabase: SupabaseClient, rows: WantDbRow[]): Promise<MarketWant[]> {
  if (rows.length === 0) return [];
  const parties = [
    ...new Set(rows.flatMap((row) => [row.discord_id, ...(row.filled_by ? [row.filled_by] : [])])),
  ];
  const names = await fetchBettingUsernames(supabase, parties);
  return rows.map((row) => ({
    id: row.id,
    season: row.season,
    discordId: row.discord_id,
    username: names.get(row.discord_id) ?? row.discord_id,
    slug: row.slug,
    bounty: row.bounty,
    note: row.note,
    status: row.status,
    createdAt: row.created_at,
    decidedAt: row.decided_at,
    filledInventoryId: row.filled_inventory_id,
    filledBy: row.filled_by,
    filledByUsername: row.filled_by ? (names.get(row.filled_by) ?? row.filled_by) : null,
  }));
}

/**
 * The board: every listing still standing in this season.
 *
 * Filtered on `expires_at > now()` as well as on status, because nothing
 * sweeps lapsed rows — they stay 'open' until the seller next lists something
 * (see createListing). A board that showed them would be offering Buy buttons
 * the RPC refuses.
 */
export async function fetchOpenListings(
  supabase: SupabaseClient,
  season: string,
  now: Date = new Date(),
): Promise<MarketListing[]> {
  const rows = await pageAll<ListingDbRow>((from, to) =>
    supabase
      .from("card_listings")
      .select(LISTING_COLUMNS)
      .eq("season", season)
      .eq("status", "open")
      .gt("expires_at", now.toISOString())
      .order("id", { ascending: false })
      .range(from, to),
  );
  return hydrateListings(supabase, rows);
}

/** Everything one collector has on the market, open first, then their recent
 *  history — the "Your listings" panel. */
export async function fetchListingsBySeller(
  supabase: SupabaseClient,
  discordId: string,
  season: string,
): Promise<MarketListing[]> {
  const rows = await pageAll<ListingDbRow>((from, to) =>
    supabase
      .from("card_listings")
      .select(LISTING_COLUMNS)
      .eq("seller_discord", discordId)
      .eq("season", season)
      .order("id", { ascending: false })
      .range(from, to),
  );
  const open = rows.filter((row) => row.status === "open");
  const closed = rows.filter((row) => row.status !== "open").slice(0, HISTORY_LIMIT);
  return hydrateListings(supabase, [...open, ...closed]);
}

/** Every bounty still standing this season. */
export async function fetchOpenWants(supabase: SupabaseClient, season: string): Promise<MarketWant[]> {
  const rows = await pageAll<WantDbRow>((from, to) =>
    supabase
      .from("card_wants")
      .select(WANT_COLUMNS)
      .eq("season", season)
      .eq("status", "open")
      .order("id", { ascending: false })
      .range(from, to),
  );
  return hydrateWants(supabase, rows);
}

/** One collector's own wants, open first then recent history. */
export async function fetchWantsBy(
  supabase: SupabaseClient,
  discordId: string,
  season: string,
): Promise<MarketWant[]> {
  const rows = await pageAll<WantDbRow>((from, to) =>
    supabase
      .from("card_wants")
      .select(WANT_COLUMNS)
      .eq("discord_id", discordId)
      .eq("season", season)
      .order("id", { ascending: false })
      .range(from, to),
  );
  const open = rows.filter((row) => row.status === "open");
  const closed = rows.filter((row) => row.status !== "open").slice(0, HISTORY_LIMIT);
  return hydrateWants(supabase, [...open, ...closed]);
}

/**
 * Who a want may be posted for: this season's printed cards, by slug.
 *
 * Read out of `card_editions` (the frozen weekly archive) rather than out of
 * the live rating engine, because fetchSeasonCards rebuilds every card in the
 * league from raw stats and this list only needs a name against a slug. The
 * newest archived week is the roster as it stands.
 *
 * The fallback matters more than it looks: a league that has never run a
 * weekly drop has no editions at all, and a want board with an empty player
 * list is a page with a dead form on it. The distinct slugs already in
 * card_inventory are the next best answer — every card anyone holds — and a
 * want nobody can fill is not much of a want anyway.
 */
export async function fetchWantablePlayers(
  supabase: SupabaseClient,
  season: string,
): Promise<WantablePlayer[]> {
  // One row, not a paged sweep: all this needs is the newest week's date, and
  // the archive holds one row per card per week.
  const weekResult = await supabase
    .from("card_editions")
    .select("edition_week")
    .eq("season", season)
    .order("edition_week", { ascending: false })
    .limit(1);
  const latest = weekResult.error
    ? null
    : (((weekResult.data as { edition_week: string }[] | null) ?? [])[0]?.edition_week ?? null);

  const byName = new Map<string, string>();
  if (latest) {
    const cards = await pageAll<{ slug: string; name: string | null }>((from, to) =>
      supabase
        .from("card_editions")
        .select("slug, name:card->>name")
        .eq("season", season)
        .eq("edition_week", latest)
        .order("slug", { ascending: true })
        .range(from, to),
    );
    for (const row of cards) byName.set(row.slug, row.name ?? row.slug);
  }

  if (byName.size === 0) {
    const owned = await pageAll<{ id: number; slug: string; player_name: string }>((from, to) =>
      supabase
        .from("card_inventory")
        .select("id, slug, player_name")
        .eq("season", season)
        .order("id", { ascending: true })
        .range(from, to),
    );
    for (const row of owned) byName.set(row.slug, row.player_name);
  }

  return [...byName.entries()]
    .map(([slug, name]) => ({ slug, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
