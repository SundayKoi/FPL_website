import type { Metadata } from "next";
import Link from "next/link";
import CardsPageHeader, { cardsEyebrow } from "@/components/cards/CardsPageHeader";
import { tierLabel } from "@/lib/cards/tier";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import { fetchCardSeason, type CardLeague } from "@/lib/cards/queries";
import { EXPEDITION_TIERS, LOST_DAYS } from "@/lib/expeditions/config";
import { fetchLedger, type LedgerEntry } from "@/lib/expeditions/queries";

export const metadata: Metadata = {
  title: "The ledger of the fallen and the found — FPL",
  description: "Every card the league has lost on an expedition, and every one that came back: whose, which route, and when.",
};

/** "Aug 27" on the Eastern calendar, the one every expedition keeps. */
function onDay(at: string): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
}

function routeLabel(entry: LedgerEntry): string {
  return entry.route ? EXPEDITION_TIERS[entry.route].label : "an expedition";
}

/** What happened, in one line, from the card's side. */
export function ledgerLine(entry: LedgerEntry, now: Date): string {
  switch (entry.kind) {
    case "died":
      return `Fell on the ${routeLabel(entry)}`;
    case "buried":
      return `Lost on the ${routeLabel(entry)}, and nobody came for it in ${LOST_DAYS} days`;
    case "missing": {
      const left = Math.max(0, Math.ceil((Date.parse(entry.at) - now.getTime()) / (24 * 60 * 60 * 1000)));
      return `Missing since the ${routeLabel(entry)} — ${left === 0 ? "gone by tonight" : `${left} day${left === 1 ? "" : "s"} to bring it home`}`;
    }
    case "rescued":
      return `Lost on the ${routeLabel(entry)}, brought home by a Rescue`;
    case "carried":
      return `Lost on the ${routeLabel(entry)}, carried home by ${entry.by?.username ?? "a stranger"}'s squad`;
    case "ransomed":
      return `Lost on the ${routeLabel(entry)}, ransomed back`;
  }
}

const KIND_CLASS: Record<LedgerEntry["kind"], string> = {
  died: "border-red-500/50 text-red-300",
  buried: "border-red-500/40 text-red-300/80",
  missing: "border-gold/60 text-gold",
  rescued: "border-mint/60 text-mint",
  carried: "border-mint/60 text-mint",
  ransomed: "border-mint/40 text-mint/90",
};

const KIND_LABEL: Record<LedgerEntry["kind"], string> = {
  died: "Fallen",
  buried: "Buried",
  missing: "Missing",
  rescued: "Rescued",
  carried: "Carried home",
  ransomed: "Ransomed",
};

