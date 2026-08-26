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
}

/** A user's collection for one season, newest pull first. Errors return
 *  empty — a collection page should render as "nothing yet" rather than
 *  500 when the migration hasn't been applied to this environment. */
export async function fetchInventory(
  supabase: SupabaseClient,
  discordId: string,
  season: string,
): Promise<InventoryRow[]> {
  const { data, error } = await supabase
    .from("card_inventory")
    .select("id, season, slug, player_name, role, edition_week, overall, tier, foil, foil_type, signed, card, pack_open_id, acquired_at")
    .eq("discord_id", discordId)
    .eq("season", season)
    .order("acquired_at", { ascending: false });
  if (error) return [];
  const rows = (data as InventoryDbRow[]) ?? [];
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
      : { badges: new Map<string, string>(), abbrs: new Map<string, string>() },
  );
  return rows.map((row, index) => ({
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
    card: repaired[index],
    packOpenId: row.pack_open_id,
    acquiredAt: row.acquired_at,
  }));
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
