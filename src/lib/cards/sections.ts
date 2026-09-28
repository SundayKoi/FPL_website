// The map of the cards section — the one place its shape is written down.
//
// Cards grew to sixteen pages behind a single hub menu, and every page
// under it offered one way out: "← Back to player cards". Moving from
// Trades to Market meant going back to the hub and reading thirteen links
// again. This tree is what the tab bar on every cards page reads, what the
// Play index lists, and what the tests hold the two of them to.
//
// Six tabs, because six is what a person can hold in their head while
// looking for something. The pages that were destinations of their own
// (Team Cards, Compare, Moments, the Vault, Trades, Fantasy, Expeditions,
// the Draw, the Ledger) still exist at their old URLs; they are now
// sub-tabs of the tab they belong under, so the bar always shows where
// you are and where you can go from here.

export interface CardsSubsection {
  label: string;
  href: string;
  blurb: string;
  /** What the page used to be called, and other words people search for.
   *  Labels went plain in 2026-09 ("The Vault" -> "Rarest cards"); the old
   *  names still find the page in site search. */
  keywords?: string[];
}

export interface CardsSection {
  key: "home" | "collection" | "packs" | "browse" | "market" | "play";
  label: string;
  href: string;
  blurb: string;
  children?: CardsSubsection[];
}

/** `base` is "/cards" or "/academy/cards". */
export function cardsSections(base: string): CardsSection[] {
  return [
    { key: "home", label: "Home", href: base, blurb: "Your card, this week's chase, the draw" },
    {
      key: "collection",
      label: "My Collection",
      href: `${base}/collection`,
      blurb: "Every copy you own, your binder, your team sets",
      // Three sections on one page, so the sub-tabs are anchors: the tab
      // bar still says where you are and where you can go from here.
      children: [
        { label: "My cards", href: `${base}/collection`, blurb: "Every copy you own, one shelf per player", keywords: ["shelf", "collection", "inventory"] },
        { label: "Team sets", href: `${base}/collection#team-sets`, blurb: "Collect a whole roster from one week", keywords: ["roster sets", "sets"] },
        { label: "Showcase", href: `${base}/collection#binder`, blurb: "The copies you pin to show off", keywords: ["binder", "pinned"] },
      ],
    },
    {
      key: "packs",
      label: "Packs",
      href: `${base}/packs`,
      blurb: "Open a pack from any week's edition",
      children: [
        { label: "Open packs", href: `${base}/packs`, blurb: "Open a pack from any week's edition" },
        { label: "Pack odds", href: `${base}/rarities`, blurb: "Every rarity a card can pull, with the real odds", keywords: ["rarities", "odds", "chances"] },
      ],
    },
    {
      key: "browse",
      label: "Browse",
      href: `${base}/browse`,
      blurb: "Every player's card, and the rarest of them — open to everyone",
      children: [
        { label: "All cards", href: `${base}/browse`, blurb: "Every player's card, rated from this season's stats" },
        { label: "Team cards", href: `${base}/teams`, blurb: "Every roster as one composite card" },
        { label: "Compare", href: `${base}/compare`, blurb: "Two cards side by side" },
        { label: "Moments", href: `${base}/moments`, blurb: "Cards for the season's best single games", keywords: ["best games", "highlights"] },
        { label: "Season awards", href: `${base}/season-end`, blurb: "Every published Season's End award and season card", keywords: ["season's end", "awards"] },
        { label: "Rarest cards", href: `${base}/vault`, blurb: "Every one-of-one, who holds it, what's still out there", keywords: ["vault", "one of one", "eclipse"] },
      ],
    },
    {
      key: "market",
      label: "Market",
      href: `${base}/market`,
      blurb: "Buy, sell, and swap copies with other collectors",
      children: [
        { label: "For sale", href: `${base}/market`, blurb: "Copies for sale at a fixed price", keywords: ["listings", "buy", "sell"] },
        { label: "Wanted", href: `${base}/market/bounties`, blurb: "Cards people are hunting, and what they'll pay", keywords: ["bounties", "bounty"] },
        { label: "Trades", href: `${base}/trades`, blurb: "Swap copies one to one", keywords: ["trade offers", "swap"] },
      ],
    },
    {
      key: "play",
      label: "Play",
      href: `${base}/play`,
      blurb: "Put your cards to work",
      children: [
        { label: "Fantasy", href: `${base}/fantasy`, blurb: "Field five cards under the salary cap each week" },
        { label: "Expeditions", href: `${base}/expeditions`, blurb: "Send three cards out; they come back changed" },
        { label: "Expedition log", href: `${base}/expeditions/ledger`, blurb: "Every card lost, found and buried, league-wide", keywords: ["ledger"] },
        { label: "Weekly prize draw", href: `${base}/draw`, blurb: "Every copy is a ticket; one wins every week", keywords: ["weekly draw", "raffle", "draw"] },
      ],
    },
  ];
}

function isUnder(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Which tab, and which sub-tab, a pathname sits under. Home only matches
 * itself — everything else on the site is under it by prefix, which is
 * exactly why prefix matching would light Home on every page.
 */
export function activeCardsSection(
  sections: CardsSection[],
  pathname: string,
): { section: CardsSection | null; child: CardsSubsection | null } {
  for (const section of sections) {
    if (section.key === "home") {
      if (pathname === section.href) return { section, child: null };
      continue;
    }
    // The most specific child wins: /cards/market/bounties is under
    // /cards/market too, and the first-listed sub-tab is the shortest href.
    const child = (section.children ?? [])
      .filter((candidate) => isUnder(pathname, candidate.href))
      .sort((a, b) => b.href.length - a.href.length)[0];
    if (child) return { section, child };
    if (isUnder(pathname, section.href)) return { section, child: null };
  }
  return { section: null, child: null };
}

/**
 * The same page in the other league: the bases swap and the rest of the
 * path rides along, because every cards page exists under both.
 */
export function pairedCardsHref(pathname: string, from: string, to: string): string {
  if (!isUnder(pathname, from)) return to;
  return `${to}${pathname.slice(from.length)}`;
}
