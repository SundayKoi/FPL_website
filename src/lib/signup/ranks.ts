// Rank dropdown options for the signup form. One flat list of labels
// ("Iron 4" … "Diamond 1", then apex tiers) so both rank questions render
// the same picker and the stored text is uniform — no more mixed
// "D2 67 LP" / "Emerald 3" / "d3" free text like the old Google Sheet.

const DIVISIONED_TIERS = [
  "Iron",
  "Bronze",
  "Silver",
  "Gold",
  "Platinum",
  "Emerald",
  "Diamond",
] as const;

const APEX_TIERS = ["Master", "Grandmaster", "Challenger"] as const;

// Worst → best within each tier (LoL divisions count down: IV is entry).
const DIVISIONS = [4, 3, 2, 1] as const;

/** All selectable ranks, worst → best. */
export const RANK_OPTIONS: readonly string[] = [
  ...DIVISIONED_TIERS.flatMap((tier) => DIVISIONS.map((d) => `${tier} ${d}`)),
  ...APEX_TIERS,
];

export function isRankOption(value: string): boolean {
  return RANK_OPTIONS.includes(value);
}
