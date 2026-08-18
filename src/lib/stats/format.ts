// Small display formatters shared across the stats tabs (Teams/Timeline
// durations, Records/PlayerDetail dates and record values). Pure functions,
// no data logic.

/** `m:ss` from a fractional-minutes duration (e.g. 31.5 -> "31:30"). */
export function formatDuration(min: number): string {
  const m = Math.floor(min);
  const s = Math.round((min - m) * 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Locale date (e.g. "Aug 18, 2026") from an ISO timestamp; echoes unparseable input. */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/** Locale number capped at 2 fraction digits (record values). */
export function formatValue(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
