import type { Metadata } from "next";
import Link from "next/link";
import PatronPerks from "@/components/patron/PatronPerks";
import { fmtPoints } from "@/lib/betting/format";
import { SIGNUP_BONUS_AMOUNT } from "@/lib/betting/daily";
import { PATRON_PAYPAL_HREF, PATRON_VENMO_LINKS } from "@/lib/patron/links";
import { loadPremiumPaymentHref } from "@/lib/premium/preview";
import { DISCORD_INVITE_EXTERNAL, DISCORD_INVITE_URL, PATRON_PRICE_LABEL, PREMIUM_NAME, PREMIUM_PRICE_LABEL } from "@/lib/site/discord";

export const metadata: Metadata = {
  title: "Premium and Patron — FPL",
  description: "The two ways to pay for FPL, side by side: what each costs, what each gets you, and how to get it.",
};

const PREMIUM_GETS = [
  { title: "Cards", detail: "Claim your own card, open packs, build a collection, trade and sell on the Market." },
  { title: "Betting", detail: `A wallet with ${fmtPoints(SIGNUP_BONUS_AMOUNT)} to start, markets on every game, pick'em, and the leaderboard.` },
  { title: "The games", detail: "FPL'dle and Higher or Lower every day, Fantasy every week, the Gauntlet, Showdown and Expeditions." },
  { title: "The Daily Stu", detail: "Rate the league's hottest take, once a day, for betting dollars." },
  { title: "Match Drafter", detail: "A private pick / ban lobby for scrims and customs." },
] as const;

/**
 * Premium and Patron are two different products that were sold on
 * different pages under different names with nothing saying they differ:
 * a one-off Discord role, and a monthly patronage. This is the one page
 * that puts them side by side. Public, and linked from the Info menu,
 * because it is where a visitor looks for "how do I get in".
 */
