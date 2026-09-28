import Link from "next/link";
import { formatKickoff, hasResult, teamLabel } from "@/lib/schedule/format";
import { teamSlug } from "@/lib/teams/teamPage";
import type { FixtureRow } from "@/lib/schedule/types";
import type { TeamIdentity } from "@/lib/teams/identity";
import type { TwitchStreamState } from "@/lib/twitch/status";
import styles from "./HomeWorkspace.module.css";
import TeamLogo from "./TeamLogo";

function TeamMark({ name, identity }: { name: string; identity?: TeamIdentity }) {
  return (
    <span className={styles.stripTeam}>
      <TeamLogo name={name} identity={identity} className={styles.stripLogo} fallbackClassName={styles.stripLogoFallback} />
      <span className={styles.stripAbbr}>{identity?.abbreviation ?? (name === "TBD" ? "TBD" : name.slice(0, 3).toUpperCase())}</span>
    </span>
  );
}

function fixtureDestination(fixture: FixtureRow, scheduleHref: string): string {
  return hasResult(fixture) ? `/match/${fixture.id}` : scheduleHref;
}

export default function HomeMatchStrip({
  fixtures,
  identities,
  season,
  scheduleHref,
  channelState,
  title,
}: {
  fixtures: FixtureRow[];
  identities: Record<string, TeamIdentity>;
  season: string | null;
  scheduleHref: string;
  channelState?: TwitchStreamState;
  /** Lower page variant; the strip directly below the masthead stays unlabeled visually. */
  title?: string;
}) {
  if (fixtures.length === 0 && !title) {
    return (
      <section className={styles.fixtureStrip} aria-label="Current season fixtures">
        <strong className={styles.stripHeading}>Upcoming matches</strong>
        <span className={`${styles.channelStatus} ${channelState === "live" ? styles.channelLive : ""}`}>
          {channelState === "live" ? "Broadcast live" : channelState === "offline" ? "Broadcast offline" : "Broadcast status unknown"}
        </span>
        <span className={styles.stripEmpty}>No upcoming fixtures are listed.</span>
        <span className={styles.stripSeason}>{season ?? "Season TBD"}</span>
        <Link className={styles.stripMore} href={scheduleHref}>Full schedule <span aria-hidden>→</span></Link>
      </section>
    );
  }
  if (fixtures.length === 0) return null;

  return (
    <section className={title ? styles.matchCenter : styles.fixtureStrip} aria-label={title ?? "Current season fixtures"}>
      {title ? <h2 className={styles.matchCenterTitle}>{title}</h2> : null}
      {!title ? <strong className={styles.stripHeading}>Upcoming matches</strong> : null}
      {!title ? (
        <span className={`${styles.channelStatus} ${channelState === "live" ? styles.channelLive : ""}`}>
          {channelState === "live" ? "Broadcast live" : channelState === "offline" ? "Broadcast offline" : "Broadcast status unknown"}
        </span>
      ) : null}
      <div className={styles.stripItems}>
        {fixtures.map((fixture) => {
          const teamA = teamLabel(fixture.team_a);
          const teamB = teamLabel(fixture.team_b);
          const played = hasResult(fixture);
          const status = played ? "Final" : formatKickoff(fixture.scheduled_at);
          const label = `${teamA} ${played ? `finished ${fixture.score_a} to ${fixture.score_b} against` : "versus"} ${teamB}; ${status}; best of ${fixture.best_of}`;
          return (
            <Link key={fixture.id} href={fixtureDestination(fixture, scheduleHref)} className={styles.stripFixture} aria-label={label}>
              <span className={styles.stripMatchup}>
                <TeamMark name={teamA} identity={identities[teamSlug(teamA)]} />
                <span className={styles.stripScore}>
                  {played ? `${fixture.score_a}–${fixture.score_b}` : "vs"}
                </span>
                <TeamMark name={teamB} identity={identities[teamSlug(teamB)]} />
              </span>
              <span className={styles.stripFixtureMeta}>
                {status} <span aria-hidden>·</span> Bo{fixture.best_of}
              </span>
            </Link>
          );
        })}
      </div>
      {!title ? <span className={styles.stripSeason}>{season ?? "Season TBD"}</span> : null}
      <Link className={styles.stripMore} href={scheduleHref}>Full schedule <span aria-hidden>→</span></Link>
    </section>
  );
}
