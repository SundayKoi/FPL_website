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
      { label: "Stats", href: leaguePath("stats", view), blurb: "Player and champion numbers from every game", keywords: ["kda", "leaderboard", "champions"] },
      { label: "My Team", href: leaguePath("my-team", view), blurb: "Your roster, your scouting, your week", keywords: ["scouting"] },
      { label: "Box scores", href: view === "academy" ? "/academy/box-score" : "/box-score", blurb: "Every game's scoreboard, side by side", keywords: ["scoreboard", "match history"] },
      { label: "Auction Draft", href: "/draft", blurb: "The season's draft board and every nomination", keywords: ["draft room", "auction"] },
    ],
  };
}

function cardsGroup(view: LeagueView): SiteGroup {
  const base = view === "academy" ? "/academy/cards" : "/cards";
  const items: SiteDestination[] = [];
  for (const section of cardsSections(base)) {
    items.push({
      label: section.key === "home" ? "Cards" : section.label,
      href: section.href,
      blurb: section.blurb,
      keywords: section.key === "home" ? ["player cards", "collect", "collection hub"] : section.key === "collection" ? ["binder", "my cards"] : section.key === "packs" ? ["open a pack", "rip", "daily rip"] : undefined,
    });
    for (const child of section.children ?? []) {
      // The first sub-tab is the tab's own page — already listed above.
      if (child.href === section.href) continue;
      items.push({ label: child.label, href: child.href, blurb: child.blurb, nested: true });
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
  const premiumHref = view === "academy" ? "/premium?league=academy" : "/premium";
  return {
    key: "premium",
    label: "Premium",
    blurb: "The extras: betting dollars, the show, the drafter",
    items: [
      { label: "Premium HQ", href: premiumHref, blurb: "Everything premium in one place", keywords: ["premium hub"] },
      { label: "Betting", href: "/betting", blurb: "Bet betting dollars on the week's games", keywords: ["bets", "pickems", "props", "wallet", "dollars"] },
      { label: "Betting leaderboard", href: "/betting/leaderboard", blurb: "Who has the most betting dollars", nested: true, keywords: ["richest"] },
      { label: "The Daily Stu", href: "/bangers", blurb: "The show, every day", keywords: ["bangers", "podcast", "stu"] },
      { label: "Match Drafter", href: "/drafter", blurb: "Run a pick-ban draft with friends", keywords: ["pick ban", "draft tool", "lobby"] },
    ],
  };
}

function dailyGroup(view: LeagueView): SiteGroup {
  const prefix = view === "academy" ? "/academy" : "";
  return {
    key: "daily",
    label: "Daily games",
    blurb: "One a day, for the whole league",
    items: [
      { label: "FPL'dle", href: `${prefix}/fpldle`, blurb: "Guess the player of the day", keywords: ["wordle", "fpldle", "daily puzzle"] },
      { label: "Higher or Lower", href: `${prefix}/higher-lower`, blurb: "Which card rates higher? Keep the streak alive", keywords: ["higher lower", "streak"] },
      { label: "Guess the Card", href: `${prefix}/guess-the-card`, blurb: "Name the card from its stats", keywords: ["guess"] },
    ],
  };
}

const INFO_GROUP: SiteGroup = {
  key: "info",
  label: "Info",
  blurb: "How the league works and how to be part of it",
  items: [
    { label: "About the league", href: "/info", blurb: "What FPL is and how a season runs", keywords: ["info", "about", "faq"] },
    { label: "Sign Up", href: "/signup", blurb: "Register to play next season", keywords: ["register", "join"] },
    { label: "Rulebook", href: "/rulebook", blurb: "Every rule, in one place", keywords: ["rules"] },
    { label: "League Links", href: "/league-links", blurb: "Discord, Twitch, the sheets, and the rest", keywords: ["discord", "twitch", "links"] },
    { label: "Patrons", href: "/supporters", blurb: "The Flame Holders who keep the lights on", keywords: ["supporters", "patron", "flame holders", "perks"] },
    { label: "Support the Devs", href: "/support-devs", blurb: "Chip in for the people who build the site", keywords: ["donate", "tip"] },
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
