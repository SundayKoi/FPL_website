import Link from "next/link";
import type { Announcement } from "@/lib/captain/queries";
import { formatShortDateET } from "@/lib/captain/format";

/**
 * Section 6 of the captain page: league announcements (pinned first, then
 * newest — already ordered that way by fetchAnnouncements), plus links to
 * the rulebook and schedule.
 */
export default function Announcements({ announcements }: { announcements: Announcement[] }) {
  return (
    <section className="card-brand p-5">
      <h2 className="label-dash">Announcements</h2>

      {announcements.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Nothing posted yet.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-4">
          {announcements.map((a) => (
            <li key={a.id} className="rounded border border-border-subtle/60 bg-canvas/60 p-3">
              <div className="flex flex-wrap items-center gap-2">
                {a.pinned && (
                  <span className="rounded-full bg-action-fill px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide text-white">
                    Pinned
                  </span>
                )}
                <h3 className="text-sm font-semibold text-white">{a.title}</h3>
                <span className="ml-auto text-xs text-muted">{formatShortDateET(a.created_at)}</span>
              </div>
              <p className="mt-1.5 whitespace-pre-wrap text-sm text-muted">{a.body}</p>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap gap-4 border-t border-border-subtle pt-4 text-xs font-semibold uppercase tracking-wide">
        <Link href="/info" className="text-muted hover:text-action-text">
          Rulebook →
        </Link>
        <Link href="/schedule" className="text-muted hover:text-action-text">
          Full schedule →
        </Link>
      </div>
    </section>
  );
}
