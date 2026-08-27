// The Weekly Draw's read side: what the panel on /cards and the history
// page at /cards/draw render.
//
// Every card copy in a season is one raffle ticket, and one copy wins each
// week (supabase/migrations/20260831000001_weekly_draw.sql). weekly_draws
// is publicly readable so the history renders signed-out — card_inventory
// is not, so the ticket count takes the service client, exactly the split
// src/lib/fantasy/queries.ts documents.
//
// Framework-free (any SupabaseClient, no next/headers), same as its
// siblings in this directory: pages hand a client in.
//
// Every read fails soft. The draw arrived after the card hub did, so an
// environment whose weekly_draw migration hasn't landed must render the
// hub with no panel rather than 500 the whole page.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlayerCardData } from "./build";

/** One drawn week. `card` is the frozen snapshot the RPC wrote — already
 *  stamped with its laurel, and the record itself: the copy it came from
 *  may be dusted tomorrow, which is why copy_id carries no foreign key. */
export interface DrawRow {
  season: string;
  weekStart: string;
  discordId: string;
  card: PlayerCardData;
  pot: number;
  drawnAt: string;
}

/** The one sentence the whole feature is about, written once so the panel,
 *  the history page and the Discord post can't drift apart. */
export const DRAW_TAGLINE = "One card wins every week — is it yours?";

/** What both surfaces say before the first draw — a promise, not an error,
 *  because that is what it is: the draw runs every Tuesday. */
export const DRAW_EMPTY_HEADLINE = "No draws yet — the first winner is one Tuesday away.";

/** copy_id is deliberately absent: nothing on these surfaces addresses the
 *  living copy, and the snapshot outlives it. */
const DRAW_COLUMNS = "season, week_start, discord_id, card, pot, drawn_at";

interface DrawDbRow {
  season: string;
  week_start: string;
  discord_id: string;
  card: PlayerCardData;
  pot: number | string;
  drawn_at: string;
}

/** The card json is passed through by reference, never rebuilt: a frozen
 *  snapshot is history, and history doesn't get re-derived. */
function mapDraw(row: DrawDbRow): DrawRow {
  return {
    season: row.season,
    weekStart: row.week_start,
    discordId: row.discord_id,
    card: row.card,
    // pot is a bigint; PostgREST is entitled to hand it back as a string,
    // and a string would render fine right up until something adds to it.
    pot: Number(row.pot),
    drawnAt: row.drawn_at,
  };
}

/** The most recent week this season has drawn, or null before the first
 *  one (and on any failure — the panel is garnish). */
export async function fetchLatestDraw(supabase: SupabaseClient, season: string): Promise<DrawRow | null> {
  const { data, error } = await supabase
    .from("weekly_draws")
    .select(DRAW_COLUMNS)
    .eq("season", season)
    .order("week_start", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return mapDraw(data as DrawDbRow);
}

/** Every drawn week for a season, newest first. */
export async function fetchDrawHistory(supabase: SupabaseClient, season: string): Promise<DrawRow[]> {
  const { data, error } = await supabase
    .from("weekly_draws")
    .select(DRAW_COLUMNS)
    .eq("season", season)
    .order("week_start", { ascending: false });
  if (error) return [];
  return ((data as DrawDbRow[]) ?? []).map(mapDraw);
}

/**
 * How many tickets a collector holds: one per copy in the season, which is
 * the entire game — commons count the same as a Challenger, and the people
 * holding more copies simply hold more tickets.
 *
 * Service client only (card_inventory has no public read policy), head-only
 * because the number is all anyone wants — the collection itself is already
 * on the packs page.
 */
export async function fetchTicketCount(
  service: SupabaseClient,
  discordId: string,
  season: string,
): Promise<number> {
  const { count, error } = await service
    .from("card_inventory")
    .select("id", { count: "exact", head: true })
    .eq("discord_id", discordId)
    .eq("season", season);
  if (error) return 0;
  return count ?? 0;
}

/**
 * What the /cards panel says, as a pure function of the last draw and who
 * is looking — the three states the panel has, decided in one place a test
 * can hold still rather than inline in JSX.
 *
 * The winner check is a strict comparison of two ids: a loose one would
 * make every signed-out visitor (viewer id null) the winner of a draw whose
 * discord_id read back empty.
 */
export function drawPanelState(
  latest: DrawRow | null,
  viewerDiscordId: string | null,
): { headline: string; isWinner: boolean } {
  if (!latest) return { headline: DRAW_EMPTY_HEADLINE, isWinner: false };
  const isWinner = Boolean(viewerDiscordId) && latest.discordId === viewerDiscordId;
  return {
    headline: isWinner
      ? `Your ${latest.card.name} came up — the pot is yours.`
      : `${latest.card.name} came up. Every copy you hold is another ticket.`,
    isWinner,
  };
}
