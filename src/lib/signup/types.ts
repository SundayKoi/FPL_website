// Row shape for public.signups — mirrors the migration's column list
// (supabase/migrations/20260812000002_signups.sql). Do not rename fields
// here without updating the table.

import type { LolRole } from "@/lib/draft/types";

export type PlayerStatus = "new" | "returning";

export interface SignupRow {
  id: string;
  season: string;
  discord: string;
  riot_id: string;
  opgg: string;
  current_rank: string;
  peak_rank: string;
  primary_role: LolRole;
  secondary_role: LolRole | null;
  captain_interest: boolean;
  player_status: PlayerStatus;
  created_at: string;
}
