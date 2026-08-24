// Tunables for the weekly fantasy layer of the card-pack economy. Same
// single-file-balance-pass idea as src/lib/packs/config.ts: the validator,
// the scorer, the server action and the UI all read these constants rather
// than hardcoding their own copy of the rules.

/** The five lineup positions, in board order. Matches the labels the rating
 *  engine puts on a card (`ROLE_LABELS` in src/lib/cards/build.ts) — a card's
 *  `role` string is compared against these directly, so the two lists must
 *  stay spelled identically. */
export const FANTASY_ROLES = ["Top", "Jungle", "Mid", "Bot", "Support"] as const;

export type FantasyRole = (typeof FANTASY_ROLES)[number];

/**
 * Maximum combined OVR of the five fielded cards.
 *
 * The OVRs summed here are the *frozen* edition ratings stored on each owned
 * copy (card_inventory.overall), not the card's live rating — a lineup that
 * fit the cap on Monday must still fit it on Friday after the nightly
 * restat, and an owned copy is a fixed object by design.
 *
 * 360 is an average of 72 per slot: comfortably above the middle of the
 * league (packs skew common, see RARITY_WEIGHTS) but well under five
 * Diamond+ cards, so a whale's collection still has to make choices.
 */
export const SALARY_CAP = 360;

/** Betting dollars paid to 1st/2nd/3rd on a week's leaderboard. Roughly
 *  1.5 / 0.75 / 0.4 packs (PACK_COST 200) — a good week funds the next
 *  week's pack, it doesn't fund a collection. Credited by `fantasy_payout`
 *  (20260826000015_card_packs_fantasy.sql), whose claim-then-pay contract
 *  the scoring job must honor. */
export const WEEKLY_PAYOUTS = [300, 150, 75];

/**
 * Hour (EASTERN, America/New_York) on the week's Monday after which that
 * week's lineup is frozen. 6:00 PM ET sits just before the league's
 * Monday-evening match night — the last moment a lineup can be set without
 * seeing a result. Eastern rather than UTC on purpose: the league runs on
 * ET, and a UTC constant drifted an hour every DST change (and pushed
 * Sunday-evening activity into the wrong week). lockTimeOf converts this
 * to the right UTC instant per week.
 */
export const LOCK_HOUR_ET = 18;
