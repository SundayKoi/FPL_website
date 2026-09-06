import type { Metadata } from "next";
import Link from "next/link";
import CardsPageHeader, { cardsEyebrow } from "@/components/cards/CardsPageHeader";
import PlayerCard3D from "@/components/cards/PlayerCard3D";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import type { PlayerCardData } from "@/lib/cards/build";
import { fetchCardSeason, fetchCurrentWeekCards, type CardLeague } from "@/lib/cards/queries";
import { rarityGuide, type RarityEntry } from "@/lib/cards/rarityGuide";

export const metadata: Metadata = {
  title: "Rarities — FPL",
  description: "Every rarity a card can pull — tiers, parallels, the finishes, inserts and stamps — with the real odds.",
};

function Entry({ entry }: { entry: RarityEntry }) {
  return (
    <li className="card-brand flex flex-col gap-2 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-base font-black text-white">
          {entry.name}
          {entry.fresh ? (
            <span className="rounded-full border border-gold/70 bg-gold/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] text-gold">
              New
            </span>
          ) : null}
        </h3>
        <span className="font-mono text-xs font-bold tabular-nums text-gold">{entry.odds}</span>
      </div>
      <p className="text-sm text-steel">{entry.look}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="font-bold uppercase tracking-[0.14em] text-muted">How</dt>
        <dd className="text-white/85">{entry.how}</dd>
        {entry.perPack ? (
          <>
            <dt className="font-bold uppercase tracking-[0.14em] text-muted">Per pack</dt>
            <dd className="text-white/85">{entry.perPack}</dd>
          </>
        ) : null}
        <dt className="font-bold uppercase tracking-[0.14em] text-muted">Value</dt>
        <dd className="text-white/85">{entry.value}</dd>
      </dl>
    </li>
  );
}

/**
 * The three finishes, on a real card from this week, so a reader sees what
 * the words mean. Nothing is minted: these are the live card with the
 * frozen fields a pull would carry, rendered exactly as a pulled copy is.
 */
function Samples({ card }: { card: PlayerCardData }) {
  const samples: { key: string; label: string; card: PlayerCardData }[] = [
    { key: "shiny", label: "Shiny", card: { ...card, shiny: true } },
    { key: "stattrak", label: "StatTrak™", card: { ...card, stattrak: { points: 1284, since: new Date().toISOString() } } },
    {
      key: "secret",
      label: "Secret",
      card: { ...card, secret: { number: card.collectionSize + 1, of: card.collectionSize } },
    },
    { key: "worn", label: "Battle-Scarred", card: { ...card, wear: 14 } },
    { key: "slab", label: "Slabbed", card: { ...card, wear: 2, slab: { wear: 2, at: new Date().toISOString() } } },
  ];
  return (
    <ul className="flex flex-wrap justify-center gap-6">
      {samples.map((sample) => (
        <li key={sample.key} className="flex flex-col items-center gap-2">
          <PlayerCard3D card={sample.card} interactive />
          <span className="text-xs font-bold uppercase tracking-[0.18em] text-muted">{sample.label}</span>
        </li>
      ))}
    </ul>
  );
}

export async function RaritiesPageView({ league = "premier" }: { league?: CardLeague }) {
  const service = createBettingServiceClient();
  const season = await fetchCardSeason(service, league);
  const cards = season ? await fetchCurrentWeekCards(service, season) : [];
  // The best card of the week makes the clearest sample; any card would do.
  const sample = [...cards].sort((a, b) => b.overall - a.overall)[0] ?? null;
  const base = league === "academy" ? "/academy/cards" : "/cards";
  const guide = rarityGuide(season, league);

  return (
    <main className="bg-hash mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-10 px-4 py-10 text-white sm:px-6">
      <CardsPageHeader eyebrow={cardsEyebrow("Packs", league, season)} title="Rarities">
        Everything a card can come out of a pack as, and how often — and what it can become in your hands.
        Every number on this page is read from the same setting the shop rolls with, so what it says is what
        you get. New this release: three finishes — Shiny, StatTrak and Secret — rolled on top of everything
        that was already here, and wear grades with slabbing for every copy you own.
      </CardsPageHeader>

      {sample ? (
        <section aria-label="The finishes, on a card" className="flex flex-col gap-4">
          <Samples card={sample} />
          <p className="text-center text-xs text-muted">
            Flip a card to see its back. The StatTrak counter and the wear record live there; the Secret&apos;s
            over-number takes the serial line under the rating.
          </p>
        </section>
      ) : null}

      <nav aria-label="Sections" className="flex flex-wrap gap-2">
        {guide.map((section) => (
          <a
            key={section.key}
            href={`#${section.key}`}
            className="rounded-full border border-border-subtle bg-surface px-3 py-1 text-xs font-bold uppercase tracking-wide text-muted hover:text-white"
          >
            {section.title}
          </a>
        ))}
      </nav>

      {guide.map((section) => (
        <section key={section.key} id={section.key} aria-labelledby={`rarities-${section.key}`} className="flex flex-col gap-4">
          <div>
            <h2 id={`rarities-${section.key}`} className="type-display text-2xl">
              {section.title}
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-steel">{section.intro}</p>
          </div>
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {section.entries.map((entry) => (
              <Entry key={entry.key} entry={entry} />
            ))}
          </ul>
        </section>
      ))}

      <p className="text-sm text-steel">
        <Link href={`${base}/packs`} className="text-gold underline-offset-4 hover:underline">
          Open a pack →
        </Link>
      </p>
    </main>
  );
}

export default async function RaritiesPage() {
  return RaritiesPageView({ league: "premier" });
}
