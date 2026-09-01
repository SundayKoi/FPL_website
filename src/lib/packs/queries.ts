// Reads over the card-pack economy's tables. Framework-free on purpose
// (takes any SupabaseClient, no next/headers), same as
// src/lib/cards/queries.ts — pages pass the service-role client, and a
// future scripts/ job can reuse these under tsx.
//
// Note that card_inventory has no public RLS policy: only a service-role
// client can read it, so a caller handing in the cookie-bound anon client
// gets an empty collection rather than someone else's.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlayerCardData } from "@/lib/cards/build";
import { backfillTeamIdentity, fetchTeamIdentity } from "@/lib/cards/queries";
import { easternDateOf } from "./week";
import { patronFlameOf } from "@/lib/patron/flames";

/** One owned copy of a card. The flat columns mirror `card`'s contents at
 *  pull time — read them for filtering/sorting, read `card` to render. */
export interface InventoryRow {
  id: number;
  season: string;
  slug: string;
  playerName: string;
  role: string;
  /** Monday of the week this copy was pulled — its print run. */
  editionWeek: string;
  overall: number;
  tier: string;
  foil: boolean;
  /** Which parallel this copy printed — null on a matte card. Older foils
   *  read as 'prisma', which is what they are: the only foil that existed
   *  before parallels. */
  foilType: string | null;
  /** This copy came out autographed — the rarest print there is. The ink
   *  itself lives on `card.autograph`. */
  signed: boolean;
  /** The full card as it looked when pulled, frozen against restats. */
  card: PlayerCardData;
  packOpenId: number | null;
  acquiredAt: string;
  /** This copy's stamp within its print run — 1 for the first ever pulled.
   *  Null only on a copy written before print numbering existed in this
   *  environment; the database assigns one to everything minted since. */
  printNumber: number | null;
}

interface InventoryDbRow {
  id: number;
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
  pack_open_id: number | null;
  acquired_at: string;
  print_number: number | null;
}

/** The columns a collection read needs. Named once because two functions
 *  select exactly the same shape and a drift between them would hand one
 *  caller a row the mapper can't read. */
const INVENTORY_COLUMNS =
  "id, season, slug, player_name, role, edition_week, overall, tier, foil, foil_type, signed, card, pack_open_id, acquired_at, print_number";

/**
 * PostgREST caps a response at max_rows (1000 in config.toml, and the same
 * by default on the hosted project). A single select therefore does not
 * return "a collection" — it returns the first thousand copies, silently,
 * with no error and no marker.
 *
 * That is not a theoretical cap. It shipped as a real bug: a collector
 * past a thousand copies saw an expedition in the field rendering two of
 * its three cards as `#2317` and a `?`, because the run's squad was real
 * and the collection read that had to name those copies had quietly
 * stopped short of them.
 *
 * `acquired_at` alone is not a total order — two copies out of the same
 * pack share it — and paging on a non-total order can repeat or skip rows
 * between requests, so `id` is the tiebreak.
 */
const INVENTORY_PAGE = 1000;
const INVENTORY_MAX_PAGES = 20;

/** A user's collection for one season, newest pull first. Errors return
 *  empty — a collection page should render as "nothing yet" rather than
 *  500 when the migration hasn't been applied to this environment. */
