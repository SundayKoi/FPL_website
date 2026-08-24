import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import PlayerCard3D from "@/components/cards/PlayerCard3D";
import { tierLabel } from "@/components/cards/CardCopyPreview";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import { fetchBinderByToken } from "@/lib/binder/queries";
import { editionLabel } from "@/lib/packs/week";

/** The binder is public by link, so it renders for signed-out visitors —
 *  the service client reads it because the tables are deny-all, not
 *  because the content is private. */
async function loadBinder(token: string) {
  return fetchBinderByToken(createBettingServiceClient(), token);
}

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const binder = await loadBinder(token);
  if (!binder) return { title: "Binder — FPL" };
  const who = binder.ownerName ? `${binder.ownerName}'s` : "A";
  return {
    title: `${binder.title ?? `${who} binder`} | FPL`,
    description: `${binder.cards.length} card${binder.cards.length === 1 ? "" : "s"} on display.`,
  };
}

export default async function BinderPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const binder = await loadBinder(token);
  // A bad or rotated token is indistinguishable from a binder that never
  // existed, on purpose — 404 rather than "this binder is private", which
  // would confirm the token used to be real.
  if (!binder) notFound();

  return (
    <main className="bg-hash mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-8 px-4 py-10 text-white sm:px-6">
      <header className="flex flex-wrap items-center gap-4">
        {binder.ownerAvatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={binder.ownerAvatarUrl}
            alt=""
            className="h-14 w-14 rounded-full border border-line object-cover"
            loading="lazy"
            decoding="async"
          />
        ) : null}
        <div>
          <span className="label-dash">The binder</span>
          <h1 className="type-display mt-2 text-4xl sm:text-5xl">
            {binder.title ?? (binder.ownerName ? `${binder.ownerName}'s binder` : "Card binder")}
          </h1>
          <hr className="accent-rule mt-4 w-40 sm:w-56" />
        </div>
      </header>

      {binder.cards.length === 0 ? (
        <p className="text-sm text-steel">Nothing on display yet.</p>
      ) : (
        <section aria-label="Cards on display" className="grid gap-8 sm:grid-cols-2 xl:grid-cols-3">
          {binder.cards.map((entry) => (
            <figure key={entry.slot} className="flex flex-col items-center gap-3">
              <PlayerCard3D card={entry.card} forceFoil={entry.foil} />
              <figcaption className="text-center text-xs text-steel">
                {entry.playerName} · {tierLabel(entry.tier)}
                {entry.editionWeek ? ` · ${editionLabel(entry.editionWeek)}` : ""}
                {entry.foil ? " · Foil" : ""}
                {entry.signed ? " · Signed" : ""}
              </figcaption>
            </figure>
          ))}
        </section>
      )}

      <Link href="/cards" className="text-xs text-steel underline-offset-4 hover:text-coral hover:underline">
        ← FPL player cards
      </Link>
    </main>
  );
}
