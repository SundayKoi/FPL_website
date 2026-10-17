import type { Metadata } from "next";
import Link from "next/link";
import { OffseasonCardShelf } from "@/components/offseason/OffseasonCards";
import PackOpener from "@/components/offseason/PackOpener";
import { Empty, OffseasonShell, Panel } from "@/components/offseason/ui";
import { loadOffseasonPage } from "@/lib/offseason/page";
import { loadPackShop, SHELF_LIMIT } from "@/lib/offseason/packShop";
import { ODDS, PACK_PRICE, PACK_SIZE, WEEKLY_ALLOWANCE } from "@/lib/offseason/packs";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Offseason Packs — FPL",
  description: "Open packs of the offseason tournament's cards, a fresh set every week.",
};

const oneIn = (chance: number) => `1 in ${Math.round(1 / chance)}`;

export default async function OffseasonPacksPage() {
  const { view, userId, isStaff } = await loadOffseasonPage();
  const shop = await loadPackShop(await createServerSupabase(), view?.event ?? null, userId);

  return (
    <OffseasonShell
      eyebrow={view?.event.name ?? "FPL Offseason"}
      title="Packs"
      active="packs"
      isStaff={isStaff}
      description={
        <>
          The tournament&apos;s own cards, a fresh set every week. Everyone gets ${WEEKLY_ALLOWANCE.toLocaleString("en-US")} a week to
          spend here, and it resets on Monday. A pack is ${PACK_PRICE} for {PACK_SIZE} different players. These cards stay here; they
          don&apos;t go into your league collection.
        </>
      }
    >
      <Panel title="Open packs" aside={shop.set ? `Week ${shop.set.weekNumber} set · ${shop.set.size} cards` : "No set yet"}>
        <div className="flex flex-col gap-4">
          <p className="text-xs text-muted">
            Each card can come out foil ({oneIn(ODDS.foil)}), shiny ({oneIn(ODDS.shiny)}) or signed ({oneIn(ODDS.signed)}, only players
            who have a saved autograph, and always foil).
          </p>
          {!shop.set ? (
            <Empty>The first set drops once week 1&apos;s games are in.</Empty>
          ) : !userId ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted">Sign in with Discord to open packs.</p>
              <Link href="/login?redirect=/offseason/packs" className="btn-pill self-start text-sm">
                Sign in
              </Link>
            </div>
          ) : (
            <PackOpener remaining={shop.remaining} />
          )}
        </div>
      </Panel>

      {userId ? (
        <Panel title="Your offseason cards" aside={`${shop.owned} owned`}>
          {shop.copies.length === 0 ? (
            <Empty>Cards you pull show up here.</Empty>
          ) : (
            <div className="flex flex-col gap-3">
              {shop.owned > SHELF_LIMIT ? <p className="text-xs text-muted">Showing your latest {SHELF_LIMIT}.</p> : null}
              <OffseasonCardShelf copies={shop.copies} />
            </div>
          )}
        </Panel>
      ) : null}
    </OffseasonShell>
  );
}
