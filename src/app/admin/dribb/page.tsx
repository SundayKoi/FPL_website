import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import PlayerCard3D from "@/components/cards/PlayerCard3D";
import { fetchStaffTier } from "@/lib/auth/staffTier";
import { AETHER_VARIANTS, DRIBB_COPIES, DRIBB_LOOKS, DRIBB_RATES, dribbPacksPerPull } from "@/lib/cards/dribbMockups";
import { sampleCard } from "@/lib/cards/samples";
import { ECLIPSE_CHANCE, PACK_SIZE, SECRET_CHANCE } from "@/lib/packs/config";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "The Dribb card — FPL Admin",
};

/** Dribb as the chase print would freeze him: a 99 in every column, on
 *  Bard, one of five. The renderer prints serial / collection size as
 *  "1 of 5", which is the whole pitch on one line. */
function dribb() {
  return { ...sampleCard(), serial: 1, collectionSize: DRIBB_COPIES, motto: "Five, and no more." };
}

const oneIn = (rate: number) => `1 in ${Math.round(1 / rate).toLocaleString("en-US")}`;

/**
 * PREVIEW ONLY. Staff only. Four looks for a five-copy Dribb chase card,
 * drawn on the made-up card the rarities page uses, through the same
 * PlayerCard3D the shop renders. The layers are CSS no minted copy can
 * reach (`overlay` is a prop only the admin mockup pages pass); nothing
 * is written. Hover a card — the tilt-driven ones answer the pointer.
 */
export default async function DribbPreviewPage() {
  const supabase = await createServerSupabase();
  const { isAdmin, isOwner } = await fetchStaffTier(supabase);
  if (!isAdmin && !isOwner) redirect("/admin");
  const card = dribb();

  return (
    <main className="bg-hash mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-12 px-6 py-16">
      <header className="flex flex-col gap-3">
        <Link href="/admin" className="label-dash w-fit hover:text-coral">
          ← Admin
        </Link>
        <h1 className="type-display text-4xl sm:text-5xl">The Dribb card</h1>
        <p className="max-w-3xl text-sm text-steel">
          A chase print that is not a player: Dribb, 99 overall, a 99 in every column, on Bard, and only{" "}
          {DRIBB_COPIES} will ever exist. {DRIBB_LOOKS.length} looks below, each on the same card and never on a foil — a unique print has no
          parallel to wear — through the component the shop renders. Hover a card — the tilt-driven ones answer the pointer; click one for its back.
        </p>
        <p className="max-w-3xl text-sm text-gold">
          Preview only. Nothing on this page mints, prices or writes anything, and no minted copy can wear these
          layers. Pick a look and it ships with a stamp of its own, a counter capped at {DRIBB_COPIES}, and a gate
          in the roller. Below the four, {AETHER_VARIANTS.length} pushes on Aether — the shimmer and the split art,
          each with one more thing.
        </p>
      </header>

      <section aria-label="The odds" className="card-brand flex flex-col gap-3 p-5">
        <h2 className="type-display text-2xl">The odds on the table</h2>
        <p className="text-sm text-steel">
          Rolled once per card slot, like a Secret, on every pack in every week&apos;s edition — a {PACK_SIZE}-card
          pack is {PACK_SIZE} rolls. For scale, a Secret is {oneIn(SECRET_CHANCE)} cards and an Eclipse is{" "}
          {oneIn(ECLIPSE_CHANCE)} Cards of the Week.
        </p>
        <table className="w-full max-w-xl border-collapse text-left text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-[0.14em] text-steel">
              <th className="py-2 pr-3 font-semibold">Per card</th>
              <th className="py-2 pr-3 font-semibold">One Dribb every</th>
              <th className="py-2 font-semibold">All {DRIBB_COPIES} found after</th>
            </tr>
          </thead>
          <tbody>
            {DRIBB_RATES.map((rate) => (
              <tr key={rate} className="border-t border-line/70">
                <td className="py-2 pr-3 font-mono text-gold">{oneIn(rate)}</td>
                <td className="py-2 pr-3 font-mono text-white">{dribbPacksPerPull(rate).toLocaleString("en-US")} packs</td>
                <td className="py-2 font-mono text-white">{(dribbPacksPerPull(rate) * DRIBB_COPIES).toLocaleString("en-US")} packs</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-steel">
          Once the {DRIBB_COPIES}th is found the gate closes for good; every copy is announced the moment it is
          pulled, numbered in the order it was found. It never dusts, never leaves a collection except by trade,
          and is a relic on expeditions.
        </p>
      </section>

      {[...DRIBB_LOOKS, ...AETHER_VARIANTS].map((look, index) => (
        <section key={look.key} data-testid={`dribb-${look.key}`} aria-label={look.title} className={`flex flex-col gap-4 lg:flex-row lg:items-start ${index === DRIBB_LOOKS.length ? "border-t border-line pt-10" : ""}`}>
          {/* One card, no foil: a unique print has no parallel to wear, so
              the look IS the finish. */}
          <div className="flex flex-col items-center gap-2">
            <PlayerCard3D card={card} interactive overlay={look} />
            <span className="text-xs text-steel">{look.title} · the only finish it comes in</span>
          </div>
          <div className="card-brand flex max-w-md flex-col gap-2 p-4">
            <h3 className="type-display text-xl" style={{ color: look.accent }}>
              {look.title}
            </h3>
            <p className="text-sm text-white">{look.blurb}</p>
            <p className="text-xs text-steel">
              <b className="text-white">In motion:</b> {look.motion}
            </p>
          </div>
        </section>
      ))}
    </main>
  );
}
