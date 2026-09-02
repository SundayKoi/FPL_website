import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import PlayerCard3D from "@/components/cards/PlayerCard3D";
import { fetchStaffTier } from "@/lib/auth/staffTier";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import { fetchAllCardSeasons, fetchCardEditionWeeks, fetchCurrentWeekCards, fetchEditionCards } from "@/lib/cards/queries";
import { EXAMPLE_SEASON_SET, RUNG_LABELS, SKIN_LINES, skinLineByKey, type LadderRung } from "@/lib/cards/skinLines";
import { FOIL_CHANCE, FOIL_TYPE_LABELS, FOIL_TYPE_WEIGHTS, FOIL_TYPES } from "@/lib/packs/config";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Skin-line parallels — FPL Admin",
};

/** Two players per treatment: enough to judge a look over two different
 *  pieces of art, few enough that six treatments is not a slideshow. */
const PLAYERS = 2;

const RUNGS: LadderRung[] = ["aurora", "refractor", "ice"];

function oddsOfRung(rung: LadderRung): string {
  const total = Object.values(FOIL_TYPE_WEIGHTS).reduce((sum, value) => sum + value, 0);
  return `${((FOIL_TYPE_WEIGHTS[rung] / total) * FOIL_CHANCE * 100).toFixed(2)}% per card`;
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

  const previewOf = (key: string) => {
    const line = skinLineByKey(key)!;
    return { label: line.label, className: line.className, blend: line.blend, accent: line.accent };
  };

  return (
    <main className="bg-hash mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-12 px-6 py-16">
      <header className="flex flex-col gap-3">
        <Link href="/admin" className="label-dash w-fit hover:text-coral">
          ← Admin
        </Link>
        <h1 className="type-display text-4xl sm:text-5xl">Skin-line parallels</h1>
        <p className="max-w-3xl text-sm text-steel">
          A patron&apos;s idea: the parallel ladder is hard to tell apart at a glance and says nothing about
          the game. Name the parallels for League skin lines instead — PROJECT, Harrowing, Arcade — and
          give each season three new ones, so a Season 5 PROJECT card can only have come from Season 5.
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
            <strong className="text-white">Per season, not per week.</strong> Three new lines a season is
            one set people can learn, collect and talk about; one a week is fifteen a season, none of
            them memorable, and an art budget nobody will keep up with.
          </p>
          <p>
            <strong className="text-white">The ladder stays; the names change.</strong> Prisma stays the
            base and unlabelled, Eclipse stays above everything, and the three rungs between them take a
            skin line each. Odds, dust values and the print-run rules do not move, so nothing already
            pulled is repriced.
          </p>
          <p>
            <strong className="text-white">Old copies keep their names.</strong> A Cracked Ice pulled in
            August stays a Cracked Ice forever; Aurora, Refractor and Cracked Ice simply become the
            Season 5 launch set that nothing mints any more. That is a feature — the first set is the
            scarce one.
          </p>
          <p>
            <strong className="text-white">Rarest is loudest.</strong> The top rung should get the
            treatment you cannot mistake for anything else, because the whole point is telling them apart
            across the room.
          </p>
        </div>
        <div className="card-brand flex flex-col gap-2 p-5 text-sm">
          <span className="label-dash">Season set, worked example</span>
          <ul className="flex flex-col gap-2">
            {RUNGS.map((rung) => {
              const line = skinLineByKey(EXAMPLE_SEASON_SET.rungs[rung])!;
              return (
                <li key={rung} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-2">
                  <span className="font-semibold" style={{ color: line.accent }}>
                    {line.label}
                  </span>
                  <span className="text-xs text-steel">
                    {RUNG_LABELS[rung]} · {oddsOfRung(rung)}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-xs text-steel">
            Which three, and in what order, is the decision. The six candidates are below; any three of
            them work on these rungs.
          </p>
        </div>
      </section>

      {hero ? (
        <section aria-label="Today against the proposal" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-baseline gap-3 border-b border-line pb-2">
            <h2 className="type-display text-2xl">Today, then the Season 5 set</h2>
            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-steel">
              same card, same rung, before and after
            </span>
          </div>
          <div className="flex flex-wrap gap-6">
            {FOIL_TYPES.filter((type) => type !== "prisma").map((type) => (
              <div key={`now-${type}`} className="flex flex-col items-center gap-2">
                <PlayerCard3D card={hero} interactive forceFoil foilType={type} />
                <span className="text-xs text-steel">Today · {FOIL_TYPE_LABELS[type]}</span>
              </div>
            ))}
            {RUNGS.map((rung) => {
              const line = skinLineByKey(EXAMPLE_SEASON_SET.rungs[rung])!;
              return (
                <div key={`next-${rung}`} className="flex flex-col items-center gap-2">
                  <PlayerCard3D card={hero} interactive forceFoil foilType={rung} preview={previewOf(line.key)} />
                  <span className="text-xs" style={{ color: line.accent }}>
                    Proposed · {line.label}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      ) : (
        <p className="text-sm text-steel">No cards in the current edition to preview.</p>
      )}

      {featured.length > 0
        ? SKIN_LINES.map((line) => (
            <section key={line.key} aria-label={line.label} className="flex flex-col gap-4">
              <div className="flex flex-wrap items-baseline gap-3 border-b border-line pb-2">
                <h2 className="type-display text-2xl" style={{ color: line.accent }}>
                  {line.label}
                </h2>
                <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-steel">{line.skinLine}</span>
                <span className="text-xs text-steel">{line.look}</span>
              </div>
              <div className="flex flex-wrap gap-6">
                {featured.map((card) => (
                  <div key={`${line.key}-${card.slug}`} className="flex flex-col items-center gap-2">
                    <PlayerCard3D card={card} interactive forceFoil foilType="aurora" preview={previewOf(line.key)} />
                    <span className="text-xs text-steel">
                      {card.name} · {card.overall} {card.tier.label}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ))
        : null}

      <section className="card-brand flex flex-col gap-2 p-5 text-sm text-steel">
        <span className="label-dash">If it goes ahead</span>
        <p>
          One migration widens the foil-type check to the new keys; the ladder config gains a per-season
          set so the roller mints this season&apos;s three; the flat PNG render gets an accent and a badge
          per line; and the parallels page, the Discord write-ups and the dust table read the season&apos;s
          names. About the size of the Eclipse change. Nothing already minted is touched.
        </p>
      </section>
    </main>
  );
}
