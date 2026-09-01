// Shared status badge + fixture chips for report rows — rendered identically
// by ReportBox's "My reports" list and AdminReportsQueue.

const STATUS_STYLES: Record<string, string> = {
  pending: "border-steel/50 text-steel",
  ingested: "border-mint/50 text-mint",
  needs_sides: "border-amber-400/60 text-amber-300",
  needs_side: "border-amber-400/60 text-amber-300",
  failed: "border-red-400/60 text-red-400",
  // Settled, but not by playing. Gold rather than mint: it is a finished
  // result, and it is also the one staff most often want to eyeball.
  forfeit: "border-gold/60 text-gold",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide ${STATUS_STYLES[status] ?? "border-line text-steel"}`}
    >
      {status.replace("_", " ")}
    </span>
  );
}

/**
 * A report's link to `/schedule`'s `fixtures` table (Task 8): a steel
 * "Schedule" chip whenever the report is attached to a fixture, plus a
 * gold "Synced" chip once that fixture's score has (or will have, on the
 * next ingest pass) been auto-filled from this report — i.e. the report
 * has reached `ingested` — or `forfeit`, which is just as terminal: a
 * no-show series is settled, it simply settled without any games, and the
 * schedule takes the result either way. The fixture's own score is the
 * source of truth on /schedule; this is just an indicator, no extra fetch
 * needed here.
 */
export function FixtureChips({ fixtureId, status }: { fixtureId: string | null; status: string }) {
  if (!fixtureId) return null;
  return (
    <>
      <span className="rounded-full border border-steel/50 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-steel">
        Schedule
      </span>
      {(status === "ingested" || status === "forfeit") && (
        <span className="rounded-full border border-mint/50 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-mint">
          Synced
        </span>
      )}
    </>
  );
}

/**
 * "Won by forfeit", said out loud on the report row.
 *
 * Without this the only evidence is a score that does not add up to the
 * games below it — 2-0 with one match id — which reads as a mistake and
 * invites someone to "fix" a result that was correct all along. The note is
 * the captain's own words about why, and it is the thing staff actually want
 * when they open the queue.
 */
export function ForfeitLine({ team, note }: { team: string | null; note: string | null }) {
  if (!team) return null;
  return (
    <p className="mt-1 text-xs text-gold">
      {team} forfeited{note ? ` — ${note}` : ""}. Any games listed below were played and still count.
    </p>
  );
}
