import LeaguePageShell, { type LeagueSection } from "@/components/league/LeaguePageShell";
import type { LeagueView } from "@/lib/league/context";
import styles from "./LeaguePageLoading.module.css";

export default function LeaguePageLoading({
  league,
  title,
  activeSection,
}: {
  league: LeagueView;
  title: string;
  activeSection?: LeagueSection;
}) {
  return (
    <LeaguePageShell
      league={league}
      title={title}
      activeSection={activeSection}
    >
      <section className={styles.loading} aria-busy="true" aria-label={`Loading ${title.toLowerCase()}`}>
        <p className={styles.status} role="status">Loading {title.toLowerCase()}…</p>
        <div className={styles.rows} aria-hidden="true">
          <div className={styles.row} />
          <div className={styles.row} />
          <div className={styles.row} />
        </div>
      </section>
    </LeaguePageShell>
  );
}
