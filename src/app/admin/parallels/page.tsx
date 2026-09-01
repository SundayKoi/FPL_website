import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { fetchStaffTier } from "@/lib/auth/staffTier";
import { createServerSupabase } from "@/lib/supabase/server";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import {
  fetchAllCardSeasons,
  fetchCardEditionWeeks,
  fetchCurrentWeekCards,
  fetchEditionCards,
} from "@/lib/cards/queries";
import { ALL_FOIL_TYPES, FOIL_TYPE_LABELS, FOIL_TYPE_WEIGHTS, FOIL_CHANCE } from "@/lib/packs/config";
import PlayerCard3D from "@/components/cards/PlayerCard3D";

export const metadata: Metadata = {
  title: "Parallels — FPL Admin",
};

/** How many players the wall shows. Five parallels each, so this is
 *  already twenty cards of 3D layers; more is a slideshow, not a review. */
const PLAYERS = 3;

/**
 * PREVIEW ONLY. A staff-gated look at every parallel on REAL cards from
 * the current edition — same PlayerCard3D, same foil layers, same art the
 * shop renders. Nothing here mints and nothing is written.
 *
 * Eclipse (the proposed one-of-one) renders here because it is a real
 * FoilType. It is NOT in FOIL_TYPES, so rollFoilType has no weight to draw
 * it and no pack can produce one — the guarantee is structural, not a
 * setting. How a 1/1 would actually be awarded is undecided.
 */
export default async function ParallelsPreviewPage() {
  const supabase = await createServerSupabase();
  const { isAdmin, isOwner } = await fetchStaffTier(supabase);
  if (!isAdmin && !isOwner) redirect("/admin");

  const service = createBettingServiceClient();
  const seasons = await fetchAllCardSeasons(service);
  const season = seasons.find((entry) => entry.league === "premier")?.season ?? seasons[0]?.season ?? null;

  // The archive first, the live build as the fallback — the same pairing
  // openPackFor uses, so these are the cards a pack would actually mint.
  const weeks = season ? await fetchCardEditionWeeks(service, season) : [];
  const cards = season
    ? weeks[0]
      ? await fetchEditionCards(service, season, weeks[0])
      : await fetchCurrentWeekCards(service, season)
    : [];

  // Best first: a parallel is being judged on how it sits over real art,
  // and the top of the collection is where anyone would want to see it.
  const featured = [...cards].sort((a, b) => b.overall - a.overall).slice(0, PLAYERS);

  const oddsOf = (type: (typeof ALL_FOIL_TYPES)[number]): string => {
    const weights = FOIL_TYPE_WEIGHTS as Partial<Record<string, number>>;
    const weight = weights[type];
    if (weight === undefined) return "cannot be pulled";
    const total = Object.values(FOIL_TYPE_WEIGHTS).reduce((sum, value) => sum + value, 0);
    return `${((weight / total) * FOIL_CHANCE * 100).toFixed(2)}% per card`;
  };

  return (
    <main className="bg-hash mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-10 px-6 py-16">
      <header className="flex flex-col gap-2">
        <Link href="/admin" className="label-dash w-fit hover:text-coral">
          ← Admin
        </Link>
        <h1 className="type-display text-4xl sm:text-5xl">Parallels</h1>
        <p className="max-w-3xl text-sm text-steel">
          Every parallel on real cards from{" "}
          {weeks[0] ? `the ${weeks[0]} edition` : "the live build"}, through the same component the shop
          renders. Hover a card — the foils answer the pointer here exactly as they do in a pack.
        </p>
        <p className="max-w-3xl text-sm text-coral">
          Preview only. Nothing on this page mints, prices or writes anything. Eclipse is not in{" "}
          <code className="font-mono text-xs">FOIL_TYPES</code>, so no roll can draw one — a pack cannot
          produce it even by accident.
        </p>
      </header>

      {featured.length === 0 ? (
        <p className="text-sm text-steel">No cards in the current edition to preview.</p>
      ) : (
        ALL_FOIL_TYPES.map((type) => (
          <section key={type} aria-label={FOIL_TYPE_LABELS[type]} className="flex flex-col gap-4">
            <div className="flex flex-wrap items-baseline gap-3 border-b border-line pb-2">
              <h2 className={`type-display text-2xl ${type === "eclipse" ? "text-gold" : ""}`}>
                {FOIL_TYPE_LABELS[type]}
              </h2>
              <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-steel">
                {oddsOf(type)}
              </span>
              {type === "eclipse" ? (
                <span className="rounded-full border border-gold/50 bg-gold/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-gold">
                  ★ proposed · one of one
                </span>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-6">
              {featured.map((card) => (
                <div key={`${type}-${card.slug}`} className="flex flex-col items-center gap-2">
                  <PlayerCard3D card={card} interactive forceFoil foilType={type} />
                  <span className="text-xs text-steel">
                    {card.name} · {card.overall} {card.tier.label}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ))
      )}
    </main>
  );
}
