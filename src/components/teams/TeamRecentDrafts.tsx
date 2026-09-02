import Link from "next/link";
import { ChampionIcon } from "@/components/matches/MatchDraftSummary";

/** One drafted series from this team's perspective — game 1's picks and
 *  bans as champion chips, linking to the match page. */
export interface TeamDraftRow {
  fixtureId: string;
  opponent: string;
  /** null = played but result unknown (e.g. draft done, score unreported). */
  won: boolean | null;
  score: string | null;
  stageLabel: string;
  picks: (string | null)[];
  /** Per-side pick number for each entry of `picks`, aligned by index. */
  pickNumbers: (number | null)[];
  bans: (string | null)[];
  /** True when role metadata is available for the pick-order chips. */
  confirmed: boolean;
}

/**
 * "Recent drafts" module for team pages: what this team locked in over its
 * last few series, straight from the site drafter's records. Scouting at a
 * glance — each row links to the full match page.
 */
export default function TeamRecentDrafts({ rows }: { rows: TeamDraftRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section aria-labelledby="recent-drafts-heading" className="card-brand overflow-hidden">
      <h2 id="recent-drafts-heading" className="border-b border-border px-4 py-3 type-display text-xl">
        Recent drafts
      </h2>
      <ul className="divide-y divide-border/60">
        {rows.map((row) => (
          <li key={row.fixtureId} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
            <span
              className={`w-14 shrink-0 rounded py-0.5 text-center font-display text-xs font-bold not-italic ${
                row.won === null
                  ? "border border-border text-muted"
                  : row.won
                    ? "border border-success/40 bg-success/15 text-success"
                    : "border border-red-400/35 bg-red-500/10 text-red-400"
              }`}
            >
              {row.won === null ? "–" : row.won ? "W" : "L"}
              {row.score ? ` ${row.score}` : ""}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="text-sm">
                vs <span className="font-semibold text-white">{row.opponent}</span>
                <span className="ml-2 font-mono text-[11px] text-muted">
                  {row.stageLabel}
                  {row.confirmed ? " · roles confirmed" : " · draft order"}
                </span>
              </span>
              <span className="flex flex-wrap items-center gap-1.5" aria-label="Game one picks and bans">
                {row.picks.map((champion, index) => (
                  <span key={`pick-${index}`} className="relative inline-flex">
                    <ChampionIcon name={champion} size="h-7 w-7" />
                    {row.pickNumbers[index] ? (
                      <span
                        aria-hidden
                        title={`Pick ${row.pickNumbers[index]}`}
                        className="absolute -left-1 -top-1 rounded-full border border-border/70 bg-canvas px-1 text-[8px] font-bold leading-4 text-muted"
                      >
                        {row.pickNumbers[index]}
                      </span>
                    ) : null}
                  </span>
                ))}
                <span aria-hidden className="mx-1 h-5 w-px bg-border" />
                {row.bans.map((champion, index) => (
                  <ChampionIcon key={`ban-${index}`} name={champion} banned size="h-6 w-6" />
                ))}
              </span>
            </div>
            <Link
              href={`/match/${row.fixtureId}`}
              className="text-xs font-semibold uppercase tracking-wide text-primary underline-offset-4 hover:underline"
            >
              Match →
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
