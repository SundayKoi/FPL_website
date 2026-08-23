import type { Metadata } from "next";
import Link from "next/link";
import PlayerCard3D from "@/components/cards/PlayerCard3D";
import ShareCardActions from "@/components/cards/ShareCardActions";
import SkinPicker from "@/components/cards/SkinPicker";
import { fetchAllCardSeasons, fetchCardBySlug, fetchRatingHistory, type RatingHistoryPoint } from "@/lib/cards/queries";
import { createServerSupabase } from "@/lib/supabase/server";
import type { PlayerCardData } from "@/lib/cards/build";

/** The card's weekly readings plus today's live rating — the season arc.
 *  Tier changes get a highlighted marker. Hidden until two points exist. */
function SeasonJourney({ history, card }: { history: RatingHistoryPoint[]; card: PlayerCardData }) {
  const points = [...history.map((point) => ({ overall: point.overall, tier: point.tier })), { overall: card.overall, tier: card.tier.label }];
  // Collapse consecutive identical readings so quiet weeks don't repeat.
  const arc = points.filter(
    (point, index) => index === 0 || point.overall !== points[index - 1].overall || point.tier !== points[index - 1].tier,
  );
  if (arc.length < 2) return null;
  return (
    <section className="flex flex-col items-center gap-2" aria-label="Season journey">
      <span className="label-dash">Season journey</span>
      <div className="flex flex-wrap items-center justify-center gap-1.5 text-sm">
        {arc.map((point, index) => {
          const tierChanged = index > 0 && point.tier !== arc[index - 1].tier;
          const up = index > 0 && point.overall > arc[index - 1].overall;
          return (
            <span key={index} className="flex items-center gap-1.5">
              {index > 0 && <span aria-hidden className="text-steel">→</span>}
              <span
                className={`rounded-full border px-2 py-0.5 font-mono font-bold ${
                  tierChanged
                    ? up
                      ? "border-mint/60 text-mint"
                      : "border-red-400/60 text-red-400"
                    : "border-line text-white"
                }`}
                title={point.tier}
              >
                {point.overall}
              </span>
              {tierChanged && (
                <span className={`text-[10px] font-bold uppercase tracking-wide ${up ? "text-mint" : "text-red-400"}`}>
                  {point.tier}
                </span>
              )}
            </span>
          );
        })}
      </div>
    </section>
  );
}

// The public face of one player's card — shareable by design: anyone with
// the link sees the live 3D card (no account, no premium), and the OG
// image below makes a pasted link unfurl into the card on Discord. The
// premium gate lives on the /cards hub, not here; this page is the ad.

/** Share URLs span both leagues: try Premier's season first, then the
 *  Academy's, so one /card/[slug] namespace serves every player. */
async function loadCard(slug: string) {
  const supabase = await createServerSupabase();
  for (const { league, season } of await fetchAllCardSeasons(supabase)) {
    const card = await fetchCardBySlug(supabase, season, slug);
    if (card) return { card, league };
  }
  return null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const card = (await loadCard(slug))?.card ?? null;
  if (!card) return { title: "Player card — FPL" };
  return {
    title: `${card.name} — ${card.overall} OVR ${card.tier.label} | FPL`,
    description: `${card.archetype} · ${card.role}${card.teamName ? ` · ${card.teamName}` : ""} · ${card.wins}–${card.losses} (${Math.round(card.winratePct)}% WR) · Season ${card.season}`,
    openGraph: { images: [`/card/${slug}/card.png`] },
    twitter: { card: "summary_large_image", images: [`/card/${slug}/card.png`] },
  };
}

export default async function CardSharePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const loaded = await loadCard(slug);
  const card = loaded?.card ?? null;
  const collectionHref = loaded?.league === "academy" ? "/academy/cards" : "/cards";

  // May this viewer restyle the card's art? Admins, or a captain whose
  // roster contains the player (can_edit_card_art, security definer). Any
  // failure — signed out, migration not applied — just hides the picker.
  let canEditArt = false;
  let history: RatingHistoryPoint[] = [];
  if (card) {
    const supabase = await createServerSupabase();
    const { data } = await supabase
      .rpc("can_edit_card_art", { p_season: card.season, p_summoner: card.name, p_tag: card.tag })
      .then((result) => result, () => ({ data: null }));
    canEditArt = data === true;
    history = await fetchRatingHistory(supabase, card.season, card.slug);
  }

  if (!card) {
    return (
      <main className="bg-hash flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
        <span className="label-dash">Player cards</span>
        <h1 className="type-display text-3xl">Card not found</h1>
        <p className="max-w-md text-sm text-steel">
          No rated player matches this link for the current season — cards exist once a player has
          ingested games.
        </p>
        <Link href="/" className="btn-pill mt-2">Back to FPL</Link>
      </main>
    );
  }

  return (
    <main className="bg-hash flex flex-1 flex-col items-center gap-6 px-4 py-12 text-white">
      <header className="text-center">
        <span className="label-dash">FPL player card · Season {card.season}</span>
        <h1 className="type-display mt-2 text-4xl">{card.name}</h1>
      </header>
      <PlayerCard3D card={card} reveal bloom />
      <p className="text-xs text-steel">Hover to tilt · click to flip</p>
      <SeasonJourney history={history} card={card} />
      <ShareCardActions slug={card.slug} />
      {canEditArt && card.signature ? (
        <SkinPicker
          season={card.season}
          summonerName={card.name}
          tag={card.tag}
          champion={card.signature.champion}
          currentSkin={card.artSkin}
          currentMotto={card.motto}
        />
      ) : null}
      <p className="max-w-md text-center text-xs text-steel">
        Cards rebuild themselves from the season&apos;s stats after every match night.{" "}
        <Link href={collectionHref} className="text-coral underline-offset-4 hover:underline">
          Premium members browse the whole collection →
        </Link>
      </p>
    </main>
  );
}
