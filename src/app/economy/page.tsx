import type { Metadata } from "next";
import Link from "next/link";
import AboutPageHeader from "@/components/info/AboutPageHeader";
import AboutPageShell from "@/components/info/AboutPageShell";
import { EARN, ECONOMY_RULE, SPEND, type LedgerRow } from "@/lib/economy/ledger";
import { SIGNUP_BONUS_AMOUNT } from "@/lib/betting/daily";
import { fmtPoints } from "@/lib/betting/format";
import { GLOSSARY } from "@/lib/site/glossary";
import { PREMIUM_NAME } from "@/lib/site/discord";

export const metadata: Metadata = {
  title: "Cards & currency guide — FPL",
  description: "How FPL play money works, every way to earn or spend it, and the terms used across the card collection.",
};

function glossaryId(key: string) {
  // `dust` is already an earning-ledger anchor; keep both destinations unique.
  return key === "dust" ? "term-dust" : key;
}

function LedgerEntry({ row }: { row: LedgerRow }) {
  return (
    <div id={row.key} className="grid gap-2 border-t border-border-subtle py-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] sm:gap-6">
      <dt>
        <span className="block font-semibold text-white">{row.title}</span>
        <span className="mt-1 block font-mono text-sm text-gold">{row.figure}</span>
        <span className="mt-1 flex flex-wrap gap-1.5">
          {row.free ? <span className="rounded-full border border-mint/50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-mint">No cards needed</span> : null}
          {row.patron ? <span className="rounded-full border border-gold/50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gold">Patron bonus</span> : null}
        </span>
      </dt>
      <dd>
        <p className="text-sm leading-6 text-muted">{row.detail}</p>
        <Link href={row.href} className="mt-2 inline-block text-sm text-action-text underline underline-offset-4 hover:text-white">
          {row.linkLabel} →
        </Link>
      </dd>
    </div>
  );
}

export default function EconomyPage() {
  return (
    <AboutPageShell activeHref="/economy">
      <AboutPageHeader
        eyebrow={`${PREMIUM_NAME} · The economy`}
        title="Cards & currency guide"
        description={
          <>
            Betting dollars are FPL play money. They are separate from real payments for Premium or patronage.
            Your wallet opens with {fmtPoints(SIGNUP_BONUS_AMOUNT)}; the guide below shows where the dollars come from,
            where they go, and the terms used across the cards.
          </>
        }
      />

      <nav aria-label="On this page" className="flex flex-wrap gap-2 border-y border-border-subtle py-4 text-sm">
        <a href="#earn" className="btn-pill inline-flex rounded-full px-3 py-1.5">Earn</a>
        <a href="#spend" className="btn-pill inline-flex rounded-full px-3 py-1.5">Spend</a>
        <a href="#glossary" className="btn-pill inline-flex rounded-full px-3 py-1.5">Terms</a>
        <Link href="/betting" className="btn-pill inline-flex rounded-full px-3 py-1.5">Your wallet</Link>
      </nav>

      <p className="mt-5 max-w-3xl text-sm leading-6 text-muted">{ECONOMY_RULE}</p>

      <section id="earn" aria-labelledby="earn-title" className="mt-8 scroll-mt-24">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-action-text">In</p>
        <h2 id="earn-title" className="mt-2 font-display text-2xl font-semibold text-white">Where dollars come from</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          The first four earning methods need no cards and no waiting; the rest pay as you play.
        </p>
        <dl className="mt-4 border-b border-border-subtle">
          {EARN.map((row) => <LedgerEntry key={row.key} row={row} />)}
        </dl>
      </section>

      <section id="spend" aria-labelledby="spend-title" className="mt-10 scroll-mt-24">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-action-text">Out</p>
        <h2 id="spend-title" className="mt-2 font-display text-2xl font-semibold text-white">Where dollars go</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          A price is shown before a purchase. Signup, card claims, daily games, Fantasy, and the Weekly Draw are free.
        </p>
        <dl className="mt-4 border-b border-border-subtle">
          {SPEND.map((row) => <LedgerEntry key={row.key} row={row} />)}
        </dl>
      </section>

      <section id="glossary" aria-labelledby="glossary-title" className="mt-10 scroll-mt-24 border-t border-border-subtle pt-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-action-text">The words</p>
        <h2 id="glossary-title" className="mt-2 font-display text-2xl font-semibold text-white">Card glossary</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
          Definitions link to the related activity or rarity guide. Each term stays available here without a search or an accordion.
        </p>
        <nav aria-label="Glossary terms" className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-y border-border-subtle py-3 text-sm">
          {GLOSSARY.map((term) => (
            <a key={term.key} href={`#${glossaryId(term.key)}`} className="text-action-text underline underline-offset-4 hover:text-white">
              {term.term}
            </a>
          ))}
        </nav>
        <dl className="mt-2 border-b border-border-subtle">
          {GLOSSARY.map((term) => (
            <div key={term.key} id={glossaryId(term.key)} className="grid gap-1 border-t border-border-subtle py-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,3fr)] sm:gap-6">
              <dt className="font-semibold text-white">{term.term}</dt>
              <dd>
                <p className="text-sm leading-6 text-muted">{term.meaning}</p>
                {term.href ? (
                  <Link href={term.href} className="mt-1 inline-block text-sm text-action-text underline underline-offset-4 hover:text-white">
                    {term.linkLabel ?? "Have a look"} →
                  </Link>
                ) : null}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <p className="mt-8 text-sm text-muted">
        Looking for Premium or patronage information?{" "}
        <Link href="/membership" className="text-action-text underline underline-offset-4 hover:text-white">
          Compare membership and support →
        </Link>
      </p>
    </AboutPageShell>
  );
}
