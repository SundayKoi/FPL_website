// Where betting dollars come from and where they go — one list, every
// figure imported from the code that pays or charges it.
//
// The audit found the earning routes stated in seven places, three of
// which nobody visits, and the signup bonus living only in a constant.
// This is the single statement of the economy the /economy page renders.
// Nothing here is typed as a number: a row that quietly disagreed with
// the server would be worse than no page, so every figure is read from
// the module that enforces it.

import {
  DAILY_AMOUNT,
  DAILY_GAME_REWARD,
  DAILY_STREAK_MAX,
  DAILY_STREAK_STEP,
  MAXED_DAILY_STREAK,
  PATRON_RECURRING_MULT,
  SIGNUP_BONUS_AMOUNT,
  WEEKLY_AMOUNT,
  patronRecurring,
} from "@/lib/betting/daily";
import { fmtPoints } from "@/lib/betting/format";
import { CHAMPION_DUST, CHAMPIONS_PACK_COST } from "@/lib/cards/champions";
import { MOMENT_DUST } from "@/lib/cards/moments";
import { TEAM_DUST } from "@/lib/cards/teamCards";
import {
  EXPEDITION_TIERS,
  INSURANCE_FEE,
  INSURANCE_PER_WEEK,
  MERCHANT_DOLLARS,
  PATRON_INSURANCE_PER_WEEK,
  RANSOM_BASE,
  RANSOM_PER_SHINE,
  TIER_ORDER,
  payoutRange,
} from "@/lib/expeditions/config";
import { STRANDED_BOUNTY } from "@/lib/expeditions/journal";
import { WEEKLY_PAYOUTS } from "@/lib/fantasy/config";
import { PURSE_MAX, PURSE_STEPS } from "@/lib/gauntlet/purse";
import { GAUNTLET_ENTRY_FEE } from "@/lib/gauntlet/run";
import { LISTING_DAYS, MAX_OPEN_LISTINGS, MAX_OPEN_WANTS } from "@/lib/market/config";
import {
  DUST_VALUES,
  FOIL_DUST_MULT,
  PACK_COST,
  PATRON_DUST_MULT,
  SIGNED_DUST_BASE,
  WEEKLY_DRAW_POT,
} from "@/lib/packs/config";
import { BRACKETS, RAKE_CAP_BIG_BLINDS, RAKE_PCT } from "@/lib/showdown/config";

export interface LedgerRow {
  key: string;
  /** What it is, in the player's words. */
  title: string;
  /** The figure, already formatted — "$250", "$200 – $1,000", "what you stake". */
  figure: string;
  /** How it works and how often, in a sentence or two. */
  detail: string;
  /** Where to go and do it. */
  href: string;
  /** Where the link goes, in words. */
  linkLabel: string;
  /** True when this needs no cards and no waiting — the routes a brand-new
   *  member can take today. */
  free?: boolean;
  /** True when the patron flame changes the figure. */
  patron?: boolean;
}

const dollars = (n: number) => fmtPoints(n);
const range = (min: number, max: number) => `${dollars(min)} – ${dollars(max)}`;
const PATRON_PCT = Math.round((PATRON_RECURRING_MULT - 1) * 100);
const DUST_PATRON_PCT = Math.round((PATRON_DUST_MULT - 1) * 100);

/** The expedition routes as one line: cheapest to richest. */
function expeditionRange(): string {
  const ranges = TIER_ORDER.filter((tier) => EXPEDITION_TIERS[tier].fee === 0 && EXPEDITION_TIERS[tier].target === "none").map(payoutRange);
  const min = Math.min(...ranges.map((r) => r.min));
  const max = Math.max(...ranges.map((r) => r.max));
  return range(min, max);
}

