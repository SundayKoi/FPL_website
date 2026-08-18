// Shared status badge + fixture chips for report rows — rendered identically
// by ReportBox's "My reports" list and AdminReportsQueue.

const STATUS_STYLES: Record<string, string> = {
  pending: "border-steel/50 text-steel",
  ingested: "border-mint/50 text-mint",
  needs_sides: "border-amber-400/60 text-amber-300",
  needs_side: "border-amber-400/60 text-amber-300",
  failed: "border-red-400/60 text-red-400",
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
 * has reached `ingested`. The fixture's own score is the source of truth
 * on /schedule; this is just an indicator, no extra fetch needed here.
 */
export function FixtureChips({ fixtureId, status }: { fixtureId: string | null; status: string }) {
  if (!fixtureId) return null;
  return (
    <>
      <span className="rounded-full border border-steel/50 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-steel">
        Schedule
      </span>
      {status === "ingested" && (
        <span className="rounded-full border border-mint/50 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-mint">
          Synced
        </span>
      )}
    </>
  );
}