function Row({ entry, now }: { entry: LedgerEntry; now: Date }) {
  return (
    <li
      data-testid={`ledger-${entry.key}`}
      className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border border-line bg-panel px-3 py-2 text-xs text-steel"
    >
      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-[0.14em] ${KIND_CLASS[entry.kind]}`}>
        {KIND_LABEL[entry.kind]}
      </span>
      <span className="flex min-w-0 items-center gap-2">
        {entry.owner.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={entry.owner.avatarUrl} alt="" width={20} height={20} className="h-5 w-5 rounded-full" />
        ) : (
          <span aria-hidden className="h-5 w-5 rounded-full bg-line" />
        )}
        <span className="truncate font-semibold text-white">{entry.owner.username}</span>
      </span>
      <span className="text-white">
        {entry.playerName}
        <span className="text-steel">
          {" "}
          · {tierLabel(entry.tier)}
          {entry.foil ? " · foil" : ""}
          {entry.signed ? " · signed" : ""}
        </span>
      </span>
      <span className="basis-full sm:basis-auto sm:flex-1">{ledgerLine(entry, now)}</span>
      <span className="ml-auto font-mono text-[11px] text-steel/80">{entry.kind === "missing" ? `until ${onDay(entry.at)}` : onDay(entry.at)}</span>
    </li>
  );
}

/**
 * The ledger of the fallen and the found.
 *
 * Public, like the Vault and for the same reason: a death on the Legendary
 * route is league news, the announcement in the cards channel points here,
 * and a page that answers "whose card was that" cannot be behind a sign-in.
 * The graveyard on the expeditions page is one collector's; this is
 * everybody's. Nothing private crosses: a name and an avatar are what every
 * public card surface already shows, and a lost card is a lost card.
 *
 * The service client reads it because the graveyard and the holds are
 * owner-scoped under RLS — the tables are closed, the content is not.
 */
export async function LedgerPageView({ league = "premier" }: { league?: CardLeague } = {}) {
  const base = league === "academy" ? "/academy/cards" : "/cards";
  const service = createBettingServiceClient();
  const season = await fetchCardSeason(service, league);
  const entries = season ? (await fetchLedger(service)).filter((entry) => entry.season === season) : [];
  const now = new Date();

  const fallen = entries.filter((entry) => entry.kind === "died" || entry.kind === "buried");
  const missing = entries.filter((entry) => entry.kind === "missing");
  const found = entries.filter((entry) => entry.kind === "rescued" || entry.kind === "carried" || entry.kind === "ransomed");

  return (
    <main className="bg-hash mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-8 px-4 py-10 text-white sm:px-6">
      <CardsPageHeader eyebrow={cardsEyebrow("Play", league, season)} title="The ledger of the fallen and the found">
        Every card the league has lost on an expedition, and every one that came back. A card that fell on the
        Legendary route, or was lost and never rescued, stays here for good. A card that is missing right now can
        still be brought home — by its owner&apos;s Rescue, by a ransom, or by another squad that happens across it
        on a route that can lose cards, for a bounty.{" "}
        <Link href={`${base}/expeditions`} className="text-coral underline-offset-4 hover:underline">
          Send a squad out →
        </Link>
      </CardsPageHeader>

      <p data-testid="ledger-tally" className="text-sm text-steel">
        <span className="font-display text-2xl font-bold tabular-nums text-red-300">{fallen.length}</span> fallen ·{" "}
        <span className="font-display text-2xl font-bold tabular-nums text-gold">{missing.length}</span> missing ·{" "}
        <span className="font-display text-2xl font-bold tabular-nums text-mint">{found.length}</span> found
      </p>

      {entries.length === 0 ? (
        <p className="text-sm text-steel">Nothing yet. Nobody has lost a card this season — the routes are waiting.</p>
      ) : null}

      {missing.length > 0 ? (
        <section aria-label="Missing cards" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline gap-3">
            <h2 className="type-display text-2xl sm:text-3xl">Still missing</h2>
            <span className="text-xs text-steel">Out there right now. A squad on a route that can lose cards may find one of these.</span>
          </div>
          <ul className="flex flex-col gap-1">
            {missing.map((entry) => (
              <Row key={entry.key} entry={entry} now={now} />
            ))}
          </ul>
        </section>
      ) : null}

      {fallen.length > 0 ? (
        <section aria-label="Fallen cards" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline gap-3">
            <h2 className="type-display text-2xl sm:text-3xl">The fallen</h2>
            <span className="text-xs text-steel">Gone for good. The card, the route, the day.</span>
          </div>
          <ul className="flex flex-col gap-1">
            {fallen.map((entry) => (
              <Row key={entry.key} entry={entry} now={now} />
            ))}
          </ul>
        </section>
      ) : null}

      {found.length > 0 ? (
        <section aria-label="Found cards" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline gap-3">
            <h2 className="type-display text-2xl sm:text-3xl">The found</h2>
            <span className="text-xs text-steel">Lost, and brought back — wounded, but home.</span>
          </div>
          <ul className="flex flex-col gap-1">
            {found.map((entry) => (
              <Row key={entry.key} entry={entry} now={now} />
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}

export default async function LedgerPage() {
  return LedgerPageView({ league: "premier" });
}
