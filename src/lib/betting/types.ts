// Shared types for the betting domain — mirrors the RPC surface from
// supabase/migrations/20260813000001_betting_schema.sql and
// 20260813000002_betting_wallet_rpcs.sql. Do not rename fields here without
// checking access.ts/wallet.ts and their callers.

/** Discord guild-membership lookup result for one Discord id. */
export interface GuildMember {
  inGuild: boolean;
  roles: string[];
}

/** Result of the betting access gate for one Discord id. */
export interface BettingAccessResult {
  allowed: boolean;
  staff: boolean;
  /** true when Discord couldn't be reached — `allowed` fails open in that case. */
  inconclusive: boolean;
}

/** The signed-in user's betting identity + wallet. */
export interface BettingUser {
  discordId: string;
  profileId: string;
  username: string;
  balance: number;
  allowed: boolean;
  staff: boolean;
}

/** Return of requireBettingStaff() — the caller's identity, once authorized. */
export interface BettingStaffContext {
  discordId: string;
  profileId: string;
}

// === UI/query-facing shapes (Task 7: betting pages) =========================
// No market/odds SQL views exist (ported from c:\fpl_gambling\db\migrations,
// which has none either) — these are assembled in src/lib/betting/queries.ts
// by aggregating betting_bets/betting_markets/betting_teams directly, then
// shaped to match c:\fpl_gambling\web\src\api\types.ts's client-facing
// Team/MarketCard/MarketDetail/TopBet for UI logic parity.

/** A betting_teams row. */
export interface BettingTeam {
  id: number;
  name: string;
  short_code: string;
  color: string;
  logo_url: string | null;
}

/** Synthetic pseudo-team for the "Draw" outcome (id -1, the RPC-boundary
 * sentinel from place_bet/resolve_market_admin) — never a stored row. */
export const DRAW_TEAM: BettingTeam = {
  id: -1,
  name: "Draw",
  short_code: "DRAW",
  color: "#8fa0b8",
  logo_url: null,
};

export type MarketStatus = "OPEN" | "LOCKED" | "RESOLVED" | "CANCELLED";

/** One row for the markets index — a market plus its aggregated pools. */
export interface MarketCardData {
  id: number;
  title: string | null;
  status: MarketStatus;
  game_at: string;
  lock_at: string;
  team_a: BettingTeam;
  team_b: BettingTeam;
  pool_a: number;
  pool_b: number;
  pool_draw: number;
  draw_enabled: boolean;
  open_line_prob_a: number | null;
  event_name: string;
}

/** One aggregated "top bet" row for a market's leaderboard strip. */
export interface TopBet {
  discord_id: string;
  username: string;
  team_id: number | null;
  is_draw: boolean;
  amount: number;
}

export interface MarketDetailData extends MarketCardData {
  rules: string | null;
  winning_team_id: number | null;
  drawn: boolean;
  event_id: number;
  top_bets: TopBet[];
}

/** One of the signed-in viewer's unsettled bets on a market. */
export interface OpenBetRow {
  id: number;
  market_id: number;
  team_id: number | null;
  is_draw: boolean;
  amount: number;
}

// === UI/query-facing shapes (Task 8: pick'em, leaderboard, profile) =========
// Shaped to match c:\fpl_gambling\web\src\api\types.ts's Pickem/PickemLeg/
// PickemCard/LeaderRow/MyStats/BetRow for UI logic parity, same convention
// as the Task 7 block above.

/** One leg (market) of a pick'em card. */
export interface PickemLegData {
  market_id: number;
  title: string;
  team_a: BettingTeam;
  team_b: BettingTeam;
  status: MarketStatus;
  winning_team_id: number | null;
}

/** The signed-in viewer's own card on a pick'em, if they have one.
 * `picks` is keyed by market_id (unlike the RPC's jsonb, which keys by the
 * market_id's *text* representation — queries.ts converts on read). */
export interface PickemCardData {
  amount: number;
  picks: Record<number, number>;
  correct: number | null;
  payout: number | null;
  settled: boolean;
}

/** A pick'em — the open/locked series-picking event rendered on the betting
 * index page above markets. */
export interface PickemData {
  id: number;
  title: string;
  status: MarketStatus;
  carryover: number;
  lock_at: string;
  /** Sum of every card's stake plus the carryover — matches the source's
   * `pool = sum(amount) + carryover` (routes_pickems.py's _pickem_payload). */
  pool: number;
  cards: number;
  legs: PickemLegData[];
  my_card: PickemCardData | null;
}

/** One row of the public leaderboard (betting_leaderboard view). */
export interface LeaderboardRow {
  rank: number;
  discord_id: string;
  username: string;
  avatar_url: string | null;
  balance: number;
  profit: number;
  badges: string[];
}

/** Player stats for the profile page — ported from c:\fpl_gambling\api\stats.py's player_stats(). */
export interface ProfileStats {
  wins: number;
  losses: number;
  profit: number;
  biggest_win: number;
  current_streak: number;
  best_streak: number;
  perfect_pickems: number;
}

/** One row of a bettor's bet history (open or settled) for the profile page. */
export interface BetHistoryRow {
  id: number;
  market_id: number;
  market_title: string | null;
  team_id: number | null;
  is_draw: boolean;
  amount: number;
  payout: number | null;
  settled: boolean;
  created_at: string;
}
