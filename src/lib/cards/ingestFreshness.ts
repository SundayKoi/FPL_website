// Is the data Tuesday's drop reports on actually here yet?
//
// Everything the weekly drop does reads what the stats ingest wrote. Run
// the drop first and it archives an edition missing Monday night, posts
// movers against stale ratings and grades fantasy on games it cannot see —
// silently, because every one of those steps is perfectly happy with fewer
// rows than it should have had.
//
// The workflow chain (.github/workflows) makes that unlikely by running
// the drop when the ingest finishes rather than at a time it usually has.
// This makes it impossible, which is a different guarantee: a chain can be
// bypassed by a hand-run drop, and it says nothing at all to somebody
// running the script directly.
//
// Pure, so the rule can be tested without a database or a clock. The
// script does the reads and hands the answers here.

export type IngestVerdict =
  /** The week's games are in, or there were never any to wait for. */
  | { ok: true; reason: "fresh" | "no-games-played" }
  /** Played but not ingested — the one state that is genuinely wrong. */
  | { ok: false; message: string };

/**
 * @param editionWeek   The Monday the drop is about to archive.
 * @param latestWeek    Monday of the newest ingested game, or null if the
 *                      season has no ingested games at all.
 * @param fixturesPlayed How many fixtures in `editionWeek` have a score.
 *
 * A BYE WEEK IS NOT A FAILURE. With no fixture played there is nothing for
 * the ingest to have missed, and refusing on "latest week is older than
 * this one" alone would block the drop every week from then on — the
 * failure mode of a guard nobody can satisfy is that somebody turns it
 * off. So the alarm is raised on played-but-not-ingested and nothing else.
 */
export function ingestVerdict(
  editionWeek: string,
  latestWeek: string | null,
  fixturesPlayed: number,
): IngestVerdict {
  if (latestWeek === editionWeek) return { ok: true, reason: "fresh" };
  if (fixturesPlayed === 0) return { ok: true, reason: "no-games-played" };
  return {
    ok: false,
    message:
      `${fixturesPlayed} fixture${fixturesPlayed === 1 ? " was" : "s were"} played in the week of ${editionWeek}, ` +
      `but the newest ingested game is from ${latestWeek ?? "no week at all"}. ` +
      `Run "Ingest match reports" and let the chain re-run this, or set SKIP_INGEST_CHECK=true to override.`,
  };
}
