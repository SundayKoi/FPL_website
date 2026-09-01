// A copy's chain of custody, read and then said out loud.
//
// The database writes card_provenance from triggers on card_inventory
// (supabase/migrations/20260912000002_card_provenance.sql), so this module
// never writes anything — it reads the chain, puts names to the Discord ids
// in it, and turns the rows into the two or three lines a card preview
// actually shows.
//
// Split the way the rest of src/lib is: `fetchProvenance` does the IO and
// takes any SupabaseClient (a service-role one — card_provenance is
// deny-all RLS, exactly like the inventory it describes), and
// `describeProvenance` is pure, so the sentences are testable without a
// database and can run on the client that renders them.

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchBettingUsernames } from "@/lib/fantasy/queries";

export type ProvenanceEventKind = "minted" | "transferred" | "dusted";

/** One side of a move. `name` falls back to the raw Discord id when the
 *  profile has no username, same as fetchBettingUsernames. */
export interface ProvenanceParty {
  id: string;
  name: string;
}

/** One thing that happened to a copy. `from` is null on a mint and `to` is
 *  null on a dust — the shape says which event it is even without reading
 *  `event`. `ref` names what caused it, when the cause said so. */
export interface ProvenanceEvent {
  id: number;
  event: ProvenanceEventKind;
  from: ProvenanceParty | null;
  to: ProvenanceParty | null;
  at: string;
  ref: { table: string; id: number } | null;
}

interface ProvenanceDbRow {
  id: number;
  event: string;
  from_discord: string | null;
  to_discord: string | null;
  ref_table: string | null;
  ref_id: number | null;
  at: string;
}

/** A chain is a handful of rows — a copy that has changed hands ten times
 *  is a legend, not a load — so this is one unpaged read with a ceiling
 *  well above anything real, rather than the paging fetchInventory needs. */
const PROVENANCE_LIMIT = 200;

const EVENT_KINDS = new Set<string>(["minted", "transferred", "dusted"]);

/**
 * One copy's history, oldest first — the order the index is built in and
 * the order it reads as a story.
 *
 * Errors return empty rather than throwing: provenance is something a card
 * preview shows *as well as* the card, and an environment where the
 * migration hasn't been applied should render the card with no chain
 * instead of failing to render the card.
 *
 * The id is never checked against an owner. It cannot be: the chain of a
 * copy someone is offering you names people who are not you, and that is
 * the whole point of looking at it. The gate is on the action that calls
 * this (fetchProvenanceAction), which is the same gate as looking at the
 * card itself.
 */
export async function fetchProvenance(
  supabase: SupabaseClient,
  inventoryId: number,
): Promise<ProvenanceEvent[]> {
  const { data, error } = await supabase
    .from("card_provenance")
    .select("id, event, from_discord, to_discord, ref_table, ref_id, at")
    .eq("inventory_id", inventoryId)
    .order("at", { ascending: true })
    .order("id", { ascending: true })
    .limit(PROVENANCE_LIMIT);
  if (error) return [];

  const rows = ((data as ProvenanceDbRow[]) ?? []).filter((row) => EVENT_KINDS.has(row.event));
  if (rows.length === 0) return [];

  // One name lookup for the whole chain rather than one per row: a copy
  // that has been round-tripped between two collectors names the same two
  // people over and over.
  const ids = rows.flatMap((row) => [row.from_discord, row.to_discord]).filter((id): id is string => Boolean(id));
  const names = await fetchBettingUsernames(supabase, ids);
  const party = (id: string | null): ProvenanceParty | null =>
    id ? { id, name: names.get(id) ?? id } : null;

  return rows.map((row) => ({
    id: row.id,
    event: row.event as ProvenanceEventKind,
    from: party(row.from_discord),
    to: party(row.to_discord),
    at: row.at,
    // Both halves or neither — a table with no id points at nothing.
    ref: row.ref_table && row.ref_id !== null ? { table: row.ref_table, id: row.ref_id } : null,
  }));
}

/**
 * A date as a chain reads it: "Aug 24".
 *
 * Formatted in UTC for editionLabel's reason — the stored timestamp is an
 * instant, but a chain rendered on the server and hydrated on the client
 * has to agree with itself, and a browser in Auckland deciding a pull
 * happened a day later than the server said is a hydration mismatch on
 * every card in the collection.
 */
function shortDate(at: string): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** "Traded to Spies" and "Traded to Spies · Aug 30" — the date is dropped
 *  rather than printed as an empty tail when the row's timestamp is
 *  unreadable. */
function line(text: string, at: string): string {
  const when = shortDate(at);
  return when ? `${text} · ${when}` : text;
}

/**
 * The chain as sentences, in the order it happened.
 *
 * Pure, and deliberately not clever: a mint is who pulled it, a transfer is
 * who it went to, a dust is who destroyed it. The sender of a transfer is
 * left out because the line above it already said who was holding the card
 * — a chain that repeats "from X" on every row reads as a ledger rather
 * than as a story, and the ledger is one query away for anyone who wants
 * it.
 *
 * A row with nobody on the side it needs is skipped rather than rendered
 * with a blank where a name goes.
 */
export function describeProvenance(events: ProvenanceEvent[]): string[] {
  const lines: string[] = [];
  for (const event of events) {
    if (event.event === "minted") {
      if (event.to) lines.push(line(`Pulled by ${event.to.name}`, event.at));
    } else if (event.event === "transferred") {
      if (event.to) lines.push(line(`Traded to ${event.to.name}`, event.at));
    } else if (event.event === "dusted") {
      if (event.from) lines.push(line(`Dusted by ${event.from.name}`, event.at));
    }
  }
  return lines;
}