/** Every way dollars come in, the easiest first. */
export const EARN: LedgerRow[] = [
  {
    key: "signup",
    title: "The signup bonus",
    figure: dollars(SIGNUP_BONUS_AMOUNT),
    detail: "Credited once, the first time you sign in with Discord or use a betting command. It is already in your wallet.",
    href: "/betting",
    linkLabel: "See your wallet",
    free: true,
  },
  {
    key: "daily",
    title: "/daily in the Discord",
    figure: `${dollars(DAILY_AMOUNT)} a day, up to ${dollars(MAXED_DAILY_STREAK)}`,
    detail: `Type /daily in the league Discord once a day. Every consecutive day adds ${dollars(DAILY_STREAK_STEP)}, up to day ${DAILY_STREAK_MAX}. Miss a day and the streak starts over. Patrons get ${PATRON_PCT}% more.`,
    href: "/league-links",
    linkLabel: "Find the Discord",
    free: true,
    patron: true,
  },
  {
    key: "weekly",
    title: "/weekly in the Discord",
    figure: dollars(WEEKLY_AMOUNT),
    detail: `Once a week, on top of the daily. Patrons get ${PATRON_PCT}% more.`,
    href: "/league-links",
    linkLabel: "Find the Discord",
    free: true,
    patron: true,
  },
  {
    key: "daily-game",
    title: "The daily games",
    figure: `${dollars(DAILY_GAME_REWARD)} a day (${dollars(patronRecurring(DAILY_GAME_REWARD))} for patrons)`,
    detail: "FPL'dle, Higher or Lower and The Daily Stu share ONE reward a day: the first one you finish pays it, the others are for the streak. They reset at midnight Eastern.",
    href: "/fpldle",
    linkLabel: "Play today's FPL'dle",
    free: true,
    patron: true,
  },
  {
    key: "match-wins",
    title: "Winning your matches",
    figure: "Paid per scheduled win",
    detail: "Players on a roster are paid when their team wins a scheduled league match. The amount is announced in the Discord with the result, and the patron flame raises it.",
    href: "/schedule",
    linkLabel: "See the schedule",
    patron: true,
  },
  {
    key: "betting",
    title: "Betting on the games",
    figure: "Whatever the pool pays",
    detail: "Markets are pari-mutuel: every stake on a game goes into one pool and the winning side splits it in proportion to what they staked. Pick'em is its own pool; perfect cards split it.",
    href: "/betting",
    linkLabel: "Open Betting",
  },
  {
    key: "draw",
    title: "The Weekly Draw",
    figure: `${dollars(WEEKLY_DRAW_POT)} and a pack`,
    detail: "Every copy you own is a ticket. One collector wins every week; nothing to enter.",
    href: "/cards/draw",
    linkLabel: "See the draw",
  },
  {
    key: "fantasy",
    title: "Fantasy",
    figure: WEEKLY_PAYOUTS.map(dollars).join(" / "),
    detail: "Field five cards under the salary cap each week. The top three lineups are paid, first to third. Free to enter.",
    href: "/cards/fantasy",
    linkLabel: "Set a lineup",
  },
  {
    key: "gauntlet",
    title: "The Gauntlet's purse",
    figure: `Up to ${dollars(PURSE_MAX)} a run`,
    detail: `Every cleared round adds to a purse (${PURSE_STEPS.map(String).join(", ")}). Bank it between fights and walk away paid, or push and put the whole purse on the next round. Lose once and it goes with the run.`,
    href: "/cards/gauntlet",
    linkLabel: "Draft a run",
  },
  {
    key: "expeditions",
    title: "Expeditions",
    figure: expeditionRange(),
    detail: `Send three cards out on a route and answer the forks. They come home with dollars — and sometimes changed. Along the way a merchant pays ${dollars(MERCHANT_DOLLARS)} for what the squad has found, and carrying home another player's stranded card is worth ${dollars(STRANDED_BOUNTY)}.`,
    href: "/cards/expeditions",
    linkLabel: "Send a squad",
  },
  {
    key: "dust",
    title: "Dusting spare copies",
    figure: `${dollars(DUST_VALUES.common)} – ${dollars(DUST_VALUES.legendary)} a card`,
    detail: `Common ${dollars(DUST_VALUES.common)}, rare ${dollars(DUST_VALUES.rare)}, epic ${dollars(DUST_VALUES.epic)}, legendary ${dollars(DUST_VALUES.legendary)}. Foils dust for ${FOIL_DUST_MULT}×. A signed copy dusts from ${dollars(SIGNED_DUST_BASE)}, a moment for ${dollars(MOMENT_DUST)}, a team plate for ${dollars(TEAM_DUST)}, a champion relic for ${dollars(CHAMPION_DUST)}. Patrons get ${DUST_PATRON_PCT}% more. Dusting always returns less than the pack cost — it is for fourth copies, not for income.`,
    href: "/cards/collection",
    linkLabel: "Open your collection",
    patron: true,
  },
  {
    key: "market",
    title: "Selling on the Market",
    figure: "What another collector pays",
    detail: `List a copy at a fixed price, or fill a bounty someone has posted for a card they are hunting. A listing runs ${LISTING_DAYS} days; you can have ${MAX_OPEN_LISTINGS} open at once.`,
    href: "/cards/market",
    linkLabel: "Open the Market",
  },
];

