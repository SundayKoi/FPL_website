export type LolRole = "top" | "jungle" | "mid" | "adc" | "support";
export type DraftStatus = "setup" | "live" | "paused" | "complete";
export type LotStatus = "open" | "sold" | "cancelled";
export type Acquisition = "captain" | "free_agency" | "auction";

export const ROLE_ORDER: LolRole[] = ["top", "jungle", "mid", "adc", "support"];

export interface Profile {
  id: string; discord_id: string | null; display_name: string;
  avatar_url: string | null; is_admin: boolean;
}
export interface Draft {
  id: string; name: string; status: DraftStatus; countdown_seconds: number;
  round_minimums: number[]; current_round: number;
  current_nominator_team_id: string | null; paused_time_remaining: string | null;
  created_at: string;
}
export interface Team {
  id: string; draft_id: string; name: string; captain_profile_id: string | null;
  nomination_position: number; budget_start: number; points_remaining: number;
}
export interface Player {
  id: string; draft_id: string; display_name: string; role: LolRole;
  rank: string | null; opgg_url: string | null; notes: string | null;
  team_id: string | null; price: number | null; acquisition: Acquisition | null;
}
export interface Lot {
  id: string; draft_id: string; player_id: string; nominated_by_team_id: string;
  round: number; opening_bid: number; current_bid: number; leading_team_id: string;
  closes_at: string; status: LotStatus; created_at: string; closed_at: string | null;
}
export interface Bid {
  id: number; lot_id: string; team_id: string; amount: number; created_at: string;
}

/** Safely extract a message string from any thrown/returned error shape
 *  (Error, PostgrestError, plain string, or anything else). */
export function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : typeof e === "string" ? e : (e as { message?: string })?.message ?? String(e);
}

/** RPC errors look like "OVER_CAP: your max bid is 12" — extract the code. */
export function errCode(e: unknown): string {
  const msg = e instanceof Error ? e.message : typeof e === "string" ? e : (e as { message?: string })?.message ?? "";
  const m = /^([A-Z_]+):/.exec(msg);
  return m ? m[1] : "UNKNOWN";
}
