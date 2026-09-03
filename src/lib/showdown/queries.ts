// Reads for Showdown: the lobby, one table, and where the viewer sits.
// Service client only — the public tables are readable by anyone, but the
// secret row is not, and every write goes through server.ts.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { BracketKey } from "./config";
import type { HandResult, PublicState, SecretState } from "./engine";
import type { HandRow } from "./leaderboard";

export interface TableRow {
  id: number;
  bracket: BracketKey;
  season: string;
  name: string;
  code: string | null;
  status: "waiting" | "hand" | "closed";
  version: number;
  handNo: number;
  publicState: PublicState;
  deadlineAt: string | null;
  createdBy: string | null;
  /** When the table was opened — the lobby says how long it has waited. */
  createdAt?: string | null;
}

export interface SeatRow {
  id: number;
  tableId: number;
  seatNo: number;
  discordId: string;
  chips: number;
  status: "active" | "sitting_out" | "leaving";
  houseStack: boolean;
  timeouts: number;
}

interface TableDbRow {
  id: number;
  bracket: BracketKey;
  season: string;
  name: string;
  code: string | null;
  status: TableRow["status"];
  version: number;
  hand_no: number;
  public_state: PublicState | Record<string, never>;
  deadline_at: string | null;
  created_by: string | null;
  created_at?: string | null;
}

const TABLE_COLUMNS = "id, bracket, season, name, code, status, version, hand_no, public_state, deadline_at, created_by, created_at";

function mapTable(row: TableDbRow): TableRow {
  const state = row.public_state as Partial<PublicState>;
  return {
    id: row.id,
    bracket: row.bracket,
    season: row.season,
    name: row.name,
    code: row.code,
    status: row.status,
    version: row.version,
    handNo: row.hand_no,
    publicState: {
      seats: state.seats ?? [],
      dealerSeat: state.dealerSeat ?? null,
      hand: state.hand ?? null,
      lastHand: state.lastHand ?? null,
    },
    deadlineAt: row.deadline_at,
    createdBy: row.created_by,
    createdAt: row.created_at ?? null,
  };
}

/** Open public tables this season, with their seat counts. */
export async function fetchOpenTables(supabase: SupabaseClient, season: string): Promise<(TableRow & { seated: number })[]> {
  const { data, error } = await supabase
    .from("showdown_tables")
    .select(TABLE_COLUMNS)
    .eq("season", season)
    .neq("status", "closed")
    .is("code", null)
    .order("created_at", { ascending: true });
  if (error) return [];
  return ((data as TableDbRow[]) ?? []).map((row) => {
    const table = mapTable(row);
    return { ...table, seated: table.publicState.seats.length };
  });
}

export async function fetchTable(supabase: SupabaseClient, id: number): Promise<TableRow | null> {
  const { data, error } = await supabase.from("showdown_tables").select(TABLE_COLUMNS).eq("id", id).maybeSingle();
  if (error || !data) return null;
  return mapTable(data as TableDbRow);
}

export async function fetchTableByCode(supabase: SupabaseClient, code: string): Promise<TableRow | null> {
  const { data, error } = await supabase.from("showdown_tables").select(TABLE_COLUMNS).eq("code", code).maybeSingle();
  if (error || !data) return null;
  return mapTable(data as TableDbRow);
}

export async function fetchSecret(supabase: SupabaseClient, tableId: number): Promise<SecretState> {
  const { data } = await supabase.from("showdown_secrets").select("state").eq("table_id", tableId).maybeSingle();
  const state = ((data as { state: Partial<SecretState> } | null)?.state ?? {}) as Partial<SecretState>;
  return { stacks: state.stacks ?? {}, hole: state.hole ?? {}, deck: state.deck ?? [] };
}

/** The viewer's seat anywhere, or null. One seat per person is a
 *  constraint, so this is at most one row. */
export async function fetchViewerSeat(supabase: SupabaseClient, discordId: string): Promise<SeatRow | null> {
  const { data, error } = await supabase
    .from("showdown_seats")
    .select("id, table_id, seat_no, discord_id, chips, status, house_stack, timeouts")
    .eq("discord_id", discordId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { id: number; table_id: number; seat_no: number; discord_id: string; chips: number; status: SeatRow["status"]; house_stack: boolean; timeouts: number };
  return { id: row.id, tableId: row.table_id, seatNo: row.seat_no, discordId: row.discord_id, chips: row.chips, status: row.status, houseStack: row.house_stack, timeouts: row.timeouts };
}

export async function countOpenTables(supabase: SupabaseClient, season: string): Promise<number> {
  const { count, error } = await supabase
    .from("showdown_tables")
    .select("id", { count: "exact", head: true })
    .eq("season", season)
    .eq("status", "hand");
  if (error) return 0;
  return count ?? 0;
}

/** Settled hands this season since `sinceIso`, newest last. */
export async function fetchHandsSince(supabase: SupabaseClient, season: string, sinceIso: string): Promise<HandRow[]> {
  const { data, error } = await supabase
    .from("showdown_hands")
    .select("id, table_id, hand_no, bracket, played_at, pot, rake, record")
    .eq("season", season)
    .gte("played_at", sinceIso)
    .order("played_at", { ascending: true })
    .limit(5000);
  if (error) return [];
  return ((data as { id: number; table_id: number; hand_no: number; bracket: string; played_at: string; pot: number; rake: number; record: HandResult }[]) ?? []).map((row) => ({
    id: row.id,
    tableId: row.table_id,
    handNo: row.hand_no,
    bracket: row.bracket,
    playedAt: row.played_at,
    pot: row.pot,
    rake: row.rake,
    record: row.record,
  }));
}

/** Tables the sweep should look at: a hand whose clock is a second gone,
 *  or a waiting table with two or more seats. */
export async function fetchTablesDue(supabase: SupabaseClient, now: Date): Promise<number[]> {
  const cutoff = new Date(now.getTime() - 1000).toISOString();
  const [{ data: late }, { data: waiting }] = await Promise.all([
    supabase.from("showdown_tables").select("id").eq("status", "hand").lt("deadline_at", cutoff).limit(50),
    supabase.from("showdown_tables").select("id, public_state").eq("status", "waiting").limit(200),
  ]);
  const ids = new Set<number>();
  for (const row of (late as { id: number }[] | null) ?? []) ids.add(row.id);
  for (const row of (waiting as { id: number; public_state: Partial<PublicState> }[] | null) ?? []) {
    const active = (row.public_state.seats ?? []).filter((seat) => seat.status === "active" && seat.chips > 0).length;
    if (active >= 2) ids.add(row.id);
  }
  return [...ids];
}
