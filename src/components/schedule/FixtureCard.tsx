import Link from "next/link";
import { formatKickoff, hasResult, teamLabel } from "@/lib/schedule/format";
import { teamSlug } from "@/lib/teams/teamPage";
import type { TeamIdentity } from "@/lib/teams/identity";
import type { FixtureRow } from "@/lib/schedule/types";

function divisionChipClass(division: FixtureRow["division"]): string {
  switch (division) {
    case "Solari":
      return "border-prestige/50 bg-prestige/10 text-prestige";
    case "Lunari":
      return "border-muted/50 bg-muted/10 text-muted";
    default:
      return "border-border bg-surface text-muted";
  }
}

/** Crest and short name. The full name is the accessible label, so screen
 *  readers and hover still get it while the row stays compact. */
function TeamCrest({
  name,
  identity,
  align,
  highlight,
  basePath,
}: {
  name: string;
  identity?: TeamIdentity;
  align: "left" | "right";
  highlight: boolean;
  /** Team-page root, or null to render unlinked — /teams/[slug] resolves the
   *  Premier draft only, so Academy crests would 404. */
  basePath: string | null;
}) {
  const unknown = name === "TBD";
  const short = identity?.abbreviation ?? name;
  const body = (
    <>
      {identity?.imageUrl ? (
        // Supabase Storage hosts vary per deployment, which makes next/image
        // remotePatterns brittle here.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={identity.imageUrl} alt="" className="h-7 w-7 shrink-0 rounded object-contain" />
      ) : null}
      <span className="truncate font-display text-base font-semibold not-italic">{short}</span>
    </>
  );

  const layout = `flex min-w-0 items-center gap-2 ${
    align === "right" ? "flex-row-reverse text-right" : "text-left"
  } ${highlight ? "text-prestige" : unknown ? "text-muted/70" : "text-white"}`;

  if (unknown || basePath === null) return <span className={layout} title={unknown ? undefined : name}>{body}</span>;
  return (
    <Link
      href={`${basePath}/${teamSlug(name)}`}
      title={name}
      aria-label={name}
      className={`${layout} underline-offset-4 hover:text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary`}
    >
      {body}
    </Link>
  );
}

export default function FixtureCard({
  fixture,
  draftedFixtureIds,
  identities = {},
  teamBasePath = "/teams",
}: {
  fixture: FixtureRow;
  /** Fixture ids the site drafter actually recorded a pick/ban phase for.
   *  Gating on "played" instead sent people to an empty section: a game
   *  drafted in the client, or played before this drafter existed, has no
   *  match_drafts row and nothing to show. */
  draftedFixtureIds?: ReadonlySet<string>;
  identities?: Record<string, TeamIdentity>;
  /** Where a crest links. Pass null for Academy: /teams/[slug] resolves the
   *  Premier draft only, so those links would 404. */
  teamBasePath?: string | null;
}) {
  const played = hasResult(fixture);
  const teamA = teamLabel(fixture.team_a);
  const teamB = teamLabel(fixture.team_b);
  const aWon = played && fixture.score_a! > fixture.score_b!;
  const bWon = played && fixture.score_b! > fixture.score_a!;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/60 px-4 py-3 first:border-t-0">
      <span
        className={`inline-flex w-16 shrink-0 justify-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${divisionChipClass(fixture.division)}`}
      >
        {fixture.division ?? "Cross"}
      </span>

      {/* Its own line below the meta on narrow screens. Sharing a row is what
          squeezed the matchup to zero width and hid it entirely on mobile. */}
      <div className="order-last flex w-full min-w-0 items-center justify-center gap-3 text-sm sm:order-none sm:w-auto sm:flex-1">
        <div className="flex min-w-0 flex-1 justify-end">
          <TeamCrest name={teamA} identity={identities[teamSlug(teamA)]} align="right" highlight={aWon} basePath={teamBasePath} />
        </div>
        {played ? (
          <Link
            href={`/match/${fixture.id}`}
            aria-label={`Post-game for ${teamA} versus ${teamB}`}
            className="shrink-0 rounded border border-border bg-canvas px-2 py-0.5 font-bold text-white hover:border-primary hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {fixture.score_a}–{fixture.score_b}
          </Link>
        ) : (
          <span className="shrink-0 text-xs font-semibold uppercase text-muted">vs</span>
        )}
        <div className="flex min-w-0 flex-1 justify-start">
          <TeamCrest name={teamB} identity={identities[teamSlug(teamB)]} align="left" highlight={bWon} basePath={teamBasePath} />
        </div>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-2 text-xs text-muted">
        {/* The pick/ban phase was only reachable by guessing that the SCORE
            was a link to a page that happened to contain it. People asking
            "where can I see the draft" were not going to find that. */}
        {draftedFixtureIds?.has(fixture.id) ? (
          <Link
            href={`/match/${fixture.id}#draft`}
            className="rounded-full border border-border bg-surface px-2 py-0.5 font-semibold uppercase hover:border-primary hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            Draft
          </Link>
        ) : null}
        <span className="rounded-full border border-border bg-surface px-2 py-0.5 font-semibold uppercase">
          Bo{fixture.best_of}
        </span>
        <span className="whitespace-nowrap">{formatKickoff(fixture.scheduled_at)}</span>
      </div>
    </div>
  );
}
