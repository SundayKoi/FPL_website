// Reads over card_trades. Framework-free (takes any SupabaseClient, no
// next/headers), same shape as src/lib/packs/queries.ts — pages pass the
// service-role client in.
//
// card_trades and card_inventory both have RLS on with no policies at all
// (20260826000018_card_trading.sql), so a caller handing in the cookie-bound
// anon client gets empty results rather than someone else's shelf. Deciding
// *whose* trades to ask for is the caller's job.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlayerCardData } from "@/lib/cards/build";

export type TradeStatus = "pending" | "accepted" | "declined" | "cancelled";

/** One card named by a trade, hydrated out of card_inventory. */
export interface TradeCard {
  id: number;
  slug: string;
  playerName: string;
  role: string;
  overall: number;
  tier: string;
  foil: boolean;
  signed: boolean;
  editionWeek: string;
  /** The frozen card, for rendering. Null when the copy is gone. */
  card: PlayerCardData | null;
  /**
   * This copy is no longer where the offer says it is — dusted, or traded
   * away to someone else since. A pending trade carrying one of these can
   * never execute (`accept_card_trade` raises 'trade is stale'), so the UI
   * should say so rather than offering an Accept button that always fails.
   *
   * Only ever true on a PENDING trade: once a trade is accepted the cards
   * have legitimately changed hands, and flagging that as stale would mark
   * every completed trade in the history broken.
   */
  stale: boolean;
}

export interface TradeRow {
  id: number;
  season: string;
  fromDiscordId: string;
  fromUsername: string;
  toDiscordId: string;
  toUsername: string;
  offered: TradeCard[];
  requested: TradeCard[];
  offeredDollars: number;
  requestedDollars: number;
  status: TradeStatus;
  createdAt: string;
  decidedAt: string | null;
  /** Any card in this (pending) trade has moved — it can't be accepted. */
  stale: boolean;
}

interface TradeDbRow {
  id: number;
  season: string;
  from_discord: string;
  to_discord: string;
  offered_inventory_ids: number[] | null;
  requested_inventory_ids: number[] | null;
  offered_dollars: number;
  requested_dollars: number;
  status: TradeStatus;
  created_at: string;
  decided_at: string | null;
}

interface CardDbRow {
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
  signed: boolean | null;
  card: PlayerCardData;
}

const TRADE_COLUMNS =
  "id, season, from_discord, to_discord, offered_inventory_ids, requested_inventory_ids, offered_dollars, requested_dollars, status, created_at, decided_at";

const CARD_COLUMNS =
  "id, discord_id, season, slug, player_name, role, edition_week, overall, tier, foil, signed, card";

/** How many trades either list keeps. A trade log is a recent-activity feed,
 *  not an archive — pending offers always make the cut because they sort
 *  first. */
const TRADE_LIMIT = 30;

/** A copy the offer names that isn't in card_inventory any more — dusted, or
 *  never existed. Rendered as a gap rather than dropped, so "2 cards for 1"
 *  doesn't silently become "1 card for 1". */
function missingCard(id: number): TradeCard {
  return {
    id,
    slug: "",
    playerName: "Card no longer available",
    role: "",
    overall: 0,
    tier: "bronze",
    foil: false,
    signed: false,
    editionWeek: "",
    card: null,
    stale: true,
  };
}

function hydrate(ids: number[], owner: string, pending: boolean, cards: Map<number, CardDbRow>): TradeCard[] {
  return ids.map((id) => {
    const row = cards.get(id);
    if (!row) return missingCard(id);
    return {
      id: row.id,
      slug: row.slug,
      playerName: row.player_name,
      role: row.role,
      overall: row.overall,
      tier: row.tier,
      foil: row.foil,
      signed: row.signed === true,
      editionWeek: row.edition_week,
      card: row.card,
      stale: pending && row.discord_id !== owner,
    };
  });
}

/** Pending first (they need an answer), then most recently decided. */
function byUrgency(a: TradeRow, b: TradeRow): number {
  const pending = Number(b.status === "pending") - Number(a.status === "pending");
  if (pending !== 0) return pending;
  return (b.decidedAt ?? b.createdAt).localeCompare(a.decidedAt ?? a.createdAt);
}

/**
 * Everything this user is party to in one season, split by direction.
 *
 * Two queries rather than one `or(...)` filter: incoming and outgoing are
 * rendered as separate lists anyway, and each gets its own limit so a burst
 * of outgoing offers can't push every incoming one off the page. Cards and
 * usernames are then hydrated across both lists in one round trip each.
 *
 * Errors read as "no trades" — a page should render empty rather than 500
 * when the migration hasn't reached this environment.
 */
