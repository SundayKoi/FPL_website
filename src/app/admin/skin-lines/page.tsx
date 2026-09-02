import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import PlayerCard3D from "@/components/cards/PlayerCard3D";
import { fetchStaffTier } from "@/lib/auth/staffTier";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import { fetchAllCardSeasons, fetchCardEditionWeeks, fetchCurrentWeekCards, fetchEditionCards } from "@/lib/cards/queries";
import {
  EXAMPLE_SEASON_SET,
  LINE_TIERS,
  SKIN_LINES,
  lineTierLabel,
  skinLineByKey,
  type LineTier,
  type SkinLine,
} from "@/lib/cards/skinLines";
import { FOIL_CHANCE, FOIL_TYPE_LABELS, FOIL_TYPE_WEIGHTS, FOIL_TYPES } from "@/lib/packs/config";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Skin-line parallels — FPL Admin",
};

/** Two players: enough to judge a look over two different pieces of art,
 *  few enough that six lines at four tiers each is not a slideshow. The
 *  candidate sections alternate between them. */
const PLAYERS = 2;

const WEIGHT_TOTAL = FOIL_TYPES.reduce((sum, type) => sum + FOIL_TYPE_WEIGHTS[type], 0);

/** How often a foil lands on this tier, per card — the rate of the
 *  parallel it replaces, unchanged. */
function oddsOfTier(tier: LineTier): string {
  return `${((FOIL_TYPE_WEIGHTS[tier.replaces] / WEIGHT_TOTAL) * FOIL_CHANCE * 100).toFixed(2)}% per card`;
}

/** One in how many foils. */
function oneIn(tier: LineTier): string {
  return `1 in ${Math.round(WEIGHT_TOTAL / FOIL_TYPE_WEIGHTS[tier.replaces])} foils`;
}

function previewOf(line: SkinLine, tier: LineTier) {
  return {
    label: lineTierLabel(line, tier),
    className: line.className,
    blend: line.blend,
    accent: line.accent,
    layers: tier.layers,
  };
}

/**
 * PREVIEW ONLY. A staff-gated mockup of the skin-line parallel proposal on
 * REAL cards from the current edition, through the same PlayerCard3D the
 * shop renders. The treatments are drawn by CSS that no minted copy can
 * reach (`preview` is a prop only this page passes), so nothing here can
 * leak onto a shelf, and nothing is written.
 */
