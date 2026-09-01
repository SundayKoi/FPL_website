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
import {
  ALL_FOIL_TYPES,
  ECLIPSE_CHANCE,
  ECLIPSE_FOIL_TYPE,
  FOIL_TYPE_LABELS,
  FOIL_TYPE_WEIGHTS,
  FOIL_CHANCE,
} from "@/lib/packs/config";
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
 * Eclipse is now mintable, and the page has to say so: it once claimed a
 * pack could not produce one, which was true when it was written and became
 * a lie the day the drop rate landed. A preview that misstates the odds is
 * worse than no preview, because it is the page staff check the odds ON.
 *
 * It also only falls on a Card of the Week, so its section features one —
 * showing it over three arbitrary top-rated cards would misrepresent the
 * rule the whole parallel hangs on.
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

  // Cards of the Week — the top card in each role, and the only cards an
  // Eclipse can fall on. Falls back to the featured three if an archived
  // edition predates the flag, so the section is never empty.
  const crowned = cards.filter((card) => card.standout);
  const eclipseFeatured = (crowned.length > 0 ? crowned : featured)
    .sort((a, b) => b.overall - a.overall)
    .slice(0, PLAYERS);

  const oddsOf = (type: (typeof ALL_FOIL_TYPES)[number]): string => {
    if (type === ECLIPSE_FOIL_TYPE) {
      // Derived, never typed: the gate is ~2-4% of slots depending on how
      // top-heavy the league is, so the honest answer is a range.
      const perPack = (gate: number) => 1 - (1 - gate * ECLIPSE_CHANCE) ** 5;
      const rarest = Math.round(1 / perPack(0.021));
      const likeliest = Math.round(1 / perPack(0.044));
      return `${(ECLIPSE_CHANCE * 100).toFixed(2)}% of Card-of-the-Week pulls · ~1 in ${likeliest.toLocaleString()}–${rarest.toLocaleString()} packs`;
    }
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
          Preview only. Nothing on this page mints, prices or writes anything.
        </p>
        <p className="max-w-3xl text-sm text-steel">
          Eclipse is live. It falls only on a <strong className="text-gold">Card of the Week</strong> —
          the top card in each role — at{" "}
          <code className="font-mono text-xs">{(ECLIPSE_CHANCE * 100).toFixed(2)}%</code> of those pulls,
          and only one of each print can ever exist (a unique index enforces it, not the roller). It
          cannot be dusted; it can be traded. An unclaimed one stays claimable forever through that
          week&apos;s packs.
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
              {type === ECLIPSE_FOIL_TYPE ? (
                <span className="rounded-full border border-gold/50 bg-gold/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-gold">
                  ★ one of one · Card of the Week only
                </span>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-6">
              {(type === ECLIPSE_FOIL_TYPE ? eclipseFeatured : featured).map((card) => (
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
