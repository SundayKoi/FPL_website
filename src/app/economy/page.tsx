import type { Metadata } from "next";
import Link from "next/link";
import { EARN, ECONOMY_RULE, SPEND, type LedgerRow } from "@/lib/economy/ledger";
import { SIGNUP_BONUS_AMOUNT } from "@/lib/betting/daily";
import { fmtPoints } from "@/lib/betting/format";
import { PREMIUM_NAME } from "@/lib/site/discord";

export const metadata: Metadata = {
  title: "Betting dollars — FPL",
  description: "Every way betting dollars come in and every way they go out, with the real figures.",
};

function Row({ row }: { row: LedgerRow }) {
  return (
    <li id={row.key} className="scroll-mt-24 grid gap-2 border-t border-border-subtle py-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] sm:gap-6">
      <div>
        <h3 className="font-semibold text-white">{row.title}</h3>
        <p className="mt-1 font-mono text-sm text-gold">{row.figure}</p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {row.free ? (
            <span className="rounded-full border border-mint/50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-mint">No cards needed</span>
          ) : null}
          {row.patron ? (
            <span className="rounded-full border border-gold/50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gold">Patron bonus</span>
          ) : null}
        </div>
      </div>
      <div>
        <p className="text-sm leading-6 text-muted">{row.detail}</p>
        <Link href={row.href} className="mt-2 inline-block text-sm text-coral underline-offset-4 hover:underline">
          {row.linkLabel} →
        </Link>
      </div>
    </li>
  );
}

/**
 * The economy in one place: where betting dollars come from and where
 * they go. Every figure is imported from the config that enforces it,
 * so this page cannot drift from the server. Public on purpose — someone
 * deciding whether {PREMIUM_NAME} is worth it should be able to read the
 * money before paying.
 */
export default function EconomyPage() {
  return (
    <main className="page-backdrop mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-4 py-12 text-white sm:px-6">
      <header className="max-w-3xl">
        <span className="label-dash">{PREMIUM_NAME} · The economy</span>
        <h1 className="type-display mt-3 text-5xl sm:text-6xl">Betting dollars</h1>
        <hr className="accent-rule mt-5 w-48 sm:w-64" />
        <p className="mt-4 text-lg leading-8 text-muted">
          Play money, shared by everything on the site. Your wallet opens with {fmtPoints(SIGNUP_BONUS_AMOUNT)}. The
          same dollars place bets, buy packs, pay market listings and seat you at a table — and every way of earning
          more is listed below, easiest first.
        </p>
        <p className="mt-3 text-sm leading-6 text-muted">{ECONOMY_RULE}</p>
        <nav aria-label="On this page" className="mt-5 flex flex-wrap gap-2 text-xs">
          <a href="#earn" className="btn-pill px-3 py-1.5">Where they come from</a>
          <a href="#spend" className="btn-pill px-3 py-1.5">Where they go</a>
          <Link href="/glossary" className="btn-pill px-3 py-1.5">The words (shine, dust, relic…)</Link>
          <Link href="/betting" className="btn-pill px-3 py-1.5">Your wallet</Link>
        </nav>
      </header>

      <section id="earn" aria-labelledby="earn-title" className="scroll-mt-24 card-brand p-5 sm:p-7">
        <span className="label-dash">In</span>
        <h2 id="earn-title" className="type-display mt-2 text-3xl sm:text-4xl">Where they come from</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          The first four need no cards and no waiting — a new member can take all of them today. The rest pay more
          the more you play.
        </p>
        <ul className="mt-5 flex flex-col">
          {EARN.map((row) => (
            <Row key={row.key} row={row} />
          ))}
        </ul>
      </section>

      <section id="spend" aria-labelledby="spend-title" className="scroll-mt-24 card-brand p-5 sm:p-7">
        <span className="label-dash">Out</span>
        <h2 id="spend-title" className="type-display mt-2 text-3xl sm:text-4xl">Where they go</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          Nothing is charged without a button that says the price. Signing up, claiming your card, the daily games,
          Fantasy and the Weekly Draw are all free.
        </p>
        <ul className="mt-5 flex flex-col">
          {SPEND.map((row) => (
            <Row key={row.key} row={row} />
          ))}
        </ul>
      </section>

      <p className="text-sm text-muted">
        Not a member yet?{" "}
        <Link href="/membership" className="text-coral underline-offset-4 hover:underline">
          What {PREMIUM_NAME} and patronage each get you →
        </Link>
      </p>
    </main>
  );
}
