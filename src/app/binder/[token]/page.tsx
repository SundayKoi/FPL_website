import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import PlayerCard3D from "@/components/cards/PlayerCard3D";
import { tierLabel } from "@/lib/cards/tier";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import { fetchBinderByToken } from "@/lib/binder/queries";
import PatronFlame from "@/components/patron/PatronFlame";
import { patronFlameOf } from "@/lib/patron/flames";
import { editionLabel } from "@/lib/packs/week";

/** The binder is public by link, so it renders for signed-out visitors —
 *  the service client reads it because the tables are deny-all, not
 *  because the content is private. */
async function loadBinder(token: string) {
  return fetchBinderByToken(createBettingServiceClient(), token);
}

/** The owner's active flame, or null. Async and off the render path — the
 *  compiler is right that a bare Date.now() in a component body is a
 *  render impurity. */
async function patronFlame(discordId: string): Promise<string | null> {
  const { data } = await createBettingServiceClient()
    .from("betting_profiles")
    .select("patron_until, patron_flame")
    .eq("discord_id", discordId)
    .maybeSingle();
  const row = data as { patron_until: string | null; patron_flame: string | null } | null;
  const active = Boolean(row?.patron_until && new Date(row.patron_until).getTime() > Date.now());
  return active ? patronFlameOf(row?.patron_flame) : null;
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

  // The flame on a patron's binder is most of what patronage buys — the
  // binder is the page people actually share. Worn on the header, not the
  // cards: the cards' frames mean tier, and muddying that would spend the
  // merit axis on money.
  const flame = await patronFlame(binder.discordId);

  return (
    <main className="bg-hash mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-8 px-4 py-10 text-white sm:px-6">
      <header className={`relative flex flex-wrap items-center gap-4 ${flame ? "rounded-2xl p-5" : ""}`}>
        {flame ? <PatronFlame flame={flame} /> : null}
        {binder.ownerAvatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={binder.ownerAvatarUrl}
            alt=""
            className="h-14 w-14 rounded-full border border-border object-cover"
            loading="lazy"
            decoding="async"
          />
        ) : null}
        <div>
          <span className="label-dash">The binder</span>
          <h1 className="type-display mt-2 text-4xl sm:text-5xl">
            {binder.title ?? (binder.ownerName ? `${binder.ownerName}'s binder` : "Card binder")}
            {flame ? (
              <span className="ml-3 align-middle rounded-full border border-gold/50 bg-gold/10 px-2.5 py-1 text-xs font-bold uppercase tracking-[0.14em] text-gold">
                🔥 Patron
              </span>
            ) : null}
          </h1>
          <hr className="accent-rule mt-4 w-40 sm:w-56" />
        </div>
      </header>

      {binder.cards.length === 0 ? (
        <p className="text-sm text-muted">Nothing on display yet.</p>
      ) : (
        <section aria-label="Cards on display" className="grid gap-8 sm:grid-cols-2 xl:grid-cols-3">
          {binder.cards.map((entry) => (
            <figure key={entry.slot} className="flex flex-col items-center gap-3">
              {/* Slot 1 is a patron's pedestal: the featured card floats on
                  the tier-coloured bloom the share pages use. */}
              <PlayerCard3D
                card={entry.card}
                forceFoil={entry.foil}
                foilType={entry.foilType}
                flame={flame}
                bloom={Boolean(flame) && entry.slot === 1}
              />
              <figcaption className="text-center text-xs text-muted">
                {entry.playerName} · {tierLabel(entry.tier)}
                {entry.editionWeek ? ` · ${editionLabel(entry.editionWeek)}` : ""}
                {entry.foil ? " · Foil" : ""}
                {entry.signed ? " · Signed" : ""}
              </figcaption>
            </figure>
          ))}
        </section>
      )}

      <Link href="/cards" className="text-xs text-muted underline-offset-4 hover:text-primary hover:underline">
        ← FPL player cards
      </Link>
    </main>
  );
}
