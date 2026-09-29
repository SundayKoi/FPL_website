import Link from "next/link";
import type { ReactNode } from "react";
import { ABOUT_DESTINATIONS, type AboutDestinationHref } from "@/lib/site/about";
import AboutAnchorScroll from "./AboutAnchorScroll";
import styles from "./AboutPage.module.css";

export default function AboutPageShell({
  activeHref,
  children,
}: {
  activeHref: AboutDestinationHref;
  children: ReactNode;
}) {
  return (
    <main className={styles.page}>
      <AboutAnchorScroll />
      <div className={styles.container}>
        <nav aria-label="About sections" className={styles.sectionNav}>
          {ABOUT_DESTINATIONS.map(({ href, label }) => {
            const active = href === activeHref;
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={active ? styles.activeSection : undefined}
              >
                {label}
              </Link>
            );
          })}
        </nav>
        {children}
      </div>
    </main>
  );
}
