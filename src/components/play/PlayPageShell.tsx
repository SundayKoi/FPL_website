import type { ReactNode } from "react";
import Link from "next/link";
import type { LeagueView } from "@/lib/league/context";
import { getPlayDestinations, type PlayDestinationKey } from "@/lib/play/destinations";
import styles from "./PlayPageShell.module.css";

export default function PlayPageShell({
  children,
  league,
  active,
  isAdmin = false,
}: {
  children: ReactNode;
  league: LeagueView;
  active?: PlayDestinationKey;
  isAdmin?: boolean;
}) {
  const destinations = getPlayDestinations(league, isAdmin);

  return (
    <div className={styles.page} data-league={league} data-play-shell>
      <nav className={styles.sectionNav} aria-label="Play destinations">
        <div className={styles.sectionNavInner}>
          {destinations.map((destination) => (
            <Link
              key={destination.key}
              href={destination.href}
              aria-current={active === destination.key ? "page" : undefined}
              className={styles.sectionLink}
            >
              <span>{destination.label}</span>
              {destination.badge ? <span className={styles.badge}>{destination.badge}</span> : null}
            </Link>
          ))}
        </div>
      </nav>
      {children}
    </div>
  );
}
