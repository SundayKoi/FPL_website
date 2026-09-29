import Link from "next/link";
import type { Draft } from "@/lib/draft/types";
import UpcomingDraftCard from "./UpcomingDraftCard";
import styles from "./DraftDirectory.module.css";

export default function DraftDirectory({ drafts, showAdmin = false }: { drafts: Draft[]; showAdmin?: boolean }) {
  const upcomingDrafts = drafts
    .filter((draft) => draft.status === "setup" && draft.starts_at)
    .sort((left, right) => new Date(left.starts_at!).getTime() - new Date(right.starts_at!).getTime());
  const activeDrafts = drafts.filter((draft) => draft.status === "live" || draft.status === "paused");
  const setupDrafts = drafts.filter((draft) => draft.status === "setup" && !draft.starts_at);
  const completedDrafts = drafts.filter((draft) => draft.status === "complete");

  const draftList = (items: Draft[]) => (
    <ul className={styles.draftList}>
      {items.map((draft) => (
        <li key={draft.id}>
          <Link href={`/draft/${draft.id}`} className={styles.draftLink}>
            <span className={styles.draftName}>{draft.name}</span>
            <span className={styles.draftStatus} data-status={draft.status}>{draft.status}</span>
            <span className={styles.openLink}>Open board <span aria-hidden="true">→</span></span>
          </Link>
        </li>
      ))}
    </ul>
  );

  return (
    <main className={styles.page}>
      <section className={styles.content} aria-labelledby="draft-central-title">
        <header className={styles.header}>
          <div>
            <p className={styles.context}>League tools</p>
            <h1 id="draft-central-title">Auction draft</h1>
            <p className={styles.description}>Upcoming rooms, live drafts, and completed boards.</p>
          </div>
          {showAdmin ? (
            // Presentation only, like the header's Admin link: /admin
            // re-checks the staff tier. Everyone else used to see this.
            <Link
              href="/admin"
              className={styles.adminLink}
            >
              Admin settings
            </Link>
          ) : null}
        </header>

        {upcomingDrafts.length > 0 ? (
          <section aria-labelledby="upcoming-drafts-title" className={styles.section}>
            <div className={styles.sectionHeading}>
              <h2 id="upcoming-drafts-title">Upcoming</h2>
              <p>Scheduled draft rooms</p>
            </div>
            <div className={styles.upcomingGrid}>
              {upcomingDrafts.map((draft) => <UpcomingDraftCard key={draft.id} draft={draft} />)}
            </div>
          </section>
        ) : null}

        {activeDrafts.length > 0 ? (
          <section aria-labelledby="active-drafts-title" className={styles.section}>
            <div className={styles.sectionHeading}><h2 id="active-drafts-title">Active drafts</h2><p>Live and paused boards</p></div>
            {draftList(activeDrafts)}
          </section>
        ) : null}

        {setupDrafts.length > 0 ? (
          <section aria-labelledby="setup-drafts-title" className={styles.section}>
            <div className={styles.sectionHeading}><h2 id="setup-drafts-title">Setup</h2><p>Preview boards without a scheduled start</p></div>
            {draftList(setupDrafts)}
          </section>
        ) : null}

        {completedDrafts.length > 0 ? (
          <section aria-labelledby="completed-drafts-title" className={styles.section}>
            <div className={styles.sectionHeading}><h2 id="completed-drafts-title">Completed</h2><p>Past auction boards and final rosters</p></div>
            {draftList(completedDrafts)}
          </section>
        ) : null}

        {drafts.length === 0 ? <p className={styles.empty}>No drafts yet.</p> : null}
      </section>
    </main>
  );
}
