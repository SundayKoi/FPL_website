// The words the site uses without explaining them — one list, with where
// each one lives.
//
// Shine gates every expedition route and appeared only as a bare number.
// Relic meant two different things on two pages. Card of the Week, the
// binder, the purse and ascension were never introduced. The rarities
// page was the de-facto glossary and was filed under Packs only. This is
// the short glossary the audit asked for, rendered at /glossary and
// linked from the places the words are used.

import { BINDER_SLOTS, PATRON_BINDER_SLOTS } from "@/lib/binder/queries";
import { ASCENSION_MAX } from "@/lib/gauntlet/ascension";
import { PURSE_MAX } from "@/lib/gauntlet/purse";
import { GAUNTLET_ROUNDS } from "@/lib/gauntlet/sim";
import { fmtPoints } from "@/lib/betting/format";

export interface GlossaryTerm {
  /** The anchor on /glossary — `/glossary#shine`. */
  key: string;
  term: string;
  /** One or two sentences, in the player's words. */
  meaning: string;
  /** Where the word is used, and the page that shows it best. */
  href?: string;
  linkLabel?: string;
}

export const GLOSSARY: GlossaryTerm[] = [
  {
    key: "betting-dollars",
    term: "Betting dollars",
    meaning: "The site's play money. Every member's wallet opens with a signup bonus; the same dollars place bets, buy packs, pay market listings and seat you at a Showdown table.",
    href: "/economy",
    linkLabel: "Where they come from and go",
  },
  {
    key: "card",
    term: "Card",
    meaning: "Every player in the league has one card a week, rated from that week's games. A card has a tier (bronze up to challenger), an overall, and stats. Copies of it are what packs pull.",
    href: "/cards/browse",
    linkLabel: "Browse every card",
  },
  {
    key: "copy",
    term: "Copy",
    meaning: "One printed instance of a card, numbered in its print run. You own copies, not cards: the same card can sit on many shelves, foil on one and signed on another.",
    href: "/cards/collection",
    linkLabel: "Your shelf",
  },
  {
    key: "card-of-the-week",
    term: "Card of the Week",
    meaning: "The top-rated card in each role that week — five of them per edition. Only a Card of the Week can print as an Eclipse.",
    href: "/cards",
    linkLabel: "This week's cards",
  },
  {
    key: "foil",
    term: "Foil (parallel)",
    meaning: "A cosmetic finish a copy can print with — Prisma, Aurora, Refractor, Cracked Ice — rolled independently of rarity. Foils dust for more and add shine.",
    href: "/cards/rarities",
    linkLabel: "Every finish, with the real odds",
  },
  {
    key: "eclipse",
    term: "Eclipse",
    meaning: "The rarest parallel: a one-of-one print of a Card of the Week. Whoever holds it is listed in the Vault.",
    href: "/cards/vault",
    linkLabel: "The Vault",
  },
  {
    key: "signed",
    term: "Signed",
    meaning: "A copy that printed with the player's own autograph, drawn once by the player on their card page. Always foil, and the top of the dust table.",
    href: "/cards",
    linkLabel: "Claim and sign your card",
  },
  {
    key: "shine",
    term: "Shine",
    meaning: "How much a copy is worth to an expedition. Its tier is the floor (bronze 1, challenger 8) and every cosmetic stacks on top: foil, signed, shiny, secret. Routes ask for a minimum squad shine, and the ransom on a lost card is priced by it.",
    href: "/cards/expeditions",
    linkLabel: "The routes and what they ask",
  },
  {
    key: "dust",
    term: "Dust",
    meaning: "Turning a copy you do not want into betting dollars. It always pays less than the pack cost — it is for fourth copies. Auto-dust does it for you at the moment of the rip, by rules you set.",
    href: "/cards/collection",
    linkLabel: "Set your auto-dust rule",
  },
  {
    key: "moment",
    term: "Moment",
    meaning: "A card of a single game rather than a player: the rarest performances of the season, minted once each. Moments ride along in the Gauntlet as relics.",
    href: "/cards/moments",
    linkLabel: "The moments",
  },
  {
    key: "plate",
    term: "Team plate",
    meaning: "A whole roster as one composite card. Owning a team's plate counts as chemistry in the Gauntlet.",
    href: "/cards/teams",
    linkLabel: "Team cards",
  },
  {
    key: "relic-card",
    term: "Relic (the card)",
    meaning: "A champion card from the Faceless Drop — the Dealer's Hand — rather than a player card. Prices flat when dusted and carries flat shine.",
    href: "/cards/packs",
    linkLabel: "The drop",
  },
  {
    key: "relic-gauntlet",
    term: "Relic (in the Gauntlet)",
    meaning: "Something else entirely: a modifier you pick between rounds of a Gauntlet run that changes how the fights resolve. Gone when the run ends.",
    href: "/cards/gauntlet",
    linkLabel: "The Gauntlet",
  },
  {
    key: "purse",
    term: "Purse",
    meaning: `The Gauntlet's stake. Every round cleared adds to it — ${fmtPoints(PURSE_MAX)} for all ${GAUNTLET_ROUNDS}. Between fights you bank it and stop, or push it onto the next round and risk the lot.`,
    href: "/cards/gauntlet",
    linkLabel: "The Gauntlet",
  },
  {
    key: "ascension",
    term: "Ascension",
    meaning: `The ladder above a Gauntlet clear. Each of the ${ASCENSION_MAX} levels is a named rule change, cumulative, and the board and the purse weigh a run by the level it was fought at.`,
    href: "/cards/gauntlet",
    linkLabel: "The Gauntlet",
  },
  {
    key: "binder",
    term: "Binder",
    meaning: `The ${BINDER_SLOTS} copies you pin to show off — ${PATRON_BINDER_SLOTS} for patrons — on a public page anyone can open without signing in.`,
    href: "/cards/collection",
    linkLabel: "Pin your binder",
  },
  {
    key: "daily-rip",
    term: "Daily Rip",
    meaning: "Your first pack each day is free. Patrons rip twice. It does not carry over.",
    href: "/cards/packs",
    linkLabel: "Rip today's",
  },
  {
    key: "chase",
    term: "The weekly chase",
    meaning: "A card the whole league is hunting this week; the first collector to pull it claims the chase, and the claim is announced in the Discord.",
    href: "/cards",
    linkLabel: "This week's chase",
  },
  {
    key: "bounty",
    term: "Bounty",
    meaning: "A standing offer on the Market for a card someone wants: post what you will pay, and whoever has a copy sells it to you at that price.",
    href: "/cards/market/bounties",
    linkLabel: "Bounties",
  },
  {
    key: "flame",
    term: "The patron flame",
    meaning: "What patrons carry: a flame in their chosen colour on every card they own and beside their name on the boards. Patronage never changes odds — see what it does and does not buy.",
    href: "/membership",
    linkLabel: "Premium and Patron, side by side",
  },
];

/** A term by its anchor. */
export function glossaryTerm(key: string): GlossaryTerm | undefined {
  return GLOSSARY.find((term) => term.key === key);
}