export async function fetchTradesFor(
  supabase: SupabaseClient,
  discordId: string,
  season: string,
): Promise<{ incoming: TradeRow[]; outgoing: TradeRow[] }> {
  const [incomingRes, outgoingRes] = await Promise.all([
    supabase
      .from("card_trades")
      .select(TRADE_COLUMNS)
      .eq("to_discord", discordId)
      .eq("season", season)
      .order("created_at", { ascending: false })
      .limit(TRADE_LIMIT),
    supabase
      .from("card_trades")
      .select(TRADE_COLUMNS)
      .eq("from_discord", discordId)
      .eq("season", season)
      .order("created_at", { ascending: false })
      .limit(TRADE_LIMIT),
  ]);

  const incomingRaw = (incomingRes.error ? [] : ((incomingRes.data as TradeDbRow[]) ?? [])) as TradeDbRow[];
  const outgoingRaw = (outgoingRes.error ? [] : ((outgoingRes.data as TradeDbRow[]) ?? [])) as TradeDbRow[];
  const all = [...incomingRaw, ...outgoingRaw];
  if (all.length === 0) return { incoming: [], outgoing: [] };

  const cardIds = [
    ...new Set(all.flatMap((row) => [...(row.offered_inventory_ids ?? []), ...(row.requested_inventory_ids ?? [])])),
  ];
  const parties = [...new Set(all.flatMap((row) => [row.from_discord, row.to_discord]))];

  const [cardsRes, namesRes] = await Promise.all([
    cardIds.length > 0
      ? supabase.from("card_inventory").select(CARD_COLUMNS).in("id", cardIds)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("betting_profiles").select("discord_id, username").in("discord_id", parties),
  ]);

  const cards = new Map<number, CardDbRow>();
  for (const row of (cardsRes.error ? [] : ((cardsRes.data as CardDbRow[]) ?? [])) as CardDbRow[]) {
    cards.set(row.id, row);
  }
  const names = new Map<string, string>();
  for (const row of (namesRes.error ? [] : ((namesRes.data as { discord_id: string; username: string | null }[]) ?? [])) as {
    discord_id: string;
    username: string | null;
  }[]) {
    names.set(row.discord_id, row.username ?? row.discord_id);
  }

  const map = (row: TradeDbRow): TradeRow => {
    const pending = row.status === "pending";
    const offered = hydrate(row.offered_inventory_ids ?? [], row.from_discord, pending, cards);
    const requested = hydrate(row.requested_inventory_ids ?? [], row.to_discord, pending, cards);
    return {
      id: row.id,
      season: row.season,
      fromDiscordId: row.from_discord,
      fromUsername: names.get(row.from_discord) ?? row.from_discord,
      toDiscordId: row.to_discord,
      toUsername: names.get(row.to_discord) ?? row.to_discord,
      offered,
      requested,
      offeredDollars: row.offered_dollars,
      requestedDollars: row.requested_dollars,
      status: row.status,
      createdAt: row.created_at,
      decidedAt: row.decided_at,
      stale: [...offered, ...requested].some((card) => card.stale),
    };
  };

  return {
    incoming: incomingRaw.map(map).sort(byUrgency),
    outgoing: outgoingRaw.map(map).sort(byUrgency),
  };
}

export interface Collector {
  discordId: string;
  username: string;
  cards: number;
}

/**
 * Everyone holding at least one card this season, biggest collection first —
 * the partner picker's list.
 *
 * Counted in JS over the id/owner columns rather than with a SQL group-by,
 * for the same reason fetchSeasonTotals does: PostgREST has no aggregate
 * surface here, and a season's inventory is league-sized (thousands of rows
 * at most, two small columns each).
 */
export async function fetchCollectors(supabase: SupabaseClient, season: string): Promise<Collector[]> {
  const { data, error } = await supabase.from("card_inventory").select("discord_id").eq("season", season);
  if (error) return [];

  const counts = new Map<string, number>();
  for (const row of (data as { discord_id: string }[]) ?? []) {
    counts.set(row.discord_id, (counts.get(row.discord_id) ?? 0) + 1);
  }
  if (counts.size === 0) return [];

  const { data: profiles } = await supabase
    .from("betting_profiles")
    .select("discord_id, username")
    .in("discord_id", [...counts.keys()]);
  const names = new Map<string, string>();
  for (const row of (profiles as { discord_id: string; username: string | null }[]) ?? []) {
    names.set(row.discord_id, row.username ?? row.discord_id);
  }

  return [...counts.entries()]
    .map(([discordId, cards]) => ({ discordId, username: names.get(discordId) ?? discordId, cards }))
    .sort((a, b) => b.cards - a.cards || a.username.localeCompare(b.username));
}