export default async function MembershipPage() {
  const paymentHref = await loadPremiumPaymentHref();
  return (
    <main className="page-backdrop mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 px-4 py-12 text-white sm:px-6">
      <header className="max-w-3xl">
        <span className="label-dash">How to be part of it</span>
        <h1 className="type-display mt-3 text-5xl sm:text-6xl">Premium and Patron</h1>
        <hr className="accent-rule mt-5 w-48 sm:w-64" />
        <p className="mt-4 text-lg leading-8 text-muted">
          Two different things. <strong className="text-white">{PREMIUM_NAME}</strong> is a one-off {PREMIUM_PRICE_LABEL} for the
          Discord role that opens the cards, the betting and the games. <strong className="text-white">Patronage</strong> is{" "}
          {PATRON_PRICE_LABEL} that keeps the site running, and lights a flame on everything you own. You can have either,
          both, or neither — the league itself, the schedule, the stats and every card are free to look at.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="premium-title" className="card-brand flex flex-col gap-5 p-5 sm:p-7">
          <div>
            <span className="label-dash">One-off · {PREMIUM_PRICE_LABEL}</span>
            <h2 id="premium-title" className="type-display mt-2 text-3xl sm:text-4xl">{PREMIUM_NAME}</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              A Discord role. It is what every wall on the site is checking for, and it opens all of this:
            </p>
          </div>
          <ul className="flex flex-col gap-2 text-sm leading-6 text-muted">
            {PREMIUM_GETS.map((item) => (
              <li key={item.title}>
                <span className="font-semibold text-white">{item.title}</span> — {item.detail}
              </li>
            ))}
          </ul>
          <div>
            <span className="label-dash">How to get it</span>
            <ol className="mt-2 flex list-decimal flex-col gap-1.5 pl-5 text-sm leading-6 text-muted">
              <li>Pay {PREMIUM_PRICE_LABEL} — the button below.</li>
              <li>Join the league Discord if you haven&apos;t, and tell a staff member you paid. They give you the role.</li>
              <li>Sign in here with Discord. The site checks for the role every time you open something premium.</li>
            </ol>
          </div>
          <div className="flex flex-wrap gap-3">
            <a href={paymentHref} target="_blank" rel="noopener noreferrer" className="btn-primary inline-flex items-center px-5 py-3 text-sm uppercase tracking-wide">
              Get {PREMIUM_NAME} — {PREMIUM_PRICE_LABEL} ↗
            </a>
            {DISCORD_INVITE_EXTERNAL ? (
              <a href={DISCORD_INVITE_URL} target="_blank" rel="noopener noreferrer" className="btn-pill inline-flex items-center text-sm">
                Join the Discord ↗
              </a>
            ) : (
              <Link href={DISCORD_INVITE_URL} className="btn-pill inline-flex items-center text-sm">
                Find the Discord
              </Link>
            )}
            <Link href="/login?redirect=/premium" className="btn-pill inline-flex items-center text-sm">
              Sign in with Discord
            </Link>
          </div>
          <p className="text-xs leading-5 text-muted">
            Already had it and lost it? Your cards, wallet and binder are all still there. Get the role back and they
            are yours again the moment you sign in.
          </p>
        </section>

        <section aria-labelledby="patron-title" className="card-brand flex flex-col gap-5 border-gold/30 p-5 sm:p-7">
          <div>
            <span className="label-dash text-gold">Monthly · {PATRON_PRICE_LABEL}</span>
            <h2 id="patron-title" className="type-display mt-2 text-3xl sm:text-4xl">Patron</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Patrons cover what the league costs to run — hosting, the tools, the broadcasts. It is on top of{" "}
              {PREMIUM_NAME}, not instead of it: the perks decorate cards and boost recurring rewards, and every one
              of them needs the role to show. Nothing a patron pays for changes a card&apos;s odds, anyone&apos;s rating, or
              what comes out of a pack.
            </p>
          </div>
          <PatronPerks variant="full" />
          <div>
            <span className="label-dash">How to get it</span>
            <ol className="mt-2 flex list-decimal flex-col gap-1.5 pl-5 text-sm leading-6 text-muted">
              <li>Send {PATRON_PRICE_LABEL} to either dev — pick whatever level feels right.</li>
              <li>Tell a dev your Discord username so they can light your flame.</li>
              <li>Pick your flame&apos;s colour from the wardrobe on the packs page.</li>
            </ol>
          </div>
          <div className="flex flex-wrap gap-3">
            <a href={PATRON_PAYPAL_HREF} target="_blank" rel="noopener noreferrer" className="btn-pill inline-flex items-center gap-2 px-4 py-2 text-sm">
              PayPal · Zachari ↗
            </a>
            {PATRON_VENMO_LINKS.map((link) => (
              <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer" className="btn-pill inline-flex items-center gap-2 px-4 py-2 text-sm">
                Venmo · {link.name} ↗
              </a>
            ))}
            <Link href="/supporters" className="text-sm text-coral underline-offset-4 hover:underline self-center">
              The current patrons →
            </Link>
          </div>
        </section>
      </div>

      <section aria-labelledby="compare-title" className="card-brand overflow-x-auto p-5 sm:p-7">
        <span className="label-dash">Side by side</span>
        <h2 id="compare-title" className="type-display mt-2 text-3xl">Which do I need?</h2>
        <table className="mt-4 w-full min-w-[32rem] text-left text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-[0.16em] text-muted">
              <th scope="col" className="py-2 pr-4 font-semibold">I want to…</th>
              <th scope="col" className="py-2 pr-4 font-semibold">Free</th>
              <th scope="col" className="py-2 pr-4 font-semibold">{PREMIUM_NAME}</th>
              <th scope="col" className="py-2 font-semibold">Patron</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle text-muted">
            {[
              ["Follow the league: schedule, stats, teams, players", "✓", "✓", "✓"],
              ["Look at every card, the moments and the Vault", "✓", "✓", "✓"],
              ["Play the daily games and earn betting dollars", "—", "✓", "✓"],
              ["Own cards, open packs, trade, bet", "—", "✓", "✓"],
              ["Play Fantasy, the Gauntlet, Showdown, Expeditions", "—", "✓", "✓"],
              ["Carry the flame, dust for more, rip twice a day, nine binder slots", "—", "—", "✓ (with the role)"],
            ].map(([want, free, premium, patron]) => (
              <tr key={want}>
                <th scope="row" className="py-2 pr-4 font-normal text-white">{want}</th>
                <td className="py-2 pr-4">{free}</td>
                <td className="py-2 pr-4">{premium}</td>
                <td className="py-2">{patron}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-4 text-sm text-muted">
          Wondering what the dollars are worth?{" "}
          <Link href="/economy" className="text-coral underline-offset-4 hover:underline">
            Every way to earn and spend them →
          </Link>
        </p>
      </section>
    </main>
  );
}
