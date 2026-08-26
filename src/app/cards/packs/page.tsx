import type { Metadata } from "next";
import Link from "next/link";
import CardsLeagueToggle from "@/components/cards/CardsLeagueToggle";
import BinderEditor, { type BinderOption } from "@/components/cards/BinderEditor";
import CollectionGrid from "@/components/cards/CollectionGrid";
import PackShop from "@/components/cards/PackShop";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import { getBettingUser } from "@/lib/betting/wallet";
import { fetchCardEditionWeeks, fetchCardSeason, type CardLeague } from "@/lib/cards/queries";
import { PACK_COST, PACK_SIZE } from "@/lib/packs/config";
import { fetchDailyRipStatus, fetchInventory, fetchPackOpenCount, type DailyRipStatus, type InventoryRow } from "@/lib/packs/queries";
import { BINDER_SLOTS, fetchOrCreateOwnBinder, type Binder } from "@/lib/binder/queries";

export const metadata: Metadata = {
  title: "Card Packs — FPL",
  description: "Spend betting dollars on packs of player cards and build a collection.",
};

const LEAGUE_LABELS: Record<CardLeague, string> = { premier: "Premier", academy: "Academy" };

/**
 * The pack counter and the collection it fills. Gated on FPL Better rather
 * than the premium card role — packs are bought with betting dollars, so the
 * wallet is the thing you need — which is why this page reads
 * getBettingUser() instead of drafterAccess() like the rest of /cards.
 *
 * Inventory reads go through the service client: card_inventory has no
 * public RLS policy (src/lib/packs/queries.ts), and the Discord id is taken
 * from the session, so nobody can ask for someone else's shelf.
 */
export async function PacksPageView({ league = "premier" }: { league?: CardLeague }) {
  const base = league === "academy" ? "/academy/cards" : "/cards";
  const user = await getBettingUser();

  if (!user) {
    return (
      <main className="bg-hash flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
        <span className="label-dash">Card packs</span>
        <h1 className="type-display text-3xl sm:text-4xl">Sign in to open packs</h1>
        <p className="max-w-md text-sm text-steel">
          Packs are bought with betting dollars, so they ride on your FPL Better wallet — sign in with
          Discord to check your access.
        </p>
        <Link href={`/login?redirect=${base}/packs`} className="btn-pill mt-2">
          Sign in with Discord
        </Link>
      </main>
    );
  }

  if (!user.allowed) {
    return (
      <main className="bg-hash flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
        <span className="label-dash">Card packs</span>
        <h1 className="type-display text-3xl sm:text-4xl">FPL Better members only</h1>
        <p className="max-w-md text-sm text-steel">
          Packs are paid for with betting dollars, and only FPL Better members have a wallet to spend.
          Join the FPL Better role in Discord and come back to start a collection.
        </p>
      </main>
    );
  }

  const service = createBettingServiceClient();
  const season = await fetchCardSeason(service, league);
  const [inventory, openCount, editionWeeks, binder, dailyRip]: [InventoryRow[], number, string[], Binder | null, DailyRipStatus] = season
    ? await Promise.all([
        fetchInventory(service, user.discordId, season),
        fetchPackOpenCount(service, user.discordId, season),
        fetchCardEditionWeeks(service, season),
        // null when the card_binders migration hasn't been applied here —
        // the section is skipped rather than 500ing the whole page.
        fetchOrCreateOwnBinder(service, user.discordId),
        fetchDailyRipStatus(service, user.discordId),
      ])
    : [[], 0, [], null, { left: 0, patron: false, flame: null }];
  const ownedSlugs = [...new Set(inventory.map((row) => row.slug))];
  // Slots are 1-indexed in the table and positional in the editor.
  const binderSlots: (number | null)[] = Array.from({ length: BINDER_SLOTS }, (_, index) => {
    return binder?.cards.find((entry) => entry.slot === index + 1)?.inventoryId ?? null;
  });
  const binderOptions: BinderOption[] = inventory.map((row) => ({
    inventoryId: row.id,
    playerName: row.playerName,
    editionWeek: row.editionWeek,
    tier: row.tier,
    foil: row.foil,
    signed: row.signed,
  }));

  return (
    <main className="bg-hash mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-8 px-4 py-10 text-white sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="label-dash">
            Premium · {LEAGUE_LABELS[league]} · Season {season ?? "—"}
          </span>
          <h1 className="type-display mt-2 text-4xl sm:text-5xl">Card Packs</h1>
          <p className="mt-3 max-w-2xl text-sm text-steel">
            Packs cost betting dollars and contain {PACK_SIZE} player cards, each frozen at this week&apos;s
            ratings — every card is stamped with the week it was pulled, so a player you open twice in
            different weeks is two different prints. Every copy comes printed in a random skin of that
            player&apos;s signature champion, and foils are a rare pull on any tier.
          </p>
          <Link href={base} className="mt-3 inline-block text-xs text-steel underline-offset-4 hover:text-coral hover:underline">
            ← Back to player cards
          </Link>
        </div>
        <CardsLeagueToggle league={league} suffix="/packs" />
      </header>

      <PackShop
        league={league}
        balance={user.balance}
        packCost={PACK_COST}
        openCount={openCount}
        // What's already on the shelf, so the opening can mark a pull NEW.
        // Slugs only: the overlay asks "do I own this player at all", which
        // an inventory row's own slug answers without shipping the cards.
        ownedSlugs={ownedSlugs}
        // Every archived week stays on sale, so a card from an earlier week
        // is always still obtainable.
        editionWeeks={editionWeeks}
        dailyRipsLeft={dailyRip.left}
        patron={dailyRip.patron}
        flame={dailyRip.flame}
      />

      <section id="collection" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 className="type-display text-2xl sm:text-3xl">Your collection</h2>
          <Link href={`${base}/trades`} className="text-xs text-steel underline-offset-4 hover:text-coral hover:underline">
            Trading post →
          </Link>
          <a href="#binder" className="text-xs text-steel underline-offset-4 hover:text-coral hover:underline">
            Your binder →
          </a>
        </div>
        <CollectionGrid inventory={inventory} pinnedIds={binderSlots.filter((id): id is number => id !== null)} flame={dailyRip.flame} />
      </section>

      {binder ? (
        <BinderEditor slots={binderSlots} options={binderOptions} token={binder.token} title={binder.title} />
      ) : null}
    </main>
  );
}

export default async function PacksPage() {
  return PacksPageView({ league: "premier" });
}
