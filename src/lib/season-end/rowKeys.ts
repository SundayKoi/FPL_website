// Keys and field reads the season-end derivations share (derive.ts, duo.ts,
// pairArt.ts, queries.ts). Pure on purpose: duo.ts reaches client bundles.

import type { SeasonRow } from "./derive";

/** A team name compared without regard to case or surrounding space. */
export const teamKey = (team: string): string => team.trim().toLowerCase();

/** "name#tag" exactly as the row spells it — the displayed player identity. */
export const rowIdentity = (row: SeasonRow): string => `${row.summoner_name}#${row.tag}`;

/** A numeric field, or null when it is missing or not a finite number. */
export const finiteField = (row: SeasonRow, field: string): number | null => {
  const value = row[field];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};
