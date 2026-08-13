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
