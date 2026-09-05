import Link from "next/link";
import { matchDraftHref } from "@/lib/match-draft/rules";
import { formatKickoff, stageMeta } from "@/lib/schedule/format";
import type { FixtureRow } from "@/lib/schedule/types";

const LINK_CLASS = "inline-flex rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

export function MyTeamMatchHero({
  fixture,
  myTeamName,
  canOpenCaptainDraft,
}: {
  fixture: FixtureRow | null;
  myTeamName: string;
  canOpenCaptainDraft: boolean;
}) {
  if (!fixture) {
    return (
      <section className="card-brand p-5" aria-label="Next match">
        <p className="label-dash">Next match</p>
        <h2 className="mt-2 type-display text-2xl">No upcoming match scheduled.</h2>
        <p className="mt-2 text-sm text-muted">The next fixture will appear here when it is posted.</p>
      </section>
    );
  }

  const isTeamA = (fixture.team_a ?? "").trim().toLowerCase() === myTeamName.trim().toLowerCase();
  const opponent = ((isTeamA ? fixture.team_b : fixture.team_a) ?? "").trim() || "TBD";
  const meta = stageMeta(fixture.stage);

  return (
    <section className="card-brand p-5" aria-label="Next match">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="label-dash">Next match</p>
          <h2 className="mt-2 type-display text-3xl sm:text-4xl">{myTeamName} <span className="text-muted">vs</span> {opponent}</h2>
        </div>
        <span className="rounded-full border border-border-subtle bg-surface px-2.5 py-1 font-mono text-xs font-semibold uppercase tracking-wide text-muted">Bo{fixture.best_of}</span>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
        <span>{formatKickoff(fixture.scheduled_at)}</span>
        <span aria-hidden="true">·</span>
        <span>{meta.label}</span>
        {fixture.division ? <><span aria-hidden="true">·</span><span>{fixture.division} division</span></> : null}
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        {canOpenCaptainDraft ? (
          <Link href={`${matchDraftHref(fixture)}?layout=board`} className={`${LINK_CLASS} border-action-text/60 text-action-text hover:bg-action-fill hover:text-white`}>
            Open captain draft link →
          </Link>
        ) : null}
        <Link href={`${matchDraftHref(fixture)}?layout=stage`} className={`${LINK_CLASS} border-border-strong text-muted hover:border-action-text hover:text-action-text`}>
          Open spectator draft link →
        </Link>
      </div>
    </section>
  );
}
