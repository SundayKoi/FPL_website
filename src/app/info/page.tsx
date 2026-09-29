import type { Metadata } from "next";
import Link from "next/link";
import AboutPageHeader from "@/components/info/AboutPageHeader";
import AboutPageShell from "@/components/info/AboutPageShell";
import { getInfoPageData } from "@/lib/info/resources";
import { DISCORD_INVITE_EXTERNAL, DISCORD_INVITE_URL } from "@/lib/site/discord";
import styles from "@/components/info/AboutPage.module.css";

export const metadata: Metadata = {
  title: "About the league — FPL",
  description: "How FPL works, how to join, and the links and guides players use.",
};

export default async function InfoPage() {
  const { resources, isAdmin } = await getInfoPageData();
  const publicResources = resources.filter((resource) => resource.slug !== "rulebook");

  return (
    <AboutPageShell activeHref="/info">
      <AboutPageHeader
        eyebrow="Franchise Premier League"
        title="About the league"
        description={
          <>
            FPL is a League of Legends draft league built around two paired competitions: Premier and Academy.
            Follow the season, meet the teams, and find the guides and resources players use.
          </>
        }
      >
        <Link href="/signup" className="btn-primary inline-flex items-center rounded-full px-5 py-3 text-sm font-semibold uppercase tracking-wide">
          Sign up
        </Link>
        {DISCORD_INVITE_EXTERNAL ? (
          <a href={DISCORD_INVITE_URL} target="_blank" rel="noopener noreferrer" className="btn-pill inline-flex items-center rounded-full px-5 py-3 text-sm font-semibold">
            Join the Discord ↗
          </a>
        ) : (
          <Link href={DISCORD_INVITE_URL} className="btn-pill inline-flex items-center rounded-full px-5 py-3 text-sm font-semibold">
            Find the Discord
          </Link>
        )}
      </AboutPageHeader>

      <section aria-labelledby="joining-title" className="max-w-3xl border-t border-border-subtle pt-6">
        <h2 id="joining-title" className="font-display text-2xl font-semibold text-white">Joining the league</h2>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-muted">
          The public sign-up form is for the current Premier player pool. It shows whether registration is open,
          and staff announce the next window in Discord. Submitting the form does not require Premium; the full
          eligibility requirements are in the official rules.
        </p>
        <p className="mt-3 text-sm leading-6">
          <Link href="/rulebook#league-overview" className="text-action-text underline underline-offset-4 hover:text-white">
            Read player eligibility and registration rules →
          </Link>
        </p>
      </section>

      <section id="league-resources" aria-labelledby="resources-title" className="mt-10 max-w-4xl scroll-mt-24 border-t border-border-subtle pt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-action-text">Player resources</p>
            <h2 id="resources-title" className="mt-2 font-display text-2xl font-semibold text-white">League resources</h2>
          </div>
          <Link href="/rulebook" className="text-sm text-action-text underline underline-offset-4 hover:text-white">
            Read the rules →
          </Link>
        </div>
        {publicResources.length ? (
          <ul className={`${styles.resourceList} mt-4`}>
            {publicResources.map((resource) => (
              <li key={resource.id} className={styles.resourceRow}>
                <div>
                  <h3 className="text-base font-semibold text-white">{resource.label}</h3>
                  <p className="mt-1 text-sm leading-6 text-muted">{resource.description}</p>
                </div>
                <a
                  href={resource.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-sm font-semibold text-action-text underline underline-offset-4 hover:text-white"
                >
                  Open ↗
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-muted">League resources are unavailable right now.</p>
        )}
        {isAdmin ? (
          <p className="mt-6 text-sm text-muted">
            <Link href="/admin/content" className="font-semibold text-action-text underline underline-offset-4">Manage these site-wide resources in Admin →</Link>
          </p>
        ) : null}
      </section>

      <section aria-labelledby="guides-title" className="mt-10 max-w-4xl border-t border-border-subtle pt-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-action-text">More to know</p>
        <h2 id="guides-title" className="mt-2 font-display text-2xl font-semibold text-white">Three useful guides</h2>
        <ul className={`${styles.guideList} mt-4`}>
          <li><Link href="/rulebook"><span>Rules</span><span>Eligibility, competition format, and the full official rulebook</span></Link></li>
          <li><Link href="/membership"><span>Membership &amp; support</span><span>What is free, what Premium opens, and what patronage supports</span></Link></li>
          <li><Link href="/economy"><span>Cards &amp; currency guide</span><span>Every way to earn or spend play money, plus card terms</span></Link></li>
        </ul>
      </section>
    </AboutPageShell>
  );
}
