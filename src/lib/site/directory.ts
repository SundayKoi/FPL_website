// The map of the whole site — the one place its shape is written down.
//
// A hundred routes hang off nineteen header links, and the complaint was
// always the same: "I know it exists, I can't find it." The header can only
// hold so much, so this is the full list behind it: every destination a
// visitor might ask for, in the group they would ask for it under, with a
// line saying what it is. The search palette reads it, the "Where to" grid
// on the home page reads it, and the tests hold the header to it.
//
// Cards has its own map in src/lib/cards/sections.ts; this one folds it in
// rather than restating it, so a new cards page shows up everywhere at once.

import { cardsSections } from "@/lib/cards/sections";
import type { LeagueView } from "@/lib/league/context";
import { leaguePath } from "@/lib/league/links";
import { ABOUT_DESTINATIONS } from "@/lib/site/about";
import { playDestinationHref } from "@/lib/play/destinations";

export interface SiteDestination {
  label: string;
  href: string;
  /** One line saying what is there, in the visitor's words. */
  blurb: string;
  /** Other names people call it — "cheat sheet", "pickems" — for search. */
  keywords?: string[];
  /** A page under a tab (a cards sub-tab). The home grid shows only the
   *  top level; search sees everything. */
  nested?: boolean;
  /** Behind the premium role. Search shows it with a "Premium" pill so a
   *  click that lands on a wall is never a surprise. */
  gated?: boolean;
}

export interface SiteGroup {
  key: "league" | "cards" | "premium" | "daily" | "info";
  label: string;
  blurb: string;
  items: SiteDestination[];
}

function leagueGroup(view: LeagueView): SiteGroup {
  return {
    key: "league",
    label: "League",
    blurb: "The season itself: who is playing, when, and how it is going",
    items: [
      { label: "Players", href: leaguePath("players", view), blurb: "Every player in the pool, by role and rank", keywords: ["roster", "player list", "pool"] },
      { label: "Teams", href: leaguePath("teams", view), blurb: "Every franchise, its roster and its record", keywords: ["franchises", "rosters"] },
      { label: "Schedule", href: leaguePath("schedule", view), blurb: "Every fixture, past results and what is next", keywords: ["fixtures", "matches", "games", "results"] },
      { label: "Standings", href: leaguePath("standings", view), blurb: "The table: every team's record, form and the race week by week", keywords: ["table", "ladder", "record", "rankings", "who is winning"] },
      { label: "Stats", href: leaguePath("stats", view), blurb: "Player and champion numbers from every game", keywords: ["kda", "leaderboard", "champions"] },
      { label: "My Team", href: leaguePath("my-team", view), blurb: "Your roster, your scouting, your week" },
      { label: "Scouting", href: `${leaguePath("my-team", view)}/scouting`, blurb: "Your next opponent's champions and habits", nested: true, keywords: ["scout", "opponent"] },
      { label: "Auction Draft", href: "/draft", blurb: "The season's draft board and every nomination", keywords: ["draft room", "auction"] },
    ],
  };
}

function cardsGroup(view: LeagueView): SiteGroup {
  const base = view === "academy" ? "/academy/cards" : "/cards";
  const items: SiteDestination[] = [];
  // Browse and its sub-pages are open to everyone, and so are the odds
  // and the league-wide ledger; everything that owns, opens, trades or
  // plays needs the role.
  const OPEN = new Set([`${base}/rarities`, `${base}/expeditions/ledger`]);
  for (const section of cardsSections(base)) {
    const gated = section.key !== "browse";
    // The first sub-tab is the tab's own page, listed once as the tab — so
    // its keywords (and its old name) ride on the tab's entry.
    const ownPage = (section.children ?? []).find((child) => child.href === section.href);
    const sectionKeywords = section.key === "home" ? ["player cards", "collect", "collection hub"] : section.key === "collection" ? ["binder", "my cards"] : section.key === "packs" ? ["open a pack", "rip", "daily rip"] : [];
    const keywords = [...sectionKeywords, ...(ownPage?.keywords ?? [])];
    items.push({
      label: section.key === "home" ? "Cards" : section.label,
      href: section.href,
      blurb: section.blurb,
      ...(keywords.length ? { keywords } : {}),
      ...(gated ? { gated: true } : {}),
    });
    for (const child of section.children ?? []) {
      if (child.href === section.href) continue;
      const childGated = gated && !OPEN.has(child.href);
      items.push({
        label: child.label,
        href: child.href,
        blurb: child.blurb,
        nested: true,
        ...(child.keywords ? { keywords: child.keywords } : {}),
        ...(childGated ? { gated: true } : {}),
      });
    }
  }
  return {
    key: "cards",
    label: "Cards",
    blurb: "Collect the league: packs, your shelf, the market, and games to play with it",
    items,
  };
}

