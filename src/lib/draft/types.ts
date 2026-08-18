import type { Division } from "@/lib/schedule/types";

export type LolRole = "top" | "jungle" | "mid" | "adc" | "support";
export type DraftStatus = "setup" | "live" | "paused" | "complete";
export type LotStatus = "open" | "sold" | "cancelled";
export type Acquisition = "captain" | "free_agency" | "auction" | "admin";

export const ROLE_ORDER: LolRole[] = ["top", "jungle", "mid", "adc", "support"];

/** Display names for the five roles — the single copy behind every roster,
 *  pool, and signup listing. */
export const ROLE_LABELS: Record<LolRole, string> = {
  top: "Top",
  jungle: "Jungle",
  mid: "Mid",
  adc: "ADC",
  support: "Support",
};

/** Compact role tags for tight roster rows (team cards, team pages). */
export const ROLE_LABELS_SHORT: Record<LolRole, string> = {
  top: "TOP",
  jungle: "JG",
  mid: "MID",
  adc: "ADC",
  support: "SUP",
};

export interface Profile {
  id: string; discord_id: string | null; display_name: string;
  avatar_url: string | null; is_admin: boolean;
}
export interface Draft {
  id: string; name: string; status: DraftStatus; countdown_seconds: number;
  round_minimums: number[]; current_round: number;
  current_nominator_team_id: string | null; paused_time_remaining: string | null;
  created_at: string; starts_at?: string | null;
}
export interface Team {
  id: string; draft_id: string; name: string; captain_profile_id: string | null;
  captain_profile_id_2: string | null;
  abbreviation: string; image_url: string | null; banner_color: string | null;
  division: Division | null;
  nomination_position: number; budget_start: number; points_remaining: number;
}
export interface Player {
  id: string; draft_id: string; display_name: string; role: LolRole;
  rank: string | null; opgg_url: string | null; notes: string | null;
  canonical_player_id?: string | null;
  team_id: string | null; price: number | null; acquisition: Acquisition | null;
  auto_assigned_from_lot_id?: string | null;
}

export interface RosterSlotView {
  id: string;
  role: LolRole;
  displayName: string;
  opggUrl?: string | null;
  price: number;
  acquisition: Acquisition | null;
  isEmpty?: boolean;
}

export interface RosterTeamView {
  id: string;
  name: string;
  abbreviation: string;
  imageUrl: string | null;
  bannerColor: string;
  division: Division | null;
  captainName: string;
  monogram: string;
  accentClass: string;
  players: RosterSlotView[];
  /** Demo row shown when no draft is featured — has no team page to link to. */
  isPlaceholder?: boolean;
}
export interface Lot {
  id: string; draft_id: string; player_id: string; nominated_by_team_id: string;
  round: number; opening_bid: number; current_bid: number; leading_team_id: string;
  closes_at: string; status: LotStatus; created_at: string; closed_at: string | null;
  sale_action_sequence?: number | null;
}
export interface NemesisPick {
  id: string; draft_id: string; pick_number: number;
  chooser_team_id: string | null; chosen_team_id: string;
  division: Division; created_at: string;
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

/** The human half of an RPC error — errMessage with the "CODE: " prefix
 *  stripped, for surfacing directly in admin/draft UIs. */
export function errDetail(e: unknown): string {
  return errMessage(e).replace(/^[A-Z_]+:\s*/, "");
}
