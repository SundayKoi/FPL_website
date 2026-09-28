import Link from "next/link";
import type { LeagueView } from "@/lib/league/context";
import { siteDirectory } from "@/lib/site/directory";
import type { HomeAppearance } from "./appearance";
import styles from "./HomeWorkspace.module.css";

/**
 * "Where to": every top-level destination on the site, grouped, with a line
 * each. The home page used to link to four things; the rest was behind
 * menus people did not open. This reads the same map the search palette
 * does, so a page added there is on the home page the same day.
 */
export default function SiteDirectoryGrid({ league, appearance = "legacy" }: { league: LeagueView; appearance?: HomeAppearance }) {
  const workspace = appearance === "workspace";
  const groups = siteDirectory(league);
  return (
    <section aria-labelledby="site-directory-title" className={workspace ? `${styles.panel} p-5 sm:p-6` : "card-brand p-5 sm:p-6"} data-appearance={appearance}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className={workspace ? styles.eyebrow : "label-dash"}>WHERE TO</span>
          <h2 id="site-directory-title" className={workspace ? `${styles.title} mt-2 text-3xl sm:text-4xl` : "type-display mt-2 text-3xl sm:text-4xl"}>
            Everything on the site
          </h2>
        </div>
        <p className={`max-w-sm text-sm leading-6 ${workspace ? styles.muted : "text-muted"}`}>
          Looking for someone? Press <kbd className="rounded border border-line px-1 font-mono text-xs">⌘K</kbd> anywhere, or use
          the search button in the header, to jump to a player, a team or a page.
        </p>
      </div>
      <div className={workspace ? styles.directoryGrid : "mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"}>
        {groups.map((group) => (
          <div key={group.key} className={workspace ? styles.directoryGroup : ""}>
            <h3 className={`text-xs font-bold uppercase tracking-[0.18em] ${workspace ? styles.muted : "text-steel"}`}>{group.label}</h3>
            <p className={`mt-1 text-xs leading-5 ${workspace ? styles.muted : "text-muted"}`}>{group.blurb}</p>
            <ul className="mt-3 flex flex-col gap-2">
              {group.items
                .filter((item) => !item.nested)
                .map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={workspace ? `${styles.link} text-sm` : "text-sm font-semibold text-white underline-offset-4 transition hover:text-gold hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral"}
                    >
                      {item.label}
                    </Link>
                    <span className={`block text-xs leading-5 ${workspace ? styles.muted : "text-muted"}`}>{item.blurb}</span>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
