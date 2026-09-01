import type { Metadata } from "next";
import Link from "next/link";
import CardsLeagueToggle from "@/components/cards/CardsLeagueToggle";
import PlayerCard3D from "@/components/cards/PlayerCard3D";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import { fetchCardSeason, type CardLeague } from "@/lib/cards/queries";
import { copyImageUrl } from "@/lib/cards/shareImage";
import { tierLabel } from "@/lib/cards/tier";
import { groupUnclaimedByWeek, vaultTotals, type FoundEclipse, type VaultData } from "@/lib/cards/vault";
import { fetchVault } from "@/lib/cards/vaultQueries";
import { ECLIPSE_FOIL_TYPE } from "@/lib/packs/config";
import { editionLabel } from "@/lib/packs/week";

export const metadata: Metadata = {
  title: "The Vault — FPL",
  description: "Every one-of-one in the league: who found it, who holds it now, and what is still out there.",
};

/** "25 Aug 2026" — the day a one-of-one came out of a pack. Printed in UTC
 *  for the reason every date on these pages is: the server and a browser in
 *  another timezone must not disagree about which day it was. */
function foundOn(at: string): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function Chip({ children, gold = false }: { children: React.ReactNode; gold?: boolean }) {
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-[0.14em] ${
        gold ? "border-gold/50 bg-gold/10 text-gold" : "border-line bg-panel text-steel"
      }`}
    >
      {children}
    </span>
  );
}

/** One found Eclipse: the copy as it actually printed, who holds it, and
 *  everything that has happened to it. */
function FoundCard({ copy }: { copy: FoundEclipse }) {
  return (
    <figure className="flex flex-col items-center gap-3">
      <PlayerCard3D
        card={copy.card}
        interactive
        forceFoil
        foilType={ECLIPSE_FOIL_TYPE}
        flame={copy.owner.flame}
        // Always this, by construction: the partial unique index means one
        // Eclipse per print, forever.
        print={{ number: 1, of: 1, editionWeek: copy.editionWeek }}
      />
      <figcaption className="card-brand flex w-full max-w-[20rem] flex-col gap-3 p-4">
        <div className="flex items-center gap-2">
          {copy.owner.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={copy.owner.avatarUrl}
              alt=""
              className="h-8 w-8 rounded-full border border-line object-cover"
              loading="lazy"
              decoding="async"
            />
          ) : null}
          <span className="text-sm font-semibold text-white">{copy.owner.name}</span>
          {copy.owner.flame ? <Chip gold>🔥 Patron</Chip> : null}
        </div>

        <div className="flex flex-col gap-1 text-xs text-steel">
          <span className="text-white">
            {copy.playerName} · {copy.overall} OVR
          </span>
          <span>
            {tierLabel(copy.tier)} {copy.role} · {editionLabel(copy.editionWeek)} · #1 of 1
          </span>
          <span>
            Found {foundOn(copy.acquiredAt)}
            {copy.signed ? " · ✍️ Signed" : ""}
          </span>
        </div>

        {copy.chain.length > 0 ? (
          <div className="flex flex-col gap-1">
            <span className="label-dash">Chain of custody</span>
            <ol className="flex flex-col gap-0.5 text-xs text-steel">
              {copy.chain.map((line, index) => (
                <li key={`${copy.inventoryId}-${index}`}>{line}</li>
              ))}
            </ol>
          </div>
        ) : null}

        <a
          href={copyImageUrl("", { id: copy.inventoryId, expeditionMark: copy.expeditionMark })}
          className="text-xs text-steel underline-offset-4 hover:text-coral hover:underline"
        >
          Open image →
        </a>
      </figcaption>
    </figure>
  );
}

/**
 * The registry of one-of-ones.
 *
 * Public, like the moments wall and the ledger and for the same reason: an
 * Eclipse is league news, the announcement in the cards channel points here,
 * and a page that answers "who owns that one" cannot be behind a sign-in and
 * still do its job. Nothing private crosses the boundary — a holder's name,
 * their avatar and their flame are what every other public card surface
 * already shows, and the chain of custody is the object's own history.
 *
 * The service client reads it because card_inventory and card_provenance are
 * deny-all RLS, exactly as the binder page reads a binder: the tables are
 * closed, the content is not.
 */
export async function VaultPageView({ league = "premier" }: { league?: CardLeague }) {
  const base = league === "academy" ? "/academy/cards" : "/cards";
  const service = createBettingServiceClient();
  const season = await fetchCardSeason(service, league);
  const vault: VaultData = season ? await fetchVault(service, season) : { found: [], unclaimed: [] };
  const totals = vaultTotals(vault);
  const weeks = groupUnclaimedByWeek(vault.unclaimed);

  return (
    <main className="bg-hash mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-8 px-4 py-10 text-white sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="label-dash">
            {league === "academy" ? "Academy" : "Premier"} · Season {season ?? "—"}
          </span>
          <h1 className="type-display mt-2 text-4xl sm:text-5xl">The Vault</h1>
          <hr className="accent-rule mt-4 w-40 sm:w-56" />
          <p className="mt-3 max-w-2xl text-sm text-steel">
            An Eclipse can only fall on a Card of the Week, and only one of each will ever exist. This is
            the register: every one that has been found, who holds it now and everywhere it has been —
            and, below, every crowned print still waiting for somebody to pull it. An unclaimed one stays
            claimable forever through its own week&apos;s packs, so the board only ever grows.
          </p>
          <Link href={base} className="mt-3 inline-block text-xs text-steel underline-offset-4 hover:text-coral hover:underline">
            ← Back to player cards
          </Link>
        </div>
        <CardsLeagueToggle league={league} suffix="/vault" />
      </header>

      <p className="text-sm text-steel">
        <span className="font-display text-2xl font-bold tabular-nums text-gold">{totals.found}</span> found ·{" "}
        <span className="font-display text-2xl font-bold tabular-nums text-white">{totals.unclaimed}</span> still out
        there
        {totals.total > 0 ? ` · ${totals.total} one-of-one${totals.total === 1 ? "" : "s"} this season` : ""}
      </p>

      <section aria-labelledby="vault-found" className="flex flex-col gap-4">
        <h2 id="vault-found" className="type-display text-2xl">
          Found
        </h2>
        {vault.found.length === 0 ? (
          <p className="text-sm text-steel">
            Nobody has pulled one yet. Every crowned print below is still a one-of-one waiting to happen.
          </p>
        ) : (
          <div className="grid gap-8 sm:grid-cols-2 xl:grid-cols-3">
            {vault.found.map((copy) => (
              <FoundCard key={copy.inventoryId} copy={copy} />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="vault-open" className="flex flex-col gap-4">
        <h2 id="vault-open" className="type-display text-2xl">
          Still out there
        </h2>
        {weeks.length === 0 ? (
          <p className="text-sm text-steel">
            {season
              ? "Every crowned print this season has been claimed. The next five enter the pool with Tuesday's edition."
              : "No season is set up yet — the board fills in with the first edition."}
          </p>
        ) : (
          <div className="flex flex-col gap-5">
            {weeks.map((week) => (
              <div key={week.editionWeek} className="flex flex-col gap-2">
                <span className="label-dash">
                  {editionLabel(week.editionWeek)} · {week.prints.length} open
                </span>
                <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {week.prints.map((print) => (
                    <li
                      key={`${week.editionWeek}-${print.slug}`}
                      className="card-brand flex flex-wrap items-center gap-2 p-3"
                    >
                      <Link
                        href={`/card/${print.slug}`}
                        className="text-sm font-semibold text-white underline-offset-4 hover:text-coral hover:underline"
                      >
                        {print.playerName}
                      </Link>
                      <span className="text-xs text-steel">
                        {print.role} · {tierLabel(print.tier)}
                      </span>
                      {print.mintsSigned ? <Chip gold>Mints signed</Chip> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

export default async function VaultPage() {
  return VaultPageView({ league: "premier" });
}
