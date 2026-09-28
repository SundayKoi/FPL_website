// The header's menus — what each one shows first, and what waits behind
// "More".
//
// People kept saying the site was too complicated and that they could not
// find things. The four menus held 30 links between them, most named
// after features rather than what they are ("The Vault", "The Daily Stu",
// "Premium & Patron"), and one word, Play, meant two different places: a
// header menu of betting and daily games, and a cards tab of fantasy and
// expeditions. So:
//
//  - each menu shows the four or five pages most visits are for, in plain
//    words; the rest are one click further, under More, never removed;
//  - the header's Play is Games, so "Play" only ever means the cards tab.
//
// Every page is still in site search and the directory on the home page.

import type { LeagueView } from "@/lib/league/context";
import { leaguePath } from "@/lib/league/links";

export type MenuKey = "league" | "cards" | "games" | "info";

export interface MenuLink {
  href: string;
  label: string;
}

export interface HeaderMenu {
  key: MenuKey;
  label: string;
  /** Shown as soon as the menu opens. */
  links: MenuLink[];
  /** One click further, behind "More". Empty means no More button. */
  more: MenuLink[];
  /** Pages that light this menu as "where you are", beyond its own links. */
  activePrefixes: string[];
}

export interface HeaderMenuOptions {
  league: LeagueView;
  premiumHref: string;
  showBroadcaster: boolean;
  /** Pages still in admin testing (Guess the Card). */
  showTesting: boolean;
}

export function headerMenus({ league, premiumHref, showBroadcaster, showTesting }: HeaderMenuOptions): HeaderMenu[] {
  const prefix = league === "academy" ? "/academy" : "";
  const cards = `${prefix}/cards`;
  return [
    {
      key: "league",
      label: "League",
      // Schedule and standings first: "who do we play" and "how are we
      // doing" are what most people open the site to find out.
      links: [
        { href: leaguePath("schedule", league), label: "Schedule & results" },
        { href: leaguePath("standings", league), label: "Standings" },
        { href: leaguePath("teams", league), label: "Teams" },
        { href: leaguePath("players", league), label: "Players" },
        { href: leaguePath("stats", league), label: "Stats" },
      ],
      more: [
        { href: "/draft", label: "Auction draft" },
        { href: "/drafter", label: "Pick & ban drafter" },
        ...(showBroadcaster ? [{ href: "/broadcaster", label: "Broadcaster" }] : []),
      ],
      activePrefixes: [],
    },
    {
      key: "cards",
      label: "Cards",
      links: [
        { href: cards, label: "Cards home" },
        { href: `${cards}/collection`, label: "My cards" },
        { href: `${cards}/packs`, label: "Open packs" },
        { href: `${cards}/browse`, label: "Browse all cards" },
      ],
      more: [
        { href: `${cards}/market`, label: "Buy, sell & trade" },
        { href: `${cards}/play`, label: "Fantasy & expeditions" },
      ],
      // Cards owns both leagues' hubs plus the single-card share page and
      // the public binder view, none of which live under a /cards prefix.
      activePrefixes: ["/cards", "/academy/cards", "/card", "/binder"],
    },
    {
      key: "games",
      label: "Games",
      links: [
        { href: `${prefix}/fpldle`, label: "FPL'dle (daily)" },
        { href: `${prefix}/higher-lower`, label: "Higher or Lower" },
        { href: "/betting", label: "Betting" },
        { href: premiumHref, label: "Premium HQ" },
      ],
      more: [
        { href: "/bangers", label: "The Daily Stu (show)" },
        // Still in admin testing: a member who clicked it was bounced
        // straight back to Premium HQ with no explanation.
        ...(showTesting ? [{ href: `${prefix}/guess-the-card`, label: "Guess the Card" }] : []),
      ],
      activePrefixes: [
        "/premium",
        "/betting",
        "/bangers",
        "/fpldle",
        "/higher-lower",
        "/guess-the-card",
        "/academy/fpldle",
        "/academy/higher-lower",
        "/academy/guess-the-card",
      ],
    },
    {
      key: "info",
      label: "Help",
      links: [
        { href: "/info", label: "How the league works" },
        { href: "/membership", label: "How to get Premium" },
        { href: "/rulebook", label: "Rulebook" },
        { href: "/signup", label: "Sign up for next season" },
      ],
      more: [
        { href: "/league-links", label: "Discord, Twitch & links" },
        { href: "/economy", label: "How betting dollars work" },
        { href: "/glossary", label: "What the card words mean" },
        { href: "/supporters", label: "Patrons" },
        { href: "/support-devs", label: "Support the devs" },
      ],
      activePrefixes: [],
    },
  ];
}
