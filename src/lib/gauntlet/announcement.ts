// The overhaul, announced: one embed for the cards channel that says what
// changed and where the rules are. Pure — the copy is built here so it
// can be read in a test and posted by an admin click, and every number in
// it comes from the config that enforces it.

import { ASCENSION_LEVELS, ASCENSION_MAX, ASCENSION_SCORE_STEP } from "./ascension";
import { CONTRACTS_PER_WEEK } from "./contracts";
import { DRAFTED_HAND_PER_ROLE, DRAFTED_SCORE_MULT } from "./drafted";
import { OPENER_CATALOG } from "./openers";
import { PURSE_MAX, PURSE_STEPS } from "./purse";
import { SET_BONUS_AT } from "./relics";
import { GAUNTLET_ENTRY_FEE } from "./run";

export interface AnnouncementEmbed {
  title: string;
  description: string;
  color: number;
}

const GOLD = 0xe8c14b;

/** The announcement, with the link the rulebook lives behind. */
export function gauntletOverhaulAnnouncement(siteUrl: string): AnnouncementEmbed {
  const rules = `${siteUrl.replace(/\/$/, "")}/cards/gauntlet`;
  const lines = [
    `The Gauntlet has a loop now. Entry is still ${GAUNTLET_ENTRY_FEE}; here is what is new, all of it printed in the rulebook on the page.`,
    "",
    `**🪙 The purse — bank or push.** Every round you win adds real dollars to a purse (${PURSE_STEPS.join(", ")}: ${PURSE_MAX} for a full clear). Between fights you can bank it and stop, or push and put the whole purse on the next round. Lose once and it is gone with the run. Walking away mid-fight forfeits it.`,
    "",
    `**🪜 Ascension.** Clear all eight and the next level opens for the season, up to ${ASCENSION_MAX}: ${ASCENSION_LEVELS.map((entry) => `A${entry.level} ${entry.title}`).join(" · ")}. Each is a named rule on top of the ones below it. The board weighs a run +${Math.round(ASCENSION_SCORE_STEP * 100)}% a level, so climbing is how you win the week.`,
    "",
    `**📜 Contracts.** ${CONTRACTS_PER_WEEK} rotate in every Monday, the same for everyone — win with a protect comp, steal a Baron, beat a wall. Each pays once a week, in dollars, the first time a round you win does it.`,
    "",
    `**◆ Openers.** Contracts finished this season unlock ${OPENER_CATALOG.length} small starting perks, in order, kept for the season. The only permanent power in the mode.`,
    "",
    `**🃏 New relics.** Six that change a rule instead of a number: THE SECOND WIND, THE ORACLE, HEAD START, THE REMATCH, THE SAFE HOUSE, THE FIXER. And ${SET_BONUS_AT} relics of a family now land a set bonus.`,
    "",
    `**🎴 Drafted mode.** Deal a hand — ${DRAFTED_HAND_PER_ROLE} random cards per role from your own shelf — and build from those. The board pays it ×${DRAFTED_SCORE_MULT}.`,
    "",
    `Every rule, every number: ${rules}`,
  ];
  return { title: "⚔ THE GAUNTLET — the overhaul", description: lines.join("\n"), color: GOLD };
}
