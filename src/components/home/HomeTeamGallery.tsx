import Link from "next/link";
import type { TeamIdentity } from "@/lib/teams/identity";
import { teamSlug } from "@/lib/teams/teamPage";
import { teamPresentation } from "@/lib/teams/presentation";
import TeamLogo from "./TeamLogo";
import styles from "./HomeWorkspace.module.css";

export default function HomeTeamGallery({ identities }: { identities: Record<string, TeamIdentity> }) {
  const teams = Object.values(identities).sort((a, b) => a.name.localeCompare(b.name));
  return <section className={styles.galleryBand} aria-labelledby="home-team-gallery-title">
    <div className={styles.bandInner}>
      <div className={styles.bandHeading}><h2 id="home-team-gallery-title">Meet the teams</h2><Link href="/teams">View all teams →</Link></div>
      {teams.length ? <div className={styles.galleryGrid}>{teams.map((team) => {
        const presentation = teamPresentation(team.name, team);
        return <Link key={teamSlug(team.name)} href={`/teams/${teamSlug(team.name)}`} className={styles.galleryTile} style={{ backgroundColor: presentation.fill, color: presentation.foreground }}>
          <TeamLogo name={team.name} identity={team} className={styles.galleryLogo} fallbackClassName={styles.galleryFallback} />
          <strong>{team.name}</strong>
          <span aria-hidden="true">{team.abbreviation}</span>
        </Link>;
      })}</div> : <p>Teams will appear here when this season&apos;s identities are available.</p>}
    </div>
  </section>;
}
