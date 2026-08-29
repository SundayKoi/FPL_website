// The heavy half of the pack shop page: the shelf, the roster sets and the
// binder editor.
//
// Its own async component so it can be suspended. The shop above it — the
// balance, the buy buttons, the drop banners — needs nothing from a
// collection except which slugs are in it, and that is a twenty-byte-a-row
// question the page now asks separately. Held together, the shop waited on
// a read that ships every copy a collector owns with its frozen card json;
// split, the shop paints and is clickable while the shelf is still coming.
//
// Everything here reads through the service client, as the page does: none
// of these tables has a public read policy, and the Discord id came from
// the session.

import Link from "next/link";
import BinderEditor, { type BinderOption } from "@/components/cards/BinderEditor";
import CollectionGrid from "@/components/cards/CollectionGrid";
import TeamSetsSection from "@/components/cards/TeamSetsSection";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import { buildWeekSets } from "@/lib/cards/sets";
import { fetchSetClaimState, fetchSetEditionCards, setKey } from "@/lib/cards/setQueries";
import { fetchDeployedCopyIds } from "@/lib/expeditions/queries";
import { fetchInventory } from "@/lib/packs/queries";
import { binderSlotsFor, type Binder } from "@/lib/binder/queries";

export default async function CollectionSections({
  discordId,
  season,
  base,
  binder,
  patron,
  flame,
  setWeek,
}: {
  discordId: string;
  /** Null before a season is configured — there is no shelf to show. */
  season: string | null;
  /** "/cards" or "/academy/cards", for the in-league links. */
  base: string;
  binder: Binder | null;
  patron: boolean;
  flame: string | null;
  /** ?setWeek= — which edition the roster sets open on. */
  setWeek?: string;
}) {
  const service = createBettingServiceClient();
  const inventory = season ? await fetchInventory(service, discordId, season) : [];

  // Both need the collection, so they start together once it lands.
  const heldWeeks = [...new Set(inventory.map((copy) => copy.editionWeek))].sort().reverse();
  const [deployedIds, setReads] = await Promise.all([
    // Season-blind, because the deploy lock is a property of the card — and
    // fails soft to "none deployed" where the expeditions migration hasn't
    // been applied.
    fetchDeployedCopyIds(service, discordId),
    season && heldWeeks.length > 0
      ? Promise.all([
          fetchSetEditionCards(service, season, heldWeeks),
          fetchSetClaimState(service, discordId, season, inventory.map((copy) => copy.id)),
        ])
      : Promise.resolve([
          [] as Awaited<ReturnType<typeof fetchSetEditionCards>>,
          { claimed: new Set<string>(), spent: new Set<number>() },
        ] as const),
  ]);
  const [setEditionCards, setClaims] = setReads;

  // Slots are 1-indexed in the table and positional in the editor.
  // Patrons shelve nine; everyone else six (binderSlotsFor).
  const binderSlots: (number | null)[] = Array.from({ length: binderSlotsFor(patron) }, (_, index) => {
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

  // EVERY held week's sets, not just the one being viewed: the week switch
  // is local state, and computing them all here is what lets it be.
  const editionsByWeek = new Map<string, Awaited<ReturnType<typeof fetchSetEditionCards>>>();
  for (const card of setEditionCards) {
    const list = editionsByWeek.get(card.editionWeek) ?? [];
    list.push(card);
    editionsByWeek.set(card.editionWeek, list);
  }
  // A set already paid for has had its five copies spent, so buildWeekSets
  // no longer reads it as complete — the claimed names travel separately so
  // the row can say "Claimed" rather than quietly reverting to 0/5 and
  // looking like the cards went missing.
  const setsByWeek = heldWeeks.map((held) => {
    const sets = buildWeekSets(editionsByWeek.get(held) ?? [], inventory, held, setClaims.spent);
    return {
      week: held,
      sets,
      claimed: sets.filter((set) => setClaims.claimed.has(setKey(held, set.teamName))).map((set) => set.teamName),
    };
  });
  const activeSetWeek = setWeek && heldWeeks.includes(setWeek) ? setWeek : heldWeeks[0];

  return (
    <>
      <section id="collection" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 className="type-display text-2xl sm:text-3xl">Your collection</h2>
          <Link href={`${base}/trades`} className="text-xs text-steel underline-offset-4 hover:text-coral hover:underline">
            Trading post →
          </Link>
          <a href="#binder" className="text-xs text-steel underline-offset-4 hover:text-coral hover:underline">
            Your binder →
          </a>
          <a href="#team-sets" className="text-xs text-steel underline-offset-4 hover:text-coral hover:underline">
            Roster sets →
          </a>
        </div>
        <CollectionGrid
          inventory={inventory}
          pinnedIds={binderSlots.filter((id): id is number => id !== null)}
          flame={flame}
          deployedIds={deployedIds}
        />
      </section>

      {season && activeSetWeek ? (
        <TeamSetsSection season={season} initialWeek={activeSetWeek} weeks={setsByWeek} />
      ) : null}

      {binder ? (
        <BinderEditor slots={binderSlots} options={binderOptions} token={binder.token} title={binder.title} />
      ) : null}
    </>
  );
}

/** What stands in while the shelf loads. Shaped like the section it
 *  replaces so the page does not jump when the real one arrives. */
export function CollectionSectionsFallback() {
  return (
    <section id="collection" className="flex flex-col gap-4">
      <h2 className="type-display text-2xl sm:text-3xl">Your collection</h2>
      <p className="text-sm text-steel">Pulling your shelf together…</p>
      <div aria-hidden className="flex flex-wrap justify-center gap-x-0 gap-y-4">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="card-cell">
            <div className="h-[28rem] w-80 animate-pulse rounded-2xl border border-line bg-panel/60" />
          </div>
        ))}
      </div>
    </section>
  );
}
