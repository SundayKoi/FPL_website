// The four things a signed-in visitor most often opens the home page to
// do. People said the site was hard to find things on, so these are the
// first buttons a member sees, on either home layout.

import type { LeagueView } from "@/lib/league/context";
import { leaguePath } from "@/lib/league/links";
import { PREMIUM_NAME, PREMIUM_PRICE_LABEL } from "@/lib/site/discord";
import type { HomeViewer } from "./viewer";

export interface HomeShortcut {
  label: string;
  hint: string;
  href: string;
  /** The one tile that should stand out: today's pack, or the way into Premium. */
  accent?: boolean;
}

/** Empty for a signed-out visitor: they get the "start here" doors instead. */
export function homeShortcuts(league: LeagueView, viewer: HomeViewer): HomeShortcut[] {
  if (viewer === "signed-out") return [];
  const cardsBase = league === "academy" ? "/academy/cards" : "/cards";
  const shared: HomeShortcut[] = [
    { label: "My team", hint: "Roster, scouting, your week", href: leaguePath("my-team", league) },
    { label: "This week's matches", hint: "Schedule and results", href: leaguePath("schedule", league) },
  ];
  return viewer === "premium"
    ? [
        ...shared,
        { label: "Open today's pack", hint: "Your free daily pack", href: `${cardsBase}/packs`, accent: true },
        { label: "Today's FPL'dle", hint: "Guess the player of the day", href: league === "academy" ? "/academy/fpldle" : "/fpldle" },
      ]
    : [
        ...shared,
        { label: "Browse the cards", hint: "Every player, rated from this season", href: `${cardsBase}/browse` },
        { label: `Get ${PREMIUM_NAME}`, hint: `${PREMIUM_PRICE_LABEL} — opens packs, betting and daily games`, href: "/membership", accent: true },
      ];
}
