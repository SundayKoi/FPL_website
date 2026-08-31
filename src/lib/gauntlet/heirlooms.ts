// Heirlooms: the shelf's relics, brought into a run.
//
// Moments, roster plates and champions relics were the rarest things a
// pack could produce and the only things in the collection with no use.
// They can't be fielded — a moment has no role and no stat line — so they
// sat on the shelf as dust objects, which is a strange fate for a 2% pull.
//
// So one of them can come along. An heirloom is NOT a sixth player: it
// takes no role, fights no lane, and never enters the lineup average. It
// hands the run a small effect and stays in the case.
//
// THE DESIGN RULE: an heirloom is an EDGE, and the bracket stays fair.
// Difficulty is priced off the raw lineup average (bracketTarget), exactly
// as Fresh Legs is — the bracket does not rise to meet an heirloom, so
// bringing one is worth something. That means the size of the effect is
// the whole balance question, and it is measured rather than chosen: see
// the calibration in heirlooms.test.ts.
//
// Everything an heirloom does is expressed as RelicEffects, which is why
// the engine needed no changes at all to accept one. It is aggregated
// alongside the run's real relics and compounds with them the same way.

import type { MomentFamily } from "@/lib/cards/moments";
import { momentFamilyOf } from "@/lib/cards/moments";
import type { PlayerCardData } from "@/lib/cards/build";
import type { RelicEffects } from "./relics";
import type { GauntletCard } from "./sim";

/** What kind of shelf relic came along. */
export type HeirloomKind = "moment" | "plate";

/** The heirloom as the run row stores it — frozen at entry like the
 *  lineup, so a re-print or a re-grade mid-run can't change what it does. */
export interface StoredHeirloom {
  inventoryId: number;
  kind: HeirloomKind;
  /** Printed on the draft screen and the scouting strip. */
  title: string;
  /** Moments only: which colorway family, and so which dial. */
  family?: MomentFamily;
  /** Plates only: whose roster it is, for the chemistry match. */
  teamName?: string | null;
}

/**
 * What each moment family is worth, by the dial its colorway is already
 * about: ember burns for fights, void for heists and objectives, ice for
 * perfection and defiance (the base hold), gold for what a beat pays.
 *
 * The numbers are NOT equal because the beats are not equal. A point on
 * the hold is worth roughly a quarter of a point on a fight (measured in
 * foe.ts's BEAT_VALUE, the same sim), so ice carries more of them to be
 * worth the same as ember. Calibrated to land within a point of each
 * other in clear rate; the test measures all four.
 */
export const MOMENT_EFFECTS: Record<MomentFamily, RelicEffects> = {
  ember: { fightFlat: 2 },
  void: { objectivesFlat: 1.2 },
  ice: { holdFlat: 6.5, comebackFlat: 1.7 },
  gold: { goldMult: 1.16, goldEdgeMult: 1.11 },
};

/** How much a roster plate multiplies chemistry, per card of that team in
 *  your five. A plate for a team you field nobody from does nothing at
 *  all — which is the point: the plate is a reason to field THAT five. */
export const PLATE_CHEMISTRY_PER_MATCH = 0.16;

/** The most a plate can multiply by, so a full five of one roster is a
 *  strong build rather than a solved one. */
export const PLATE_CHEMISTRY_CAP = 1.6;

/** Reads a collection copy as an heirloom, or null when it isn't one.
 *  Champions relics are deliberately absent for now: they belong to a set
 *  that pays its own way, and giving them a second job is a balance
 *  question of its own. */
export function heirloomOf(inventoryId: number, card: PlayerCardData): StoredHeirloom | null {
  if (card.moment) {
    return {
      inventoryId,
      kind: "moment",
      title: card.moment.title,
      family: momentFamilyOf(card.moment.triggerKey),
    };
  }
  if (card.team) {
    return {
      inventoryId,
      kind: "plate",
      title: `${card.team.abbr || card.team.monogram} roster`,
      teamName: card.team.teamName,
    };
  }
  return null;
}

/** How many of the five actually played for the plate's team. */
export function plateMatches(heirloom: StoredHeirloom | null, lineup: GauntletCard[]): number {
  if (!heirloom || heirloom.kind !== "plate" || !heirloom.teamName) return 0;
  const wanted = heirloom.teamName.trim().toLowerCase();
  return lineup.filter((card) => (card.team ?? "").trim().toLowerCase() === wanted).length;
}

/**
 * The heirloom's contribution, as RelicEffects.
 *
 * Pure, and lineup-aware because a plate's whole value is conditional on
 * who you brought. Returns an empty object for no heirloom, an unknown
 * kind, or a plate whose roster you field nobody from — never a partial
 * effect that might read as working.
 */
export function heirloomEffects(
  heirloom: StoredHeirloom | null | undefined,
  lineup: GauntletCard[],
): RelicEffects {
  if (!heirloom) return {};
  if (heirloom.kind === "moment") {
    return heirloom.family ? { ...MOMENT_EFFECTS[heirloom.family] } : {};
  }
  const matches = plateMatches(heirloom, lineup);
  if (matches === 0) return {};
  return {
    chemistryMult: Math.min(PLATE_CHEMISTRY_CAP, 1 + PLATE_CHEMISTRY_PER_MATCH * matches),
  };
}

/** The line the draft screen and the run header print, so what an
 *  heirloom is doing is never a mystery. */
export function heirloomBlurb(heirloom: StoredHeirloom | null | undefined, matches: number): string | null {
  if (!heirloom) return null;
  if (heirloom.kind === "moment") {
    switch (heirloom.family) {
      case "ember":
        return "Ember — your side of both teamfights runs hotter.";
      case "void":
        return "Void — every dragon, herald and Baron contest leans your way.";
      case "ice":
        return "Ice — the base holds, and holds hardest when you are behind.";
      case "gold":
        return "Gold — every beat you win pays more, and the lead is worth more late.";
      default:
        return "An old print, brought along for luck.";
    }
  }
  if (matches === 0) {
    return "Nobody in this five played for them — the plate does nothing. Field one of their players.";
  }
  return `${matches} of your five played for them — chemistry counts for more.`;
}
