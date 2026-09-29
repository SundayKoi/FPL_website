"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./BettingSectionNav.module.css";

const sections = [
  { label: "Events", href: "/betting" },
  { label: "Leaderboard", href: "/betting/leaderboard" },
  { label: "Profile", href: "/betting/profile" },
] as const;

export default function BettingSectionNav() {
  const pathname = usePathname() ?? "/betting";
  const active = pathname.startsWith("/betting/leaderboard")
    ? "/betting/leaderboard"
    : pathname.startsWith("/betting/profile")
      ? "/betting/profile"
      : "/betting";

  return (
    <nav className={styles.nav} aria-label="Betting sections">
      {sections.map((section) => (
        <Link
          key={section.href}
          href={section.href}
          aria-current={section.href === active ? "page" : undefined}
          className={styles.link}
        >
          {section.label}
        </Link>
      ))}
    </nav>
  );
}
