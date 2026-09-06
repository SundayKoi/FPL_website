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
// (Team Cards, Compare, Moments, the Vault, Trades, Fantasy, the Gauntlet,
// Expeditions, the Draw, the Ledger) still exist at their old URLs; they
// are now sub-tabs of the tab they belong under, so the bar always shows
// where you are and where you can go from here.

export interface CardsSubsection {
  label: string;
  href: string;
  blurb: string;
  /** The Gauntlet is premier-only — it has no academy page to link to. */
  premierOnly?: boolean;
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
  const academy = base !== "/cards";
  return [
    { key: "home", label: "Home", href: base, blurb: "Your card, this week's chase, the draw" },
    {
      key: "collection",
      label: "My Collection",
      href: `${base}/collection`,
      blurb: "Every copy you own, your binder, your team sets",
    },
    {
      key: "packs",
      label: "Packs",
      href: `${base}/packs`,
      blurb: "Open a pack from any week's edition",
      children: [
        { label: "Open packs", href: `${base}/packs`, blurb: "Open a pack from any week's edition" },
        { label: "Rarities", href: `${base}/rarities`, blurb: "Every rarity a card can pull, with the real odds" },
      ],
    },
    {
      key: "browse",
      label: "Browse",
      href: `${base}/browse`,
      blurb: "Every player's card, and the rarest of them",
      children: [
        { label: "All cards", href: `${base}/browse`, blurb: "Every player's card, rated from this season's stats" },
        { label: "Team cards", href: `${base}/teams`, blurb: "Every roster as one composite card" },
        { label: "Compare", href: `${base}/compare`, blurb: "Two cards side by side" },
        { label: "Moments", href: `${base}/moments`, blurb: "The rarest single games of the season" },
        { label: "The Vault", href: `${base}/vault`, blurb: "Every one-of-one, who holds it, what's still out there" },
      ],
    },
    {
      key: "market",
      label: "Market",
      href: `${base}/market`,
      blurb: "Buy, sell, and swap copies with other collectors",
      children: [
        { label: "Listings", href: `${base}/market`, blurb: "Copies for sale at a fixed price" },
        { label: "Bounties", href: `${base}/market/bounties`, blurb: "Cards people are hunting, and what they'll pay" },
        { label: "Trade offers", href: `${base}/trades`, blurb: "Swap copies one to one" },
      ],
    },
    {
      key: "play",
      label: "Play",
      href: `${base}/play`,
      blurb: "Put your cards to work",
      children: [
        { label: "Fantasy", href: `${base}/fantasy`, blurb: "Field five cards under the salary cap each week" },
        ...(academy
          ? []
          : [
              {
                label: "The Gauntlet",
                href: `${base}/gauntlet`,
                blurb: "Draft five, climb eight rounds, lose once",
                premierOnly: true,
              },
              {
                label: "Showdown",
                href: `${base}/showdown`,
                blurb: "Hold'em with your cards, for betting dollars",
                premierOnly: true,
              },
            ]),
        { label: "Expeditions", href: `${base}/expeditions`, blurb: "Send three cards out; they come back changed" },
        { label: "The ledger", href: `${base}/expeditions/ledger`, blurb: "Every card lost, found and buried, league-wide" },
        { label: "Weekly Draw", href: `${base}/draw`, blurb: "Every copy is a ticket; one wins every week" },
        { label: "Pack stats", href: `${base}/stats`, blurb: "What the league has opened and pulled" },
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
 * The same page in the other league. The bases swap; a premier-only page
 * (the Gauntlet) falls back to its tab, because the academy has no such
 * page and a 404 is not a league switch.
 */
export function pairedCardsHref(pathname: string, from: string, to: string): string {
  if (!isUnder(pathname, from)) return to;
  const suffix = pathname.slice(from.length);
  const { child } = activeCardsSection(cardsSections(from), pathname);
  if (child?.premierOnly) return `${to}/play`;
  return `${to}${suffix}`;
}