function premiumGroup(view: LeagueView): SiteGroup {
  return {
    key: "premium",
    label: "Premium",
    blurb: "The extras: betting dollars, the show, the drafter",
    items: [
      { label: "Premium HQ", href: playDestinationHref("premium", view), blurb: "Everything premium in one place", keywords: ["premium hub"] },
      { label: "Betting", href: playDestinationHref("betting", view), blurb: "Bet betting dollars on the week's games", keywords: ["bets", "pickems", "props", "wallet", "dollars"], gated: true },
      { label: "Betting leaderboard", href: "/betting/leaderboard", blurb: "Who has the most betting dollars", keywords: ["richest"], gated: true },
      { label: "Your betting profile", href: "/betting/profile", blurb: "Your bets, your record, your ledger", nested: true, keywords: ["my bets", "history"], gated: true },
      { label: "The Daily Stu", href: playDestinationHref("daily-stu", view), blurb: "The show, every day", keywords: ["bangers", "podcast", "stu"], gated: true },
      { label: "Match Drafter", href: "/drafter", blurb: "Run a pick-ban draft with friends", keywords: ["pick ban", "draft tool", "lobby"], gated: true },
      { label: "Skin lines", href: "/skin-lines", blurb: "The parallels patrons are voting on", nested: true, keywords: ["parallels", "foils", "mockups"], gated: true },
    ],
  };
}

function dailyGroup(view: LeagueView): SiteGroup {
  return {
    key: "daily",
    label: "Daily games",
    blurb: "Daily puzzles share a reward by league and Eastern puzzle date",
    items: [
      { label: "FPL'dle", href: playDestinationHref("fpldle", view), blurb: "Find today's league player in five guesses", keywords: ["wordle", "fpldle", "daily puzzle"], gated: true },
      { label: "Higher or Lower", href: playDestinationHref("higher-lower", view), blurb: "Call whether the challenger card rates higher or lower", keywords: ["higher lower", "run score"], gated: true },
    ],
  };
}

const INFO_GROUP: SiteGroup = {
  key: "info",
  label: "About",
  blurb: "How FPL works, its rules, and ways to take part",
  items: [
    { ...ABOUT_DESTINATIONS[0], blurb: "What FPL is, how to join the Premier player pool, and shared resources", keywords: ["info", "about", "faq"] },
    { ...ABOUT_DESTINATIONS[1], blurb: "The complete official rulebook", keywords: ["rules", "rulebook"] },
    { ...ABOUT_DESTINATIONS[2], blurb: "What is free, what Premium opens, and how patronage supports FPL", keywords: ["premium", "patron", "patrons", "supporters", "price", "membership", "how to get premium", "role", "perks"] },
    { ...ABOUT_DESTINATIONS[3], blurb: "Every way to earn and spend play money, with a glossary of card terms", keywords: ["economy", "money", "betting dollars", "earn", "wallet", "daily", "weekly"] },
    { label: "Sign up", href: "/signup", blurb: "Open the current Premier player-pool signup form", keywords: ["register", "join", "registration"], nested: true },
    { label: "League resources", href: "/info#league-resources", blurb: "Open the shared links and documents", keywords: ["league links", "masterdoc", "discord", "twitch", "sheets", "resources"], nested: true },
    { label: "Developer support", href: "/membership#support-devs", blurb: "Find PayPal and Venmo options for supporting the developers", keywords: ["donate", "donation", "tip", "paypal", "venmo", "support the devs"], nested: true },
    { label: "Current patrons", href: "/membership#patrons", blurb: "See active public patron listings", keywords: ["supporters", "flame holders", "patron list"], nested: true },
    { label: "Card terms", href: "/economy#glossary", blurb: "Definitions for shine, dust, relics, binders, and more", keywords: ["glossary", "terms", "shine", "dust", "relic", "what is"], nested: true },
    { label: "Dust", href: "/economy#term-dust", blurb: "What dust is and how dusting works", keywords: ["dust glossary", "dust definition"], nested: true },
    { label: "Shine", href: "/economy#shine", blurb: "What shine is and where cards use it", keywords: ["shine definition", "what is shine"], nested: true },
    { label: "Identity claims", href: "/identity-claims", blurb: "Roster identity requests waiting on a captain or admin", nested: true, keywords: ["riot id", "claim identity", "verify"] },
  ],
};

/** The whole site, grouped, for one league's point of view. */
export function siteDirectory(view: LeagueView): SiteGroup[] {
  return [leagueGroup(view), cardsGroup(view), premiumGroup(view), dailyGroup(view), INFO_GROUP];
}

/** Every destination flat, with its group's name attached as a hint. */
export function siteDestinations(view: LeagueView): (SiteDestination & { group: SiteGroup["label"] })[] {
  return siteDirectory(view).flatMap((group) => group.items.map((item) => ({ ...item, group: group.label })));
}
