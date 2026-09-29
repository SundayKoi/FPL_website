"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { seasonBelongsToLeague } from "@/lib/league/season";
import { ADMIN_NAVIGATION, adminNavigationItemIsActive, type AdminNavigationItem } from "@/lib/admin/navigation";
import styles from "./AdminWorkspace.module.css";

type Props = { isAdmin: boolean; isOwner: boolean; isBroadcaster: boolean };

function hrefWithContext(item: AdminNavigationItem, query: string) {
  const params = new URLSearchParams();
  const current = new URLSearchParams(query);
  const league = current.get("league");
  const season = current.get("season");

  if ((item.context === "league-season" || item.context === "league") && (league === "premier" || league === "academy")) {
    params.set("league", league);
    if (
      item.context === "league-season" &&
      season &&
      /^[SA]\d{1,3}$/i.test(season) &&
      seasonBelongsToLeague(season, league)
    ) {
      params.set("season", season);
    }
  }

  const serialized = params.toString();
  return serialized ? `${item.href}?${serialized}` : item.href;
}

export default function AdminNavigation({ isAdmin, isOwner, isBroadcaster }: Props) {
  const pathname = usePathname() ?? "/admin";
  const searchParams = useSearchParams();
  const query = searchParams?.toString() ?? "";
  const isStaff = isAdmin || isOwner || isBroadcaster;

  if (!isStaff) {
    return (
      <nav className={styles.captainNav} aria-label="Return from claims">
        <Link href="/cards">← Cards</Link>
        <Link href="/identity-claims">Roster identity claims</Link>
      </nav>
    );
  }

  const groups = ADMIN_NAVIGATION.map((group) => ({
    ...group,
    items: group.items.filter((item) => {
      if (item.access === "owner") return isOwner;
      if (item.access === "admin") return isAdmin;
      if (item.access === "admin-or-owner") return isAdmin || isOwner;
      if (item.access === "broadcaster") return isAdmin || isOwner || isBroadcaster;
      return true;
    }),
  })).filter((group) => group.items.length > 0);

  const links = (compact = false) => (
    <nav aria-label="Admin workspace" className={compact ? styles.mobileNavLinks : styles.navGroups}>
      {groups.map((group) => (
        <div className={styles.navGroup} key={group.label}>
          <h2 className={styles.navHeading}>{group.label}</h2>
          {group.items.map((item) => {
            const active = adminNavigationItemIsActive(pathname, item);
            return (
              <Link
                key={item.href}
                href={hrefWithContext(item, query)}
                aria-current={active ? "page" : undefined}
                className={`${styles.navLink} ${active ? styles.navLinkActive : ""}`}
                onClick={(event) => {
                  if (!compact) return;
                  const details = event.currentTarget.closest("details");
                  if (details) details.open = false;
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );

  return (
    <>
      <aside className={styles.sidebar} aria-label="Admin workspace navigation">
        <div className={styles.sidebarTitle}>Admin workspace</div>
        {links()}
      </aside>
      <details className={styles.mobileMenu}>
        <summary>Admin workspace <span aria-hidden="true">⌄</span></summary>
        {links(true)}
      </details>
    </>
  );
}
