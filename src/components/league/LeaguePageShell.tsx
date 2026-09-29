import type { ReactNode } from "react";
import Link from "next/link";
import type { LeagueView } from "@/lib/league/context";
import { leaguePath, type LeaguePage } from "@/lib/league/links";
import styles from "./LeaguePageShell.module.css";

export type LeagueSection = "schedule" | "standings" | "teams" | "players" | "stats";

const SECTIONS: readonly { key: LeagueSection; label: string; page: LeaguePage }[] = [
  { key: "schedule", label: "Schedule", page: "schedule" },
  { key: "standings", label: "Standings", page: "standings" },
  { key: "teams", label: "Teams", page: "teams" },
  { key: "players", label: "Players", page: "players" },
  { key: "stats", label: "Stats", page: "stats" },
];

export function LeagueSectionNav({
  league,
  activeSection,
  hrefOverrides = {},
}: {
  league: LeagueView;
  activeSection?: LeagueSection;
  hrefOverrides?: Partial<Record<LeagueSection, string>>;
}) {
  return (
    <nav className={styles.sectionNav} aria-label={`${league === "academy" ? "Academy" : "Premier"} league sections`}>
      <div className={styles.sectionNavInner}>
        {SECTIONS.map(({ key, label, page }) => (
          <Link
            key={key}
            href={hrefOverrides[key] ?? leaguePath(page, league)}
            aria-current={activeSection === key ? "page" : undefined}
            className={styles.sectionLink}
          >
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

export function LeagueToolbar({
  children,
  label,
  className = "",
}: {
  children: ReactNode;
  label: string;
  className?: string;
}) {
  return (
    <section aria-label={label} className={`${styles.toolbar} ${className}`}>
      {children}
    </section>
  );
}

export function LeagueEmptyState({
  title,
  children,
  action,
  tone = "empty",
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  tone?: "empty" | "error" | "permission";
}) {
  return (
    <section className={`${styles.emptyState} ${tone === "error" ? styles.errorState : ""}`} aria-label={title}>
      <h2 className={styles.emptyTitle}>{title}</h2>
      <div className={styles.emptyCopy}>{children}</div>
      {action ? <div className={styles.emptyAction}>{action}</div> : null}
    </section>
  );
}

export default function LeaguePageShell({
  league,
  title,
  season,
  description,
  activeSection,
  hrefOverrides,
  headerActions,
  children,
}: {
  league: LeagueView;
  title: string;
  season?: string | null;
  description?: string;
  activeSection?: LeagueSection;
  hrefOverrides?: Partial<Record<LeagueSection, string>>;
  headerActions?: ReactNode;
  children: ReactNode;
}) {
  const leagueName = league === "academy" ? "FPL Academy" : "Franchise Premier League";

  return (
    <main className={styles.page} data-league={league}>
      <div className={styles.container} data-page-container>
        <header className={styles.header}>
          <div className={styles.headerCopy}>
            <p className={styles.context}>
              {leagueName}{season ? <span> · {season}</span> : null}
            </p>
            <h1 className={styles.title}>{title}</h1>
            {description ? <p className={styles.description}>{description}</p> : null}
          </div>
          {headerActions ? <div className={styles.headerActions}>{headerActions}</div> : null}
        </header>
        <LeagueSectionNav league={league} activeSection={activeSection} hrefOverrides={hrefOverrides} />
        <div className={styles.content}>{children}</div>
      </div>
    </main>
  );
}
