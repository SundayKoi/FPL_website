// Row shape for public.fixtures — mirrors the migration's column list
// (supabase/migrations/20260811000001_fixtures.sql). Do not rename fields
// here without updating the table.

export const FIXTURE_STAGES = [
  "week_1",
  "week_2",
  "week_3",
  "week_4",
  "week_5",
  "gauntlet_r1",
  "gauntlet_r2",
  "quarterfinals",
  "semifinals",
  "finals",
] as const;

export type FixtureStage = (typeof FIXTURE_STAGES)[number];

export const DIVISIONS = ["Solari", "Lunari"] as const;
export type Division = (typeof DIVISIONS)[number];

export interface FixtureRow {
  id: string;
  season: string;
  stage: FixtureStage;
  division: Division | null;
  team_a: string | null;
  team_b: string | null;
  scheduled_at: string | null;
  best_of: 1 | 3 | 5;
  score_a: number | null;
  score_b: number | null;
  sort_order: number;
  created_at: string;
}