export default async function SkinLinesPreviewPage() {
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
  const featured = [...cards].sort((a, b) => b.overall - a.overall).slice(0, PLAYERS);
  const hero = featured[0] ?? null;
  const exampleLine = skinLineByKey(EXAMPLE_SEASON_SET.line)!;

  return (
    <main className="bg-hash mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-12 px-6 py-16">
      <header className="flex flex-col gap-3">
        <Link href="/admin" className="label-dash w-fit hover:text-coral">
          ← Admin
        </Link>
        <h1 className="type-display text-4xl sm:text-5xl">Skin-line parallels</h1>
        <p className="max-w-3xl text-sm text-steel">
          A patron&apos;s idea: the parallel ladder is hard to tell apart at a glance and says nothing about
          the game. Draw each season&apos;s foils in one League skin line instead — PROJECT this season,
          Harrowing the next — so a Season 5 PROJECT card can only have come from Season 5. Inside the
          line, four tiers on today&apos;s four rates, so a season&apos;s pulls are not all the same pull.
          Everything below is drawn on real cards from{" "}
          {weeks[0] ? `the ${weeks[0]} edition` : "the live build"} by the same component the shop uses.
          Hover a card.
        </p>
        <p className="max-w-3xl text-sm text-coral">
          Preview only. Nothing on this page mints, prices or writes anything, and no pack can produce
          these treatments.
        </p>
      </header>

      <section aria-labelledby="proposal" className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="card-brand flex flex-col gap-3 p-5 text-sm text-steel">
          <h2 id="proposal" className="type-display text-2xl text-white">
            The recommendation
          </h2>
          <p>
            <strong className="text-white">Per season, not per week.</strong> One line a season is a
            set people can learn, collect and talk about; one a week is fifteen a season, none of them
            memorable, and an art budget nobody will keep up with.
          </p>
          <p>
            <strong className="text-white">One line, four tiers.</strong> A season of foils that all look
            the same is boring by week three, so the line is the motif and the tier is how much of it you
            got. Standard is the line as drawn; Chroma, Prestige and Ultimate are League&apos;s own words for
            &ldquo;the same skin, rarer,&rdquo; laid over it. Each tier sits on the rung of the parallel it
            replaces — Prisma, Aurora, Refractor, Cracked Ice — so the odds, the dust values and the
            print-run rules do not move.
          </p>
          <p>
            <strong className="text-white">Eclipse is untouched.</strong> The one-of-ones stay above the
            line, keep their name and their look, and do not rotate with the season. They are not a tier
            of anything.
          </p>
          <p>
            <strong className="text-white">Old copies keep their names.</strong> A Cracked Ice pulled in
            August stays a Cracked Ice forever; the launch ladder simply becomes the set nothing mints
            any more. That is a feature — the first set is the scarce one.
          </p>
        </div>
        <div className="card-brand flex flex-col gap-2 p-5 text-sm">
          <span className="label-dash">
            Season {EXAMPLE_SEASON_SET.season} · {exampleLine.label}, worked example
          </span>
          <ul className="flex flex-col gap-2">
            {LINE_TIERS.map((tier) => (
              <li key={tier.key} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-2">
                <span className="font-semibold" style={{ color: exampleLine.accent }}>
                  {lineTierLabel(exampleLine, tier)}
                </span>
                <span className="text-xs text-steel">
                  replaces {FOIL_TYPE_LABELS[tier.replaces]} · {oneIn(tier)} · {oddsOfTier(tier)}
                </span>
              </li>
            ))}
            <li className="flex flex-wrap items-baseline justify-between gap-2 pb-2">
              <span className="font-semibold text-white">Eclipse</span>
              <span className="text-xs text-steel">unchanged · above the line · does not rotate</span>
            </li>
          </ul>
          <p className="mt-2 text-xs text-steel">
            Which line each season gets is the decision. The six candidates are below, each at all four
            tiers.
          </p>
        </div>
      </section>

      {hero ? (
        <section aria-label="Today against the proposal" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-baseline gap-3 border-b border-line pb-2">
            <h2 className="type-display text-2xl">
              Today, then Season {EXAMPLE_SEASON_SET.season} {exampleLine.label}
            </h2>
            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-steel">
              same card, same rung, before and after
            </span>
          </div>
          <div className="flex flex-wrap gap-6">
            {FOIL_TYPES.map((type) => (
              <div key={`now-${type}`} className="flex flex-col items-center gap-2">
                <PlayerCard3D card={hero} interactive forceFoil foilType={type} />
                <span className="text-xs text-steel">Today · {FOIL_TYPE_LABELS[type]}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-6">
            {LINE_TIERS.map((tier) => (
              <div key={`next-${tier.key}`} className="flex flex-col items-center gap-2">
                <PlayerCard3D
                  card={hero}
                  interactive
                  forceFoil
                  foilType={tier.replaces}
                  preview={previewOf(exampleLine, tier)}
                />
                <span className="text-xs" style={{ color: exampleLine.accent }}>
                  Proposed · {lineTierLabel(exampleLine, tier)}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <p className="text-sm text-steel">No cards in the current edition to preview.</p>
      )}

      {featured.length > 0
        ? SKIN_LINES.map((line, index) => {
            const card = featured[index % featured.length];
            return (
              <section key={line.key} aria-label={line.label} className="flex flex-col gap-4">
                <div className="flex flex-wrap items-baseline gap-3 border-b border-line pb-2">
                  <h2 className="type-display text-2xl" style={{ color: line.accent }}>
                    {line.label}
                  </h2>
                  <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-steel">{line.skinLine}</span>
                  <span className="text-xs text-steel">{line.look}</span>
                </div>
                <div className="flex flex-wrap gap-6">
                  {LINE_TIERS.map((tier) => (
                    <div key={`${line.key}-${tier.key}`} className="flex flex-col items-center gap-2">
                      <PlayerCard3D
                        card={card}
                        interactive
                        forceFoil
                        foilType={tier.replaces}
                        preview={previewOf(line, tier)}
                      />
                      <span className="text-xs" style={{ color: line.accent }}>
                        {lineTierLabel(line, tier)}
                      </span>
                      <span className="text-[11px] text-steel">
                        {card.name} · {oneIn(tier)}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            );
          })
        : null}

      <section className="card-brand flex flex-col gap-2 p-5 text-sm text-steel">
        <span className="label-dash">If it goes ahead</span>
        <p>
          One migration widens the foil-type check to the tier keys; the ladder config gains a per-season
          line so the roller mints this season&apos;s four tiers on the four weights it has now; the tier
          overlays get wired to the pointer like the parallel layer; the flat PNG render gets the line&apos;s
          accent and a badge per tier; and the parallels page, the Discord write-ups and the dust table read
          the season&apos;s names. About the size of the Eclipse change. Eclipse itself and every copy
          already minted are left exactly as they are.
        </p>
      </section>
    </main>
  );
}
