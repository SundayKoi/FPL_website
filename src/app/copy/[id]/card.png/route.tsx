// The PNG of one OWNED copy — the picture /flex, a market listing or the
// Vault posts when it means "this card, the one in my collection", not
// "this player".
//
// /card/{slug}/card.png cannot do this job and never will: it renders the
// card, and a card has no foil flag, no parallel, no ink. Those live on a
// card_inventory row. Two people holding the same player out of the same
// edition can hold visibly different objects — one matte, one Cracked Ice,
// one signed — and a share image that flattens them to the same picture
// throws away the entire point of parallels.
//
// The copy is read with the SERVICE-ROLE client because card_inventory is
// deny-all RLS. That is not a privacy hole: copies are already public
// through binders, the trade board and the Vault, and the frozen json this
// prints is the same public card plus the autograph, which the live card
// prints too. The id is the only input, and it names nothing private —
// there is no owner, no discord id and no balance anywhere in the output.

import { ImageResponse } from "next/og";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import { championCenteredUrl } from "@/lib/match-draft/champions";
import { resolvePrintArtUrl } from "@/lib/packs/skins";
import { CARD_IMAGE_SIZE, renderCardImage } from "@/lib/cards/render/cardImage";
import { missingCardImage } from "@/lib/cards/render/missing";
import { editionLabel } from "@/lib/packs/week";
import type { PlayerCardData } from "@/lib/cards/build";

// Node, like its sibling: satori's resvg binding and the art-url probe in
// resolvePrintArtUrl both want the Node runtime.
export const runtime = "nodejs";

interface CopyRow {
  id: number;
  card: PlayerCardData;
  foil: boolean | null;
  foil_type: string | null;
  signed: boolean | null;
  edition_week: string | null;
  season: string | null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Validated before a client is even built. `id` is a path segment off the
  // open internet heading for an integer column: "1e9", "-1" and "07" all
  // parseInt to something, and PostgREST would take the junk and answer
  // with an error we would then have to tell apart from a real miss.
  const inventoryId = /^[1-9]\d*$/.test(id) ? Number(id) : null;
  if (inventoryId === null || !Number.isSafeInteger(inventoryId)) {
    return new ImageResponse(missingCardImage("Copy not found"), CARD_IMAGE_SIZE);
  }

  const service = createBettingServiceClient();
  const { data, error } = await service
    .from("card_inventory")
    .select("id, card, foil, foil_type, signed, edition_week, season")
    .eq("id", inventoryId)
    .maybeSingle();

  const row = error ? null : (data as CopyRow | null);
  // A dusted copy is gone from the table, and its image url outlives it in
  // whatever message posted it. Same panel as a bad id: the picture says
  // so, rather than the message showing a broken image.
  if (!row?.card) {
    return new ImageResponse(missingCardImage("Copy not found"), CARD_IMAGE_SIZE);
  }

  // The row's own season wins where the frozen json has none: the eyebrow
  // line prints "Season {season}" and the column is the authority on which
  // season a copy belongs to (it is what every collection read filters on).
  const card: PlayerCardData = row.card.season ? row.card : { ...row.card, season: row.season ?? "" };
  // Same resolution chain as the live route, and for the same reason:
  // satori fetches the art itself with no onError, so a 404 at render time
  // breaks the whole image rather than one element of it. The copy's own
  // frozen artSkin is used — a pulled copy wears the print it rolled, not
  // the skin its player has since chosen.
  const splash = card.signature
    ? (await resolvePrintArtUrl(card.signature.champion, card.artSkin)) ??
      championCenteredUrl(card.signature.champion)
    : null;

  return new ImageResponse(
    renderCardImage({
      card,
      foil: Boolean(row.foil),
      foilType: row.foil_type,
      signed: Boolean(row.signed),
      autograph: card.autograph ?? null,
      // Which edition this copy came out of — the one fact a copy has that
      // the live card does not, and the thing that makes two otherwise
      // identical cards different collectibles.
      label: row.edition_week ? `${editionLabel(row.edition_week)} edition` : undefined,
      splash,
    }),
    CARD_IMAGE_SIZE,
  );
}
