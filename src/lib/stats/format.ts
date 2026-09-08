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

/**
 * A lane diff, the way a player says it out loud: "+14", "-3", "0".
 *
 * The em-dash case is the one that matters. A null diff means the mark was
 * never measured — the game ended before it, or nobody was logged in the
 * opposite seat — and that is not the same statement as an even lane.
 * Rendering it as 0 would put a player who never reached twenty minutes
 * next to one who fought to a dead heat there.
 *
 * `digits` is 1 for CS (fractional creeps are meaningful at this scale) and
 * 0 for gold and XP, which also get thousands separators.
 */
export function formatLaneDiff(value: number | null | undefined, digits: 0 | 1): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const shown = digits === 1 ? value.toFixed(1) : Math.round(value).toLocaleString();
  return value > 0 ? `+${shown}` : shown;
}
