import type { Metadata } from "next";
import Link from "next/link";
import ActivePatrons from "@/components/info/ActivePatrons";
import AboutPageHeader from "@/components/info/AboutPageHeader";
import AboutPageShell from "@/components/info/AboutPageShell";
import SupportDevSection from "@/components/info/SupportDevSection";
import PatronPerks from "@/components/patron/PatronPerks";
import { fmtPoints } from "@/lib/betting/format";
import { SIGNUP_BONUS_AMOUNT } from "@/lib/betting/daily";
import { loadPremiumPaymentHref } from "@/lib/premium/preview";
import { DISCORD_INVITE_EXTERNAL, DISCORD_INVITE_URL, PATRON_PRICE_LABEL, PREMIUM_NAME, PREMIUM_PRICE_LABEL } from "@/lib/site/discord";

export const metadata: Metadata = {
  title: "Membership & support — FPL",
  description: "Understand what is free, what FPL Premium opens, and how patronage supports the league.",
};

const COMPARISON = [
  ["Follow Premier and Academy: schedule, teams, stats", "Yes", "Yes", "Yes"],
  ["Browse public cards, moments, and the Vault", "Yes", "Yes", "Yes"],
  ["Join a league player pool", "Use the signup process", "Use the signup process", "Use the signup process"],
  ["Use gated cards, wallet, betting, and games", "—", "Yes", "Yes, with the role"],
  ["Receive active Patron perks", "—", "—", "Yes, with the role"],
] as const;

export default async function MembershipPage() {
  const paymentHref = await loadPremiumPaymentHref();

  return (
    <AboutPageShell activeHref="/membership">
      <AboutPageHeader
        eyebrow="Access and support"
        title="Membership & support"
        description={
          <>
            The league and its public information are free to follow. FPL Premium opens gated site features;
            patronage is a separate way to help pay for running the site. Neither payment registers you for a league season.
          </>
        }
      >
        <Link href="/signup" className="btn-primary inline-flex items-center rounded-full px-5 py-3 text-sm font-semibold uppercase tracking-wide">
          Sign up for Premier
        </Link>
        <Link href="#membership-options" className="btn-pill inline-flex items-center rounded-full px-5 py-3 text-sm font-semibold">
          Compare access
        </Link>
      </AboutPageHeader>

      <section id="membership-options" aria-labelledby="compare-title" className="scroll-mt-24 border-t border-border-subtle pt-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-action-text">At a glance</p>
        <h2 id="compare-title" className="mt-2 font-display text-2xl font-semibold text-white">What each path includes</h2>
        <p id="compare-help" className="mt-2 text-sm leading-6 text-muted">
          Patron perks are tied to active patronage and are available inside the site when the Premium role is also present.
        </p>
        <div role="region" aria-label="Membership comparison" aria-describedby="compare-help" tabIndex={0} className="mt-4 overflow-x-auto rounded-lg border border-border-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus">
          <table className="w-full min-w-[42rem] border-collapse text-left text-sm">
            <thead className="bg-raised text-white">
              <tr>
                <th scope="col" className="w-2/5 px-4 py-3 font-semibold">I want to…</th>
                <th scope="col" className="px-4 py-3 font-semibold">Free</th>
                <th scope="col" className="px-4 py-3 font-semibold">{PREMIUM_NAME}</th>
                <th scope="col" className="px-4 py-3 font-semibold">Patron + Premium</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle text-muted">
              {COMPARISON.map(([want, free, premium, patron]) => (
                <tr key={want}>
                  <th scope="row" className="px-4 py-3 font-medium text-white">{want}</th>
                  <td className="px-4 py-3">{free}</td>
                  <td className="px-4 py-3">{premium}</td>
                  <td className="px-4 py-3">{patron}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="premium-title" className="mt-8 max-w-4xl border-t border-border-subtle pt-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-action-text">One-time role · {PREMIUM_PRICE_LABEL}</p>
        <h2 id="premium-title" className="mt-2 font-display text-2xl font-semibold text-white">{PREMIUM_NAME}</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">
          The Premium Discord role opens the cards you own, packs, trading and market features, betting, and gated games.
          A wallet starts with {fmtPoints(SIGNUP_BONUS_AMOUNT)}. The role is granted by league staff after payment and Discord membership.
        </p>
        <ol className="mt-3 flex list-decimal flex-col gap-1 pl-5 text-sm leading-6 text-muted">
          <li>Use the Premium checkout below.</li>
          <li>Join the league Discord and tell a staff member you paid so they can grant the role.</li>
          <li>Sign in here with Discord. The site checks that role when you open a gated feature.</li>
        </ol>
        <div className="mt-4 flex flex-wrap gap-2">
          <a href={paymentHref} target="_blank" rel="noopener noreferrer" className="btn-primary inline-flex items-center rounded-full px-5 py-3 text-sm font-semibold uppercase tracking-wide">
            Get {PREMIUM_NAME} · {PREMIUM_PRICE_LABEL} ↗
          </a>
          {DISCORD_INVITE_EXTERNAL ? (
            <a href={DISCORD_INVITE_URL} target="_blank" rel="noopener noreferrer" className="btn-pill inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold">Join the Discord ↗</a>
          ) : (
            <Link href={DISCORD_INVITE_URL} className="btn-pill inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold">Find the Discord</Link>
          )}
          <Link href="/login?redirect=/premium" className="btn-pill inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold">Sign in with Discord</Link>
        </div>
      </section>

      <section aria-labelledby="patron-title" className="mt-8 max-w-5xl border-t border-border-subtle pt-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gold">Monthly support · {PATRON_PRICE_LABEL}</p>
        <h2 id="patron-title" className="mt-2 font-display text-2xl font-semibold text-white">Patronage</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">
          Patronage helps cover hosting, broadcasts, and development. It does not grant the Premium role or sign you up
          for league play. The in-site patron perks below require active patron recognition and the Premium role. They
          do not change pack odds, ratings, match results, or Fantasy scoring.
        </p>
        <PatronPerks variant="full" className="mt-5" />
        <p className="mt-4 text-sm leading-6">
          <Link href="#support-devs" className="text-action-text underline underline-offset-4 hover:text-white">See developer payment options and patron instructions →</Link>
        </p>
      </section>

      <SupportDevSection className="mt-8" />
      <ActivePatrons />
    </AboutPageShell>
  );
}
