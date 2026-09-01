// The URL of a card's share PNG, with a cache key on it.
//
// The key is not decoration. Discord's image proxy caches by URL, and
// /card/{slug}/card.png is the same string every week forever — so whatever
// render Discord fetched first is the one it keeps serving, and nothing on
// this site can change its mind. That is how a /rip message came to show
// last week's pictures under this week's text: the text was rebuilt every
// day, the picture never was.
//
// Anything that posts a card image somewhere that caches by URL goes through
// here. There is one rule and it is written once, because four copies of a
// cache key is four chances for one of them to be forgotten — which is
// exactly how the /rip bug survived as long as it did.

import { mondayOf } from "@/lib/packs/week";

/**
 * `site` may be "" for a same-origin path (Next resolves it against
 * metadataBase for OG tags). `editionWeek` is the archived week a pull came
 * from, or null when there isn't one.
 *
 * Two keys, because the two cases want different things:
 *
 *   w=<week>   Render THAT week's archived print. Used where the picture is
 *              of a specific pull — a rip, a chase claim — because a pull is
 *              FROM a week and showing today's rating instead makes the
 *              picture disagree with the message it sits in.
 *   v=<monday> Render the live card, unchanged, but under a URL that turns
 *              over every Monday. Used where the picture IS meant to be
 *              "as they stand now" — a share link, the download button. The
 *              route ignores `v` entirely; its only job is to stop a cache
 *              serving a card from three restats ago.
 *
 * Either way the URL changes at least weekly, which is the cadence cards
 * change at.
 */
export function cardImageUrl(
  site: string,
  slug: string,
  editionWeek: string | null,
  now: Date = new Date(),
): string {
  const key = editionWeek
    ? `w=${encodeURIComponent(editionWeek)}`
    : `v=${mondayOf(now)}`;
  return `${site}/card/${slug}/card.png?${key}`;
}
