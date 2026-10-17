// The homepage's way into the offseason tournament while it runs: a band in
// the dashboard homepages, a panel in the preseason one. It hides itself once
// the event is complete (fetchHomeOffseasonEvent).

import Link from "next/link";
import home from "@/components/home/HomeWorkspace.module.css";
import type { HomeOffseasonEvent } from "@/lib/offseason/home";
import { STATUS_LABELS } from "@/lib/offseason/types";
import styles from "./HomeBanner.module.css";

/** What the event needs from visitors right now, and the second door for it. */
function pitch(event: HomeOffseasonEvent): { text: string; second: { href: string; label: string } | null } {
  if (event.status === "signups") {
    return event.signups_open
      ? { text: "Sign-ups are open: one pool for every rank, Premier and Academy alike.", second: { href: "/offseason/signup", label: "Sign up" } }
      : { text: "Sign-ups are closed. In the player pool? Lock in your role.", second: null };
  }
  return {
    text: event.status === "finals" ? "The finals are on." : "New captains draft new teams every week.",
    second: { href: "/offseason/schedule", label: "Schedule" },
  };
}

export default function OffseasonHomeBanner({ event, layout }: { event: HomeOffseasonEvent | null; layout: "band" | "panel" }) {
  if (!event) return null;
  const { text, second } = pitch(event);
  const body = (
    <>
      <div className="min-w-0">
        <span className={home.eyebrow}>Offseason tournament · {STATUS_LABELS[event.status]}</span>
        <h2 id="home-offseason-title" className={`${home.title} mt-2 text-3xl sm:text-4xl`}>
          {event.name}
        </h2>
        <p className={`mt-2 max-w-2xl text-sm leading-6 ${home.muted}`}>{text}</p>
      </div>
      <div className={styles.actions}>
        <Link href="/offseason" className={styles.primary}>
          Go to the offseason →
        </Link>
        {second ? (
          <Link href={second.href} className={styles.secondary}>
            {second.label}
          </Link>
        ) : null}
      </div>
    </>
  );

  return layout === "band" ? (
    <section aria-labelledby="home-offseason-title" className={styles.band}>
      <div className={`${home.bandInner} ${styles.inner}`} data-page-container>
        {body}
      </div>
    </section>
  ) : (
    <section aria-labelledby="home-offseason-title" className={`${styles.panel} ${styles.inner}`}>
      {body}
    </section>
  );
}
