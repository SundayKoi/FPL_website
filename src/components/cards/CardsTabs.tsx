"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import BalanceChip from "@/components/BalanceChip";
import type { CardLeague } from "@/lib/cards/queries";
import { activeCardsSection, cardsSections } from "@/lib/cards/sections";
import styles from "./CardsTabs.module.css";

const BASES: Record<CardLeague, string> = { premier: "/cards", academy: "/academy/cards" };

function Badge({ count, label }: { count: number; label: string }) {
  if (count <= 0) return null;
  return (
    <span aria-label={count + " " + label} className={styles.badge}>
      {count > 9 ? "9+" : count}
    </span>
  );
}

export default function CardsTabs({
  league,
  balance = null,
  offers = 0,
  forks = 0,
}: {
  league: CardLeague;
  /** The viewer's betting dollars, or null when signed out. */
  balance?: number | null;
  /** Trade offers waiting on the viewer. */
  offers?: number;
  /** Expedition forks waiting on the viewer. */
  forks?: number;
}) {
  const pathname = usePathname() ?? BASES[league];
  const [hash, setHash] = useState("");
  useEffect(() => {
    const syncHash = () => setHash(window.location.hash);
    syncHash();
    window.addEventListener("hashchange", syncHash);
    window.addEventListener("popstate", syncHash);
    return () => {
      window.removeEventListener("hashchange", syncHash);
      window.removeEventListener("popstate", syncHash);
    };
  }, [pathname]);
  const base = BASES[league];
  const sections = cardsSections(base);
  const { section: active, child: activeChild } = activeCardsSection(sections, pathname);

  return (
    <nav aria-label="Cards" className={styles.navigation} data-league={league}>
      <div className={styles.row}>
        <ul className={styles.list}>
          {sections.map((section) => {
            const current = active?.key === section.key;
            return (
              <li key={section.key}>
                <Link
                  href={section.href}
                  aria-current={current ? "page" : undefined}
                  title={section.blurb}
                  className={styles.link}
                >
                  {section.label}
                  {section.key === "market" ? <Badge count={offers} label="trade offers waiting" /> : null}
                  {section.key === "play" ? <Badge count={forks} label="expedition forks waiting" /> : null}
                </Link>
              </li>
            );
          })}
        </ul>
        {balance !== null ? (
          <div className={styles.balance}>
            <BalanceChip balance={balance} className={styles.balanceLink} testId="cards-balance" />
          </div>
        ) : null}
      </div>
      {active?.children ? (
        <div className={styles.subNavigation}>
          <div className={styles.subRow}>
            <ul className={styles.subList}>
              {active.children.map((child) => {
                const fragment = child.href.includes("#") ? "#" + child.href.split("#")[1] : "";
                const current = fragment
                  ? pathname === child.href.split("#")[0] && hash === fragment
                  : activeChild?.href === child.href && hash === "";
                return (
                  <li key={child.href}>
                    <Link
                      href={child.href}
                      onClick={() => {
                        if (fragment) setHash(fragment);
                      }}
                      aria-current={current ? (fragment ? "location" : "page") : undefined}
                      title={child.blurb}
                      className={styles.subLink}
                    >
                      {child.label}
                      {child.href.endsWith("/trades") ? <Badge count={offers} label="trade offers waiting" /> : null}
                      {child.href.endsWith("/expeditions") ? <Badge count={forks} label="expedition forks waiting" /> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      ) : null}
    </nav>
  );
}
