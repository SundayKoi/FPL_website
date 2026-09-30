// What a route asks of a squad and what it can do to a card, in the rules'
// words. The rulebook's ladder (ExpeditionRules) and the route card
// (RouteStep) print the same lines from here.

import { fmtPoints } from "@/lib/betting/format";
import { MYTHIC_NEEDS, type ExpeditionTierDef, type RouteRisk } from "@/lib/expeditions/config";

export const RISK_LABEL: Record<RouteRisk, string> = {
  none: "Nothing can be hurt",
  wounded: "Cards can be wounded",
  lost: "Cards can be lost",
  dead: "Cards can DIE",
};

export const RISK_CLASS: Record<RouteRisk, string> = {
  none: "border-mint/50 text-mint",
  wounded: "border-gold/60 text-gold",
  lost: "border-coral/70 text-coral",
  dead: "border-red-500/80 bg-red-500/10 text-red-300",
};

/** One gate a tier applies. `power` is set on the squad-total gate alone,
 *  so a reader that says "power" (the board) can print its own word there
 *  while the rulebook keeps "shine". */
export interface RequirementPart {
  text: string;
  power?: number;
}

/** The gates a tier actually applies, in the order the line prints them. */
export function requirementParts(def: ExpeditionTierDef): RequirementPart[] {
  const parts: RequirementPart[] = [];
  if (def.patron) parts.push({ text: "patrons only" });
  if (def.minShine > 0) parts.push({ text: `${def.minShine} shine`, power: def.minShine });
  if (def.minFoils > 0) parts.push({ text: `${def.minFoils} foil${def.minFoils === 1 ? "" : "s"}` });
  if (def.minSigned > 0) parts.push({ text: `${def.minSigned} signed` });
  if (def.fragments > 0) parts.push({ text: `${def.fragments} map fragments` });
  if (def.key === "mythic") parts.push(...MYTHIC_NEEDS.map((text) => ({ text })));
  if (def.fee > 0) parts.push({ text: `${fmtPoints(def.fee)} fee` });
  return parts;
}

/** What a tier asks for when it asks for nothing. */
export const NO_REQUIREMENTS = "Anyone can run it";

/** "12 shine · 1 foil" — the gates a tier actually applies, in the rules' words. */
export function requirementLine(def: ExpeditionTierDef): string {
  const parts = requirementParts(def);
  return parts.length === 0 ? NO_REQUIREMENTS : parts.map((part) => part.text).join(" · ");
}
