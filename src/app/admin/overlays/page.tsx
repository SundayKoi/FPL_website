import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import PlayerCard3D from "@/components/cards/PlayerCard3D";
import { fetchStaffTier } from "@/lib/auth/staffTier";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import { fetchAllCardSeasons, fetchCardEditionWeeks, fetchCurrentWeekCards, fetchEditionCards } from "@/lib/cards/queries";
import { OVERLAY_GROUP_TITLES, OVERLAY_MOCKUPS, type OverlayMockup } from "@/lib/cards/overlayMockups";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Card overlays — FPL Admin",
};

/** A borrowed signature for the ink mockup — an SVG scrawl, not anyone's
 *  real autograph. The real treatment animates the player's own ink. */
const MOCK_INK =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 220 70'><path d='M8 48 C 30 5, 44 62, 62 30 S 92 8, 104 40 S 128 66, 146 28 S 176 12, 190 44 C 198 56, 206 50, 214 36' fill='none' stroke='white' stroke-width='3' stroke-linecap='round'/><path d='M60 58 C 100 52, 150 54, 200 50' fill='none' stroke='white' stroke-width='1.6' stroke-linecap='round'/></svg>`,
  );

const GROUPS: OverlayMockup["group"][] = ["tilt", "data", "reactive", "chase"];

/**
 * PREVIEW ONLY. Staff only. Proposed overlays beyond the foil ladder,
 * drawn on REAL cards from the current edition through the same
 * PlayerCard3D the shop renders. The layers are CSS no minted copy can
 * reach (`overlay` is a prop only this page passes); nothing is written.
 * Hover a card — the tilt-driven ones answer the pointer.
 */
export default async function OverlaysPreviewPage() {
  const supabase = await createServerSupabase();
  const { isAdmin, isOwner } = await fetchStaffTier(supabase);
  if (!isAdmin && !isOwner) redirect("/admin");

  const service = createBettingServiceClient();
  const seasons = await fetchAllCardSeasons(service);
  const season = seasons.find((entry) => entry.league === "premier")?.season ?? seasons[0]?.season ?? null;
  const weeks = season ? await fetchCardEditionWeeks(service, season) : [];
  const cards = season
    ? weeks[0]
      ? await fetchEditionCards(service, season, weeks[0])
      : await fetchCurrentWeekCards(service, season)
    : [];
  const featured = [...cards].sort((a, b) => b.overall - a.overall).slice(0, 2);

  return (
    <main className="bg-hash mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-12 px-6 py-16">
      <header className="flex flex-col gap-3">
        <Link href="/admin" className="label-dash w-fit hover:text-coral">
          ← Admin
        </Link>
        <h1 className="type-display text-4xl sm:text-5xl">Card overlays</h1>
        <p className="max-w-3xl text-sm text-steel">
          Thirteen proposed treatments beyond the foil ladder, on real cards from{" "}
          {weeks[0] ? `the ${weeks[0]} edition` : "the live build"}, through the same component the shop renders.
          Hover a card — the tilt-driven ones answer the pointer; click one to see its back.
        </p>
        <p className="max-w-3xl text-sm text-gold">
          Preview only. Nothing on this page mints, prices or writes anything, and no minted copy can wear these
          layers. Each card says how it would be earned if it shipped.
        </p>
      </header>

      {featured.length === 0 ? (
        <p className="text-sm text-steel">No cards in the current edition to preview.</p>
      ) : (
        GROUPS.map((group) => (
          <section key={group} aria-label={OVERLAY_GROUP_TITLES[group]} className="flex flex-col gap-6">
            <h2 className="type-display border-b border-line pb-2 text-2xl">{OVERLAY_GROUP_TITLES[group]}</h2>
            {OVERLAY_MOCKUPS.filter((entry) => entry.group === group).map((entry) => (
              <div key={entry.key} data-testid={`overlay-${entry.key}`} className="flex flex-col gap-4 lg:flex-row lg:items-start">
                <div className="flex flex-wrap gap-6">
                  {featured.map((card, index) => (
                    <div key={`${entry.key}-${card.slug}`} className="flex flex-col items-center gap-2">
                      <PlayerCard3D
                        card={entry.ink ? { ...card, autograph: MOCK_INK } : card}
                        interactive
                        forceFoil={entry.foil || index === 1}
                        foilType={entry.foil || index === 1 ? "prisma" : null}
                        overlay={entry}
                      />
                      <span className="text-xs text-steel">
                        {card.name} · {card.overall} {card.tier.label}
                        {entry.foil || index === 1 ? " · on a foil" : ""}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="card-brand flex max-w-md flex-col gap-2 p-4">
                  <h3 className="type-display text-xl" style={{ color: entry.accent }}>
                    {entry.title}
                  </h3>
                  <p className="text-sm text-white">{entry.blurb}</p>
                  <p className="text-xs text-steel">
                    <b className="text-white">How it&apos;s earned:</b> {entry.earn}
                  </p>
                  {entry.back?.length ? <p className="text-xs text-gold">Click the card to flip it — this one lives on the back.</p> : null}
                </div>
              </div>
            ))}
          </section>
        ))
      )}
    </main>
  );
}
