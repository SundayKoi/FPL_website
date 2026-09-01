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
  slug: string | null;
  card: PlayerCardData;
  foil: boolean | null;
  foil_type: string | null;
  signed: boolean | null;
  edition_week: string | null;
  season: string | null;
  print_number: number | null;
}

/**
 * "WK Aug 24 edition · #7 of 43", or as much of it as is knowable.
 *
 * Both halves of the stamp have to be there before either is printed: a
 * serial with no run size is a number nobody can read, and a run size with
 * no serial belongs to a different copy. A copy minted before print
 * numbering existed in this environment has neither, and keeps the plain
 * edition line it has always had.
 */
export function copyLabel(
  editionWeek: string | null,
  printNumber: number | null,
  minted: number | null,
): string | undefined {
  if (!editionWeek) return undefined;
  const edition = `${editionLabel(editionWeek)} edition`;
  return printNumber != null && minted ? `${edition} · #${printNumber} of ${minted}` : edition;
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
    .select("id, slug, card, foil, foil_type, signed, edition_week, season, print_number")
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

  // The print run's size, for the "of N" half of the stamp. One row by
  // primary key, and only when there is a stamp to put a denominator under
  // — an old copy without one would pay for a query whose answer it could
  // not use. A miss (missing table, unapplied migration) drops back to the
  // edition-only label rather than failing the picture.
  const minted = await mintedOf(service, row);

  return new ImageResponse(
    renderCardImage({
      card,
      foil: Boolean(row.foil),
      foilType: row.foil_type,
      signed: Boolean(row.signed),
      autograph: card.autograph ?? null,
      // Which edition this copy came out of and which stamp it took — the
      // two facts a copy has that the live card does not, and the things
      // that make two otherwise identical cards different collectibles.
      label: copyLabel(row.edition_week, row.print_number, minted),
      splash,
    }),
    CARD_IMAGE_SIZE,
  );
}

/** Minted-to-date for this copy's print, or null when it cannot be known.
 *  `card_print_runs` is keyed by exactly these three columns, so this is a
 *  primary-key read returning one row or none — the paging fetchPrintRuns
 *  does is for callers asking about a whole collection at once. */
async function mintedOf(
  service: ReturnType<typeof createBettingServiceClient>,
  row: CopyRow,
): Promise<number | null> {
  const slug = row.slug ?? row.card?.slug ?? null;
  if (row.print_number == null || !row.season || !row.edition_week || !slug) return null;
  const { data, error } = await service
    .from("card_print_runs")
    .select("minted")
    .eq("season", row.season)
    .eq("edition_week", row.edition_week)
    .eq("slug", slug)
    .maybeSingle();
  if (error) return null;
  return (data as { minted: number } | null)?.minted ?? null;
}
