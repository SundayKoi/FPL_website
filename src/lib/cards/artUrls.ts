// Which images a card is about to want.
//
// Card art is `loading="lazy"` everywhere, which is right for a shelf of
// two hundred copies and wrong for a pack reveal: the five cards are known
// the moment the server action returns, but the browser does not start
// fetching a splash until the card it belongs to renders. So a flip showed
// an empty frame and the art arrived after it — the slowest-feeling part
// of opening a pack was the part that had already been decided.
//
// The champion is not in one place. A player card names it on `signature`,
// a champions relic on `champWin`, a moment on `moment`, and a roster plate
// names FIVE, one per panel. Reading only the first is a bug this codebase
// has already shipped twice (the expedition squad strip rendered every
// relic as a "?"), so it is written down once here.
//
// Pure and framework-free: it returns urls, and the caller decides whether
// to preload them, render them, or count them.

import { championCenteredUrl, championSplashUrl } from "@/lib/match-draft/champions";
import type { PlayerCardData } from "./build";

/**
 * Every image `card` will render, most important first.
 *
 * A champions relic renders `championSplashUrl` DIRECTLY — its frame never
 * falls back to the centered crop — so warming the centered url would warm
 * the wrong file. Everything else takes the centered crop.
 */
export function cardArtUrls(card: PlayerCardData | null | undefined): string[] {
  if (!card) return [];
  const skin = card.artSkin ?? 0;

  // A roster plate is five champions and a crest, and the crest is already
  // in the page's own asset budget — the five panels are what would pop in.
  if (card.team) {
    return card.team.slots
      .map((slot) => (slot.champion ? championCenteredUrl(slot.champion, 0) : null))
      .filter((url): url is string => Boolean(url));
  }

  if (card.champWin?.champion) {
    const splash = championSplashUrl(card.champWin.champion, skin);
    return splash ? [splash] : [];
  }

  const champion = card.signature?.champion ?? card.moment?.champion ?? null;
  if (!champion) return [];
  const url = championCenteredUrl(champion, skin);
  return url ? [url] : [];
}

/**
 * Starts the browser fetching `urls` without rendering anything.
 *
 * `new Image()` rather than a <link rel="preload">: a preload link the page
 * never uses logs a console warning, and these are always used within a
 * second or two. Decoding is requested too where the browser supports it,
 * so the flip has a decoded bitmap rather than a decode on the frame it
 * needs to paint.
 *
 * No-ops outside the browser, and swallows failures: a warm cache is an
 * optimisation, and a 404 on one splash must not break a reveal.
 */
export function preloadArt(urls: readonly string[]): void {
  if (typeof window === "undefined") return;
  for (const url of urls) {
    try {
      const image = new window.Image();
      image.decoding = "async";
      image.src = url;
      void image.decode?.().catch(() => {});
    } catch {
      // A browser without Image, or a malformed url — nothing to recover.
    }
  }
}
