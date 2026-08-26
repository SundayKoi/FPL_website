import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { fetchStaffTier } from "@/lib/auth/staffTier";
import { CHAMPIONS_SEASON, CHAMPIONS_SET, CHAMPIONS_TEAM, championToCard } from "@/lib/cards/champions";
import ChampionsCard from "@/components/cards/ChampionsCard";
import PlayerCard3D from "@/components/cards/PlayerCard3D";

export const metadata: Metadata = {
  title: "The Faceless Drop — FPL Admin",
};

/**
 * PREVIEW ONLY. Owner-gated look at the Dealer's Hand with real splash
 * art, foil layers, and ink — nothing here mints, and no pack sells these
 * yet. The drop mechanics ship separately once the look is signed off.
 */
export default async function ChampionsPreviewPage() {
  const supabase = await createServerSupabase();
  const { isOwner } = await fetchStaffTier(supabase);
  if (!isOwner) redirect("/admin");

  // The Faceless mark, from the draft-side teams table (any season's row
  // that carries art — S4's should). Garnish contract: a miss just leaves
  // the spade pip in the center, never a hole.
  const { data: teamRows } = await supabase
    .from("teams")
    .select("name, image_url")
    .ilike("name", "%faceless%");
  const logo =
    ((teamRows as { name: string; image_url: string | null }[]) ?? []).find((row) => row.image_url)?.image_url ??
    null;

  // Season here only labels the future copies' shelf; preview renders the
  // same either way.
  const cards = CHAMPIONS_SET.map((def) => ({ ...championToCard(def, "S5"), teamImageUrl: logo }));
  const queen = cards.find((card) => card.champWin?.rank === "Q") ?? cards[0];

  return (
    <main className="bg-hash mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-10 px-6 py-16">
      <header>
        <span className="label-dash">OWNERS ONLY · PREVIEW — NOT PULLABLE</span>
        <h1 className="type-display mt-3 text-4xl sm:text-5xl">The Faceless Drop</h1>
        <p className="mt-2 max-w-[62ch] text-sm text-steel">
          {CHAMPIONS_TEAM} — {CHAMPIONS_SEASON} champions, printed as the Dealer&apos;s Hand. Real splash art, the
          production foil layers, and the ink placement. Nothing mints from this page; the pack drop ships after
          sign-off.
        </p>
      </header>

      <section aria-label="The Hand" className="flex flex-wrap justify-center gap-6 sm:justify-start">
        {cards.map((card) => (
          <PlayerCard3D key={card.slug} card={card} />
        ))}
      </section>

      <section aria-label="Luck rolls" className="flex flex-col gap-4">
        <h2 className="type-display text-2xl">Foiled &amp; signed</h2>
        <p className="max-w-[62ch] text-sm text-steel">
          The Q♠ through every parallel, plus the autograph — the same overlays and odds machinery player cards
          use will apply when the drop goes live.
        </p>
        <div className="flex flex-wrap gap-6">
          {(["prisma", "aurora", "refractor", "ice"] as const).map((type) => (
            <figure key={type} className="flex w-60 flex-col items-center gap-2">
              <ChampionsCard card={queen} foil foilType={type} />
              <figcaption className="text-xs uppercase tracking-[0.16em] text-steel">{type}</figcaption>
            </figure>
          ))}
          <figure className="flex w-60 flex-col items-center gap-2">
            <ChampionsCard card={queen} signed />
            <figcaption className="text-xs uppercase tracking-[0.16em] text-steel">autographed</figcaption>
          </figure>
        </div>
      </section>
    </main>
  );
}
