// League time is Eastern (matches play Mondays 8pm ET per the rulebook —
// same convention as src/lib/schedule/format.ts's formatKickoff), so short
// dates render pinned to America/New_York too.

/** "Aug 18"-style short date in ET, or `fallback` when `iso` doesn't parse. */
export function formatShortDateET(iso: string, fallback = ""): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return fallback;
  return d.toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" });
}
