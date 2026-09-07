import type { Metadata } from "next";
import Link from "next/link";
import { GLOSSARY } from "@/lib/site/glossary";

export const metadata: Metadata = {
  title: "Glossary — FPL",
  description: "Shine, dust, relic, binder, purse: the words the cards use, in one page.",
};

/**
 * The short glossary. Every term the site uses without explaining it,
 * with an anchor so a page can link straight to the word it just used
 * (`/glossary#shine`).
 */
export default function GlossaryPage() {
  return (
    <main className="page-backdrop mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-4 py-12 text-white sm:px-6">
      <header className="max-w-3xl">
        <span className="label-dash">Cards · The words</span>
        <h1 className="type-display mt-3 text-5xl sm:text-6xl">Glossary</h1>
        <hr className="accent-rule mt-5 w-48 sm:w-64" />
        <p className="mt-4 text-lg leading-8 text-muted">
          The card economy has its own vocabulary. This is all of it, in the order you are likely to meet it.
        </p>
        <p className="mt-3 text-sm leading-6 text-muted">
          For the money —{" "}
          <Link href="/economy" className="text-coral underline-offset-4 hover:underline">
            where betting dollars come from and go →
          </Link>
          {" · "}
          For the odds —{" "}
          <Link href="/cards/rarities" className="text-coral underline-offset-4 hover:underline">
            every rarity a pack can pull →
          </Link>
        </p>
      </header>

      <dl className="card-brand divide-y divide-border-subtle p-5 sm:p-7">
        {GLOSSARY.map((term) => (
          <div key={term.key} id={term.key} className="scroll-mt-24 grid gap-1 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,3fr)] sm:gap-6">
            <dt className="font-semibold text-white">{term.term}</dt>
            <dd>
              <p className="text-sm leading-6 text-muted">{term.meaning}</p>
              {term.href ? (
                <Link href={term.href} className="mt-1 inline-block text-sm text-coral underline-offset-4 hover:underline">
                  {term.linkLabel ?? "Have a look"} →
                </Link>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>
    </main>
  );
}