/** Every way dollars go out. */
export const SPEND: LedgerRow[] = [
  {
    key: "pack",
    title: "A pack",
    figure: dollars(PACK_COST),
    detail: "Five cards from any week's edition. Your first pack each day is free — the Daily Rip — and patrons rip twice.",
    href: "/cards/packs",
    linkLabel: "Open a pack",
    patron: true,
  },
  {
    key: "faceless",
    title: "A Faceless Pack",
    figure: dollars(CHAMPIONS_PACK_COST),
    detail: "One champion relic from the Dealer's Hand, when the drop is open.",
    href: "/cards/packs",
    linkLabel: "See the drop",
  },
  {
    key: "bets",
    title: "Bets and pick'em stakes",
    figure: "What you stake",
    detail: "A bet is held until the market settles; a losing side pays the winners. You can cash out an open bet before the lock at the current line.",
    href: "/betting",
    linkLabel: "Open Betting",
  },
  {
    key: "market-buys",
    title: "Market buys and bounties",
    figure: "The asking price",
    detail: `Buy a listing outright, or post a bounty for a card you want — you can have ${MAX_OPEN_WANTS} bounties open at once, and the dollars are only taken when someone fills one.`,
    href: "/cards/market",
    linkLabel: "Open the Market",
  },
  {
    key: "gauntlet-fee",
    title: "A Gauntlet run",
    figure: dollars(GAUNTLET_ENTRY_FEE),
    detail: "The entry fee for one run: draft five, climb eight rounds, lose once.",
    href: "/cards/gauntlet",
    linkLabel: "Draft a run",
  },
  {
    key: "showdown",
    title: "A Showdown seat",
    figure: `${range(BRACKETS.low.minBuyIn, BRACKETS.low.maxBuyIn)} or ${range(BRACKETS.open.minBuyIn, BRACKETS.open.maxBuyIn)}`,
    detail: `Hold'em with your cards. Practice tables play for chips and cost nothing. At the Low and Open tables the buy-in is your stack, and pots that see a flop are raked ${Math.round(RAKE_PCT * 100)}%, capped at ${RAKE_CAP_BIG_BLINDS} big blinds.`,
    href: "/cards/showdown",
    linkLabel: "Find a table",
  },
  {
    key: "insurance",
    title: "Expedition insurance",
    figure: dollars(INSURANCE_FEE),
    detail: `Cover one card on a run so it comes home whatever happens. ${INSURANCE_PER_WEEK} a week; patrons get ${PATRON_INSURANCE_PER_WEEK}.`,
    href: "/cards/expeditions",
    linkLabel: "See the routes",
    patron: true,
  },
  {
    key: "ransom",
    title: "Ransoming a lost card",
    figure: `${dollars(RANSOM_BASE)} + ${dollars(RANSOM_PER_SHINE)} per shine`,
    detail: "A card lost on an expedition can be bought back within the week, or rescued by another squad.",
    href: "/cards/expeditions",
    linkLabel: "See the routes",
  },
  {
    key: "exorcism",
    title: "An exorcism",
    figure: dollars(EXPEDITION_TIERS.exorcism.fee),
    detail: "Removes Haunted or Cursed from one card, for good. No loot, no forks.",
    href: "/cards/expeditions",
    linkLabel: "See the routes",
  },
];

/** The one sentence the whole economy is designed around. */
export const ECONOMY_RULE =
  "Nothing you pay for changes a card's odds, anyone's rating, or what comes out of a pack. Dollars buy chances and seats, never results.";