export async function fetchInventory(
  supabase: SupabaseClient,
  discordId: string,
  season: string,
): Promise<InventoryRow[]> {
  const rows: InventoryDbRow[] = [];
  for (let page = 0; page < INVENTORY_MAX_PAGES; page += 1) {
    const from = page * INVENTORY_PAGE;
    const { data, error } = await supabase
      .from("card_inventory")
      .select(INVENTORY_COLUMNS)
      .eq("discord_id", discordId)
      .eq("season", season)
      .order("acquired_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + INVENTORY_PAGE - 1);
    // An error on the first page means no collection at all (a missing
    // table, say); on a later page it means we return what we have rather
    // than throwing away a thousand copies we already read.
    if (error) break;
    const batch = (data as InventoryDbRow[]) ?? [];
    rows.push(...batch);
    if (batch.length < INVENTORY_PAGE) break;
  }
  if (rows.length === 0) return [];
  // A copy freezes the card as it was pulled — ratings included, which is
  // the point. The team badge is the one exception: it is branding for a
  // team that can't change mid-season, and a copy pulled before that
  // team's logo resolved would otherwise wear a blank crest forever.
  // One lookup for the whole collection, applied only where it's missing.
  // Abbreviations joined the badge here: every copy pulled before the card
  // front started printing them has a null one, so the repair has to cover
  // both or old copies keep the long name over their signature.
  const needsRepair = rows.some(
    (row) => row.card && row.card.teamName && (!row.card.teamImageUrl || !row.card.teamAbbr),
  );
  const repaired = backfillTeamIdentity(
    rows.map((row) => row.card),
    needsRepair
      ? await fetchTeamIdentity(supabase, season)
      : { badges: new Map<string, string>(), abbrs: new Map<string, string>(), colors: new Map<string, string>() },
  );
  return shareIdenticalCards(rows.map((row, index) => mapInventoryRow(row, repaired[index])));
}

/**
 * Makes copies with identical frozen cards SHARE one card object.
 *
 * Nothing about the data changes — this is about how much of it crosses
 * the wire. A collection page hands every copy to a client component, and
 * React serializes each `card` it has not seen before in full: four copies
 * of one print meant four copies of the same ~1.2 KB of json, and a signed
 * copy carries an inked PNG inline, so a handful of those outweigh a
 * thousand plain cards. Repeat REFERENCES serialize as back-references, so
 * pointing the duplicates at one object is the whole fix.
 *
 * Keyed on the serialized card rather than on (slug, week, print): two
 * copies share an object only when they are byte-identical, so this cannot
 * quietly merge two prints that differ somewhere nobody thought to include
 * in a key. The stringify costs a few milliseconds on a large collection
 * and saves far more than that in transfer.
 *
 * Callers keep getting one row per copy with a `card` on it, so nothing
 * downstream can tell the difference — except that the copies are now
 * `===` to each other, which is only ever true of things that were equal
 * anyway.
 */
function shareIdenticalCards(rows: InventoryRow[]): InventoryRow[] {
  const seen = new Map<string, PlayerCardData>();
  for (const row of rows) {
    if (!row.card) continue;
    const key = JSON.stringify(row.card);
    const shared = seen.get(key);
    if (shared) row.card = shared;
    else seen.set(key, row.card);
  }
  return rows;
}

/** One db row as the app reads it. Split out of fetchInventory so the
 *  by-ids read below can't drift from the collection read — `signed` being
 *  a nullable column and `foil_type` being null on a matte card are the
 *  two places every caller would otherwise re-derive. */
function mapInventoryRow(row: InventoryDbRow, card: PlayerCardData): InventoryRow {
  return {
    id: row.id,
    season: row.season,
    slug: row.slug,
    playerName: row.player_name,
    role: row.role,
    editionWeek: row.edition_week,
    overall: row.overall,
    tier: row.tier,
    foil: row.foil,
    foilType: row.foil_type ?? null,
    signed: row.signed === true,
    card,
    packOpenId: row.pack_open_id,
    acquiredAt: row.acquired_at,
    printNumber: row.print_number ?? null,
  };
}

/**
 * Specific owned copies, by inventory id — the read a squad picker's
 * server side makes once it has three ids and needs to know what they
 * actually are (tier, parallel, ink, role) before letting them do
 * anything.
 *
 * Scoped to `discordId` in the query rather than filtered afterwards: a
 * caller handing in somebody else's id gets nothing back, so a short
 * result is always "you don't own all of these" and never "you own these,
 * plus one of theirs".
 *
 * No team-badge repair, unlike fetchInventory: this read feeds rules and
 * rolls, not a card front, and the repair needs one season while a set of
 * ids can straddle two. Render from fetchInventory.
 */
export async function fetchInventoryByIds(
  supabase: SupabaseClient,
  discordId: string,
  ids: number[],
): Promise<InventoryRow[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from("card_inventory")
    .select(INVENTORY_COLUMNS)
    .eq("discord_id", discordId)
    .in("id", ids);
  if (error) return [];
  return ((data as InventoryDbRow[]) ?? []).map((row) => mapInventoryRow(row, row.card));
}

/** How many packs this user has opened in `season` — the collector stat
 *  behind "packs opened" counters. */
export async function fetchPackOpenCount(
  supabase: SupabaseClient,
  discordId: string,
  season: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("card_pack_opens")
    .select("id", { count: "exact", head: true })
    .eq("discord_id", discordId)
    .eq("season", season);
  if (error) return 0;
  return count ?? 0;
}

export interface DailyRipStatus {
  /** Rips still unclaimed today (Eastern). */
  left: number;
  /** Active League Patron — two rips a day instead of one. */
  patron: boolean;
  /** The patron's chosen flame, null for non-patrons — an inactive
   *  patronage keeps its stored pick but stops burning. */
  flame: string | null;
}

/**
 * How many Daily Rips this user has left today. Display only — the RPC
 * (open_daily_pack) re-checks server-side, so a stale answer here can never
 * mint an extra pack.
 *
 * Counted across BOTH leagues, like the RPC: "your free daily pack" is one
 * thing, not one per season. The 36-hour window plus the Eastern-date
 * filter mirrors the RPC's day boundary without needing SQL date math
 * through PostgREST.
 */
export async function fetchDailyRipStatus(supabase: SupabaseClient, discordId: string): Promise<DailyRipStatus> {
  const since = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString();
  const [{ data: opens }, { data: profile }] = await Promise.all([
    supabase
      .from("card_pack_opens")
      .select("opened_at")
      .eq("discord_id", discordId)
      .eq("cost", 0)
      .gte("opened_at", since),
    supabase.from("betting_profiles").select("patron_until, patron_flame").eq("discord_id", discordId).maybeSingle(),
  ]);
  const today = easternDateOf(new Date());
  const used = ((opens as { opened_at: string }[]) ?? []).filter(
    (row) => easternDateOf(new Date(row.opened_at)) === today,
  ).length;
  const row = profile as { patron_until: string | null; patron_flame: string | null } | null;
  const patron = Boolean(row?.patron_until && new Date(row.patron_until).getTime() > Date.now());
  return {
    left: Math.max(0, (patron ? 2 : 1) - used),
    patron,
    flame: patron ? patronFlameOf(row?.patron_flame) : null,
  };
}

export interface LiveWindow {
  until: string;
  label: string;
}

/** The open Live Drops window, or null. league_settings is public-read, so
 *  the banner shows for signed-out visitors too. */
export async function fetchLiveWindow(supabase: SupabaseClient): Promise<LiveWindow | null> {
  const { data } = await supabase
    .from("league_settings")
    .select("live_until, live_label")
    .eq("id", 1)
    .maybeSingle();
  const row = data as { live_until: string | null; live_label: string | null } | null;
  if (!row?.live_until || new Date(row.live_until).getTime() <= Date.now()) return null;
  return { until: row.live_until, label: row.live_label?.trim() || "Live drop" };
}

/** The open Faceless Drop window, or null. select("*") so a deploy that
 *  beat the champions migration reads null instead of erroring. */
export async function fetchChampionsWindow(supabase: SupabaseClient): Promise<{ until: string } | null> {
  const { data } = await supabase
    .from("league_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  const row = data as { champions_until?: string | null } | null;
  if (!row?.champions_until || new Date(row.champions_until).getTime() <= Date.now()) return null;
  return { until: row.champions_until };
}

/** Free packs of one shelf this user still holds — "champions" for the
 *  Champion's Tribute, "standard" for the shop pack the Weekly Draw pays
 *  out. Same `kind` vocabulary spendPackComp spends against, so what the
 *  shop shows and what the open flow charges agree.
 *
 *  0 on no row, and 0 when the comps table hasn't been migrated yet —
 *  deploy-before-migration must render a normal shop, not crash it. */
export async function fetchPackComps(
  supabase: SupabaseClient,
  discordId: string,
  kind: "standard" | "champions",
): Promise<number> {
  const { data, error } = await supabase
    .from("card_pack_comps")
    .select("*")
    .eq("discord_id", discordId)
    .eq("kind", kind)
    .maybeSingle();
  if (error) return 0;
  return (data as { remaining?: number } | null)?.remaining ?? 0;
}

export interface ChaseBanner {
  title: string;
  bounty: number;
  week: string;
  /** Who took it, or null while it still stands. */
  claimedBy: string | null;
}

/**
 * The chase for `week` — claimed or not, because "X already took it" is as
 * much of the story as "it still stands". Errors (migration not applied)
 * return null: the banner is garnish.
 *
 * By WEEK alone, not season: the chase is league-wide. Premier and Academy
 * editions share their Monday, and one bounty both shops show (and both
 * leagues' packs can win) beats an academy page that pretends the week has
 * no chase. The row's stored season is bookkeeping from whoever armed it.
 */
export async function fetchChase(supabase: SupabaseClient, week: string): Promise<ChaseBanner | null> {
  const { data, error } = await supabase
    .from("card_chases")
    .select("title, bounty, week, claimed_by, betting_profiles(username)")
    .eq("week", week)
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as unknown as {
    title: string;
    bounty: number;
    week: string;
    claimed_by: string | null;
    betting_profiles: { username: string } | null;
  };
  return {
    title: row.title,
    bounty: row.bounty,
    week: row.week,
    claimedBy: row.claimed_by ? row.betting_profiles?.username ?? "someone" : null,
  };
}

/**
 * Just the slugs a collector owns, for the surfaces that only need to know
 * WHETHER a card is held — the pack shop's "new" marking, chase progress.
 *
 * Its own read because the full collection is the heaviest thing on the
 * packs page and the shop was waiting behind it to answer a question worth
 * twenty bytes a row. Split out, the shop paints while the shelf is still
 * loading.
 *
 * Paged for the same reason fetchInventory is: past a thousand copies an
 * unpaged select silently answers with the first thousand.
 */
export async function fetchOwnedSlugs(
  supabase: SupabaseClient,
  discordId: string,
  season: string,
): Promise<string[]> {
  const slugs = new Set<string>();
  for (let page = 0; page < INVENTORY_MAX_PAGES; page += 1) {
    const from = page * INVENTORY_PAGE;
    const { data, error } = await supabase
      .from("card_inventory")
      .select("slug")
      .eq("discord_id", discordId)
      .eq("season", season)
      .order("id")
      .range(from, from + INVENTORY_PAGE - 1);
    if (error) break;
    const batch = (data as { slug: string }[]) ?? [];
    for (const row of batch) slugs.add(row.slug);
    if (batch.length < INVENTORY_PAGE) break;
  }
  return [...slugs];
}

/** A print's key in the map fetchPrintRuns returns. Exported so a caller
 *  building a lookup and a caller reading one can't disagree about the
 *  separator — `week|slug`, and neither half can contain a pipe. */
export function printRunKey(editionWeek: string, slug: string): string {
  return `${editionWeek}|${slug}`;
}

/** Slugs per request. A print run row is tiny, so the limit that matters is
 *  the URL: PostgREST puts an `in.(…)` list in the query string, and a few
 *  hundred slugs of ~20 characters is already a long one. */
const PRINT_RUN_CHUNK = 120;
const PRINT_RUN_PAGE = 1000;
const PRINT_RUN_MAX_PAGES = 20;

/**
 * How many copies each named print has ever stamped — the "of 43" half of
 * "#7 of 43".
 *
 * Takes the (week, slug) pairs a page is actually rendering rather than a
 * season, because a season's counter table has a row for every card in
 * every edition week — thousands — while a collection names a few dozen
 * prints. Asking for the whole season would page through most of the table
 * to answer a question about 40 rows of it.
 *
 * Queried by slug and filtered back down to the requested pairs: a slug is
 * one `in.()` list, whereas a pair list would need one filter per pair.
 * That over-fetches a card's other weeks, which is why the chunk read is
 * ALSO paged — 120 slugs across a season's worth of weeks can pass a
 * thousand rows, and an unpaged select would silently return the first
 * thousand of them (fetchInventory's bug, in a table where the missing rows
 * would show up as a copy with no denominator).
 *
 * Errors return what has been read so far: a missing print run makes a chip
 * disappear, which is the right failure for a garnish.
 */
export async function fetchPrintRuns(
  supabase: SupabaseClient,
  season: string,
  keys: { editionWeek: string; slug: string }[],
): Promise<Map<string, number>> {
  const minted = new Map<string, number>();
  if (keys.length === 0) return minted;

  const wanted = new Set(keys.map((key) => printRunKey(key.editionWeek, key.slug)));
  const slugs = [...new Set(keys.map((key) => key.slug))];

  for (let start = 0; start < slugs.length; start += PRINT_RUN_CHUNK) {
    const chunk = slugs.slice(start, start + PRINT_RUN_CHUNK);
    for (let page = 0; page < PRINT_RUN_MAX_PAGES; page += 1) {
      const from = page * PRINT_RUN_PAGE;
      const { data, error } = await supabase
        .from("card_print_runs")
        .select("edition_week, slug, minted")
        .eq("season", season)
        .in("slug", chunk)
        // The primary key's own order, so a page boundary can't repeat or
        // skip a row the way an ordering with ties would.
        .order("slug")
        .order("edition_week")
        .range(from, from + PRINT_RUN_PAGE - 1);
      if (error) return minted;
      const batch = (data as { edition_week: string; slug: string; minted: number }[]) ?? [];
      for (const row of batch) {
        const key = printRunKey(row.edition_week, row.slug);
        if (wanted.has(key)) minted.set(key, row.minted);
      }
      if (batch.length < PRINT_RUN_PAGE) break;
    }
  }
  return minted;
}
