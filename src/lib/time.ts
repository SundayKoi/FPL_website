import type { SupabaseClient } from "@supabase/supabase-js";

export async function fetchServerOffset(supabase: SupabaseClient): Promise<number> {
  const { data, error } = await supabase.rpc("get_server_time");
  if (error || !data) return 0; // degrade gracefully: trust local clock
  return new Date(data as string).getTime() - Date.now();
}

export function remainingMs(closesAt: string, offsetMs: number, nowMs: number = Date.now()): number {
  return Math.max(0, new Date(closesAt).getTime() - (nowMs + offsetMs));
}

/**
 * "just now", "12m ago", "3h ago", "2d ago", then the date — how long ago
 * something happened, in the two or three characters a row has room for.
 * Offers and listings carry their timestamp; without this they read as
 * timeless, and "is this from today or three weeks ago" is the first thing
 * anyone asks of an offer.
 */
export function relativeTime(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const seconds = Math.round((now.getTime() - then) / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days}d ago`;
  return new Date(then).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
}

/** A full, unambiguous stamp for a title attribute: league time, labelled. */
export function easternStamp(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })} ET`;
}
