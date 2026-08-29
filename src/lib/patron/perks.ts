// What patronage actually buys — one list, so the pages can't drift.
//
// Every number here is IMPORTED from the code that enforces it rather
// than typed into copy: the binder slot counts come from the binder, the
// dust multiplier from the pack config, the Sovereign's tenure from the
// flame wardrobe. A perk page that quietly disagrees with the server is
// worse than no perk page, and this is the cheapest way to make that
// impossible.
//
// THE RULE THAT GOVERNS THE WHOLE LIST: nothing a patron pays for
// changes a card's odds, anyone's rating, or what comes out of a pack.
// The dust bonus is the one place money touches a number, and it is
// salvage on cards already owned — never income, never a pull.

import { BINDER_SLOTS, PATRON_BINDER_SLOTS } from "@/lib/binder/queries";
import { PATRON_DUST_MULT } from "@/lib/packs/config";
import { SOVEREIGN_TENURE_DAYS } from "./flames";

export interface PatronPerk {
  key: string;
  /** The glyph the list leads each row with. */
  icon: string;
  title: string;
  /** What it does, in the player's language. */
  blurb: string;
  /** True for the handful the cards hub shows in its short form. */
  headline: boolean;
}

/** Launches per Eastern day, patron vs not. These two live in SQL, not
 *  TS — `launch_expedition` in 20260901000001_card_expeditions.sql sets
 *  `v_limit := case when patron then 2 else 1` — so they can't be
 *  imported; the perks test pins this copy to those numbers instead. */
export const PATRON_EXPEDITION_LAUNCHES = 2;
export const BASE_EXPEDITION_LAUNCHES = 1;

const EXTRA_SLOTS = PATRON_BINDER_SLOTS - BINDER_SLOTS;
const DUST_BONUS_PCT = Math.round((PATRON_DUST_MULT - 1) * 100);
const SOVEREIGN_MONTHS = Math.round(SOVEREIGN_TENURE_DAYS / 30);

export const PATRON_PERKS: PatronPerk[] = [
  {
    key: "flame",
    icon: "🔥",
    title: "The Patron Flame",
    blurb:
      `Pick its colour from the wardrobe on the packs page. It burns on every card you own, beside your ` +
      `name on the betting leaderboards and the Gauntlet's weekly board, and on your chase claims in ` +
      `Discord. The gold, ember-lit Sovereign unlocks after ${SOVEREIGN_MONTHS} months of patronage.`,
    headline: true,
  },
  {
    key: "backs",
    icon: "🎴",
    title: "Your own card backs",
    blurb: "Your packs deal face-down in your flame's colours, for everyone watching the flip.",
    headline: true,
  },
  {
    key: "recurring-rewards",
    icon: "💰",
    title: "50% more recurring rewards",
    blurb:
      "/daily, /weekly, Daily Stu, FPL'dle, and scheduled match wins pay 50% more on their base reward while your patron flame is active.",
    headline: true,
  },
  {
    key: "ink",
    icon: "🖋",
    title: "The patron pen case",
    blurb:
      "Sign your claimed card in gold or crimson ink — and every signed copy of you that ever mints carries it.",
    headline: false,
  },
  {
    key: "rip",
    icon: "🃏",
    title: "A second Daily Rip",
    blurb: "Patrons rip twice a day instead of once. Same odds on both — just another go at them.",
    headline: true,
  },
  {
    key: "expeditions",
    icon: "🧭",
    title: "A second expedition",
    blurb:
      `Launch ${PATRON_EXPEDITION_LAUNCHES} expeditions a day instead of ${BASE_EXPEDITION_LAUNCHES} — two ` +
      `squads of three out in the field at once, earning while you sleep.`,
    headline: true,
  },
  {
    key: "binder",
    icon: "📚",
    title: `The ${PATRON_BINDER_SLOTS}-slot binder`,
    blurb:
      `${EXTRA_SLOTS} extra display slots over the standard ${BINDER_SLOTS}, and your slot-one card floats ` +
      `on a pedestal glow on your public binder page.`,
    headline: false,
  },
  {
    key: "reroll",
    icon: "🎲",
    title: "The weekly re-roll",
    blurb: "Once a week, re-roll the art on one copy you own. Skin only — never rarity, foil, or ink.",
    headline: false,
  },
  {
    key: "dust",
    icon: "💎",
    title: `The ${DUST_BONUS_PCT}% dust bonus`,
    blurb:
      `Every copy you melt pays a fifth more. Dusting still returns less than a pack costs, so it sweetens ` +
      `the salvage without ever becoming an income.`,
    headline: true,
  },
  {
    key: "roll",
    icon: "🕯",
    title: "A place on the Flame Holders",
    blurb: "Your name and flame on the patrons page for as long as your patronage runs.",
    headline: false,
  },
];

/** The short list the cards hub shows — the perks a card collector feels
 *  first, with the full set a click away. */
export const HEADLINE_PATRON_PERKS = PATRON_PERKS.filter((perk) => perk.headline);

/** The line that has to sit under every version of this list. */
export const PATRON_FAIRNESS_NOTE =
  "Patronage increases listed recurring wallet rewards. It never changes betting odds, pack odds, ratings, match results, Fantasy scoring, or Gauntlet placement.";
