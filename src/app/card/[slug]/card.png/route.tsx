// The shareable PNG of a player card — what Discord/Twitter unfurl when a
// card link is pasted (wired via openGraph.images on the share page), and
// what the "Download PNG" button serves. A flat re-render of the card
// (satori has no CSS 3D), built from the same live card data.
//
// The layout itself lives in src/lib/cards/render/cardImage.tsx, shared
// with /copy/{id}/card.png — the picture of an OWNED copy has to be the
// same picture as the picture of the card, or a collectible reads as two
// different objects depending on which link someone posted.
//
// `?w=YYYY-MM-DD` pictures that week's ARCHIVED print instead of the live
// card. Two separate things go wrong without it, and /rip hit both:
//
//   1. A pull is FROM a week. Ripping a card out of the 18 August edition and
//      showing today's rating means the picture disagrees with the text of
//      the very message it sits in.
//   2. Discord's image proxy caches by URL. /card/doug-na1/card.png is the
//      same string every week forever, so the first render Discord ever saw
//      is the one it keeps serving — last week's card under this week's
//      text, which is exactly how this was reported. Putting the week in the
//      query string makes each edition its own URL, so correctness and cache
//      busting are the same change rather than two.

import { ImageResponse } from "next/og";
import { createClient } from "@supabase/supabase-js";
import { fetchAllCardSeasons, fetchCardBySlug, fetchEditionCardBySlug } from "@/lib/cards/queries";
import { championCenteredUrl } from "@/lib/match-draft/champions";
import { resolvePrintArtUrl } from "@/lib/packs/skins";
import { CARD_IMAGE_SIZE, renderCardImage } from "@/lib/cards/render/cardImage";
import { missingCardImage } from "@/lib/cards/render/missing";
import type { PlayerCardData } from "@/lib/cards/build";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // Validated rather than trusted: this goes straight into a query filter,
  // and a junk value should picture the live card rather than nothing.
  const requestedWeek = new URL(request.url).searchParams.get("w");
  const editionWeek = requestedWeek && /^\d{4}-\d{2}-\d{2}$/.test(requestedWeek) ? requestedWeek : null;
  // Anon client on purpose: this route renders for link unfurlers (Discord,
  // Twitter bots) with no cookies — everything it reads is public data.
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  // Share URLs span both leagues — try Premier's season, then Academy's.
  let card: PlayerCardData | null = null;
  for (const { season } of await fetchAllCardSeasons(supabase)) {
    // An unarchived week falls through to the live card rather than 404ing:
    // a picture of the right player with the wrong week beats no picture.
    card = editionWeek ? await fetchEditionCardBySlug(supabase, season, editionWeek, slug) : null;
    card ??= await fetchCardBySlug(supabase, season, slug);
    if (card) break;
  }

  if (!card) {
    return new ImageResponse(missingCardImage("FPL player card not found"), CARD_IMAGE_SIZE);
  }

  // satori fetches the art itself and has no onError to fall back through,
  // so the whole chain the live card walks in the browser has to be resolved
  // here first: centered art for the skin, else its regular splash, else base
  // centered art. A url that 404s at render time breaks the whole unfurl.
  const splash = card.signature
    ? (await resolvePrintArtUrl(card.signature.champion, card.artSkin)) ??
      championCenteredUrl(card.signature.champion)
    : null;

  // The live card has no copy behind it: no foil flag, no parallel, no ink.
  // Those belong to a row in card_inventory, and /copy/{id}/card.png is the
  // route that has one.
  return new ImageResponse(
    renderCardImage({ card, foil: false, foilType: null, signed: false, autograph: null, splash }),
    CARD_IMAGE_SIZE,
  );
}
