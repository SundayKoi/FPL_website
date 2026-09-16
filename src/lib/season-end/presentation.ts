import type { AwardDefinition } from "./catalog";
import type { AwardWinner } from "./derive";

export interface AwardDisplay {
  headline: string;
  unit: string;
  evidence: string;
  usesTotal: boolean;
}

/** Display rounding is deliberately independent from ranking precision. */
export function roundHalfAwayFromZero(value: number): number {
  if (!Number.isFinite(value)) return value;
  const rounded = Math.round(Math.abs(value));
  return value < 0 ? -rounded : rounded;
}

export function formatInteger(value: number): string {
  const rounded = roundHalfAwayFromZero(value);
  return (Object.is(rounded, -0) ? 0 : rounded).toLocaleString("en-US");
}

function unitFor(award: AwardDefinition): string {
  if (award.unit === "gold") return "$";
  if (award.unit) return award.unit;
  if (award.id === "speedrunners") return "minutes";
  if (award.id === "fortress") return "towers/game";
  return "";
}

function singularUnit(unit: string, value: number): string {
  if (value !== 1) return unit;
  return unit.replace(/\b(pings|casts|purchases|kills|assists|deaths|wards|skillshots|dragons|Barons|pentakills|towers|games|sweeps|steals|plates|takedowns)\b/g, (word) => word.slice(0, -1));
}

function gamesLabel(award: AwardDefinition, games: number): string {
  const unit = award.id === "clean-sweep" ? "series" : "games";
  const singular = unit === "series" ? "series" : "game";
  return `${formatInteger(games)} ${games === 1 ? singular : unit}`;
}

function evidenceFor(award: AwardDefinition, winner: AwardWinner, usesTotal: boolean): string {
  const parts: string[] = [];
  if (winner.evidence?.record) parts.push(winner.evidence.record);
  if (winner.evidence?.mean !== undefined) parts.push(`${formatInteger(winner.evidence.mean)} mean performance`);
  if (winner.evidence?.kda !== undefined) parts.push(`${formatInteger(winner.evidence.kda)} KDA`);
  if (award.id === "best-of-champion") parts.push(`${formatInteger(winner.value)}/100 score`);
  if (winner.detail) parts.push(winner.detail);
  if (winner.total !== undefined && !usesTotal) parts.push(`${formatInteger(winner.total)} total`);
  if (winner.name !== winner.team) parts.push(winner.team);
  parts.push(gamesLabel(award, winner.games));
  return parts.filter(Boolean).join(" · ");
}

function usesTotalFallback(award: AwardDefinition, winner: AwardWinner): boolean {
  return award.totalFallback === true &&
    Boolean(award.totalUnit) &&
    winner.total !== undefined &&
    Number.isFinite(winner.total) &&
    winner.value >= 0 &&
    winner.value < 1;
}

export function formatAwardPresentation(award: AwardDefinition, winner: AwardWinner): AwardDisplay {
  const usesTotal = usesTotalFallback(award, winner);
  const value = usesTotal ? winner.total! : winner.value;
  const unit = singularUnit(usesTotal ? award.totalUnit! : unitFor(award), value);
  return {
    headline: `${formatInteger(value)}${usesTotal ? " total" : ""}`,
    unit,
    evidence: evidenceFor(award, winner, usesTotal),
    usesTotal,
  };
}
