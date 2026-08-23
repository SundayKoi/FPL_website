import type { Metadata } from "next";
import Link from "next/link";
import PlayerCard3D from "@/components/cards/PlayerCard3D";
import ShareCardActions from "@/components/cards/ShareCardActions";
import SkinPicker from "@/components/cards/SkinPicker";
import { fetchCardBySlug, fetchCardSeason } from "@/lib/cards/queries";
import { fetchStandoutKey } from "@/lib/cards/standout";
import { createServerSupabase } from "@/lib/supabase/server";

// The public face of one player's card — shareable by design: anyone with
// the link sees the live 3D card (no account, no premium), and the OG
// image below makes a pasted link unfurl into the card on Discord. The
// premium gate lives on the /cards hub, not here; this page is the ad.

async function loadCard(slug: string) {
  const supabase = await createServerSupabase();
  const season = await fetchCardSeason(supabase);
  if (!season) return null;
  const standoutKey = await fetchStandoutKey(season);
  return await fetchCardBySlug(supabase, season, slug, { standoutKey });
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const card = await loadCard(slug);
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
  const card = await loadCard(slug);

  // May this viewer restyle the card's art? Admins, or a captain whose
  // roster contains the player (can_edit_card_art, security definer). Any
  // failure — signed out, migration not applied — just hides the picker.
  let canEditArt = false;
  if (card) {
    const supabase = await createServerSupabase();
    const { data } = await supabase
      .rpc("can_edit_card_art", { p_season: card.season, p_summoner: card.name, p_tag: card.tag })
      .then((result) => result, () => ({ data: null }));
    canEditArt = data === true;
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
      <PlayerCard3D card={card} reveal />
      <p className="text-xs text-steel">Hover to tilt · click to flip</p>
      <ShareCardActions slug={card.slug} />
      {canEditArt && card.signature ? (
        <SkinPicker
          season={card.season}
          summonerName={card.name}
          tag={card.tag}
          champion={card.signature.champion}
          currentSkin={card.artSkin}
        />
      ) : null}
      <p className="max-w-md text-center text-xs text-steel">
        Cards rebuild themselves from the season&apos;s stats after every match night.{" "}
        <Link href="/cards" className="text-coral underline-offset-4 hover:underline">
          Premium members browse the whole collection →
        </Link>
      </p>
    </main>
  );
}
