import "server-only";
import { createBettingServiceClient } from "./service-client";
import { computePools } from "./pools";
import { fmtPoints } from "./format";
import type { BettingTeam, MarketStatus } from "./types";

// Data-shaping layer for the Discord embed / opengraph-image share cards
// (Task 13). Reads mirror discord-announcer's resolveSummary()
// (supabase/functions/discord-announcer/index.ts) for the winner/payout
// math — that function can't be imported here (it's a Deno edge function),
// so the same table reads + arithmetic are reimplemented against the
// service client, reusing computePools() (pools.ts) for pool aggregation
// like the rest of the query layer (queries.ts).

interface MarketRow {
  id: number;
  team_a_id: number;
  team_b_id: number;
  title: string | null;
  status: MarketStatus;
  draw_enabled: boolean;
  drawn: boolean;
  winning_team_id: number | null;
}

interface BetRow {
  discord_id: string;
  team_id: number | null;
  is_draw: boolean;
  amount: number;
  payout: number | null;
}

/** Winner + payout stats for a resolved market's share card. `winner` is the
 * winning BettingTeam (null for a draw, or for the — RPC-guarded-against but
 * still handled defensively — case where `winning_team_id` doesn't match
 * either side). */
export interface ShareResolve {
  drawn: boolean;
  winner: BettingTeam | null;
  pool: number;
  winners: number;
  topUsername: string | null;
  topProfit: number | null;
}

/** Everything a share-card route needs to render one market: the open
 * matchup, the market page's opengraph-image, and — once RESOLVED — the
 * result card. `resolve` is only populated for a RESOLVED market. */
export interface ShareModel {
  id: number;
  title: string;
  status: MarketStatus;
  team_a: BettingTeam;
  team_b: BettingTeam;
  pool_a: number;
  pool_b: number;
  pool_draw: number;
  draw_enabled: boolean;
  resolve: ShareResolve | null;
}

/** Builds the share-card data for one market. Returns `null` for an unknown
 * market id (or one whose team rows are missing) — callers 404 on `null`. */
export async function shareModel(marketId: number): Promise<ShareModel | null> {
  const service = createBettingServiceClient();

  const { data: marketData } = await service.from("betting_markets").select("*").eq("id", marketId).maybeSingle();
  const market = marketData as MarketRow | null;
  if (!market) return null;

  const { data: teamsData } = await service
    .from("betting_teams")
    .select("*")
    .in("id", [market.team_a_id, market.team_b_id]);
  const teams = new Map(((teamsData as BettingTeam[] | null) ?? []).map((t) => [t.id, t]));
  const teamA = teams.get(market.team_a_id);
  const teamB = teams.get(market.team_b_id);
  if (!teamA || !teamB) return null;

  const { data: betsData } = await service
    .from("betting_bets")
    .select("discord_id, team_id, is_draw, amount, payout")
    .eq("market_id", marketId);
  const bets = (betsData as BetRow[] | null) ?? [];

  const { poolA, poolB, poolDraw } = computePools(bets, teamA.id, teamB.id);
  const title = market.title ?? `${teamA.name} vs ${teamB.name}`;

  let resolve: ShareResolve | null = null;
  if (market.status === "RESOLVED") {
    const winner = market.drawn ? null : market.winning_team_id === teamA.id ? teamA : market.winning_team_id === teamB.id ? teamB : null;
    const winningBets = bets.filter((b) => (market.drawn ? b.is_draw : b.team_id === market.winning_team_id));
    const pool = bets.reduce((sum, b) => sum + b.amount, 0);

    let topUsername: string | null = null;
    let topProfit: number | null = null;
    if (winningBets.length > 0) {
      let top = winningBets[0];
      let topP = (top.payout ?? 0) - top.amount;
      for (const b of winningBets.slice(1)) {
        const p = (b.payout ?? 0) - b.amount;
        if (p > topP) {
          top = b;
          topP = p;
        }
      }
      if (topP > 0) {
        const { data: profile } = await service.from("betting_profiles").select("username").eq("discord_id", top.discord_id).maybeSingle();
        topUsername = (profile as { username: string | null } | null)?.username ?? top.discord_id;
        topProfit = topP;
      }
    }

    resolve = { drawn: market.drawn, winner, pool, winners: winningBets.length, topUsername, topProfit };
  }

  return {
    id: market.id,
    title,
    status: market.status,
    team_a: teamA,
    team_b: teamB,
    pool_a: poolA,
    pool_b: poolB,
    pool_draw: poolDraw,
    draw_enabled: market.draw_enabled,
    resolve,
  };
}

/** The result card's stat line — "N winner(s) split $pool", plus the top
 * win when there is one. Mirrors discord-announcer's resolvedDescription()
 * text (minus its emoji/Discord markdown, since this renders onto an image
 * rather than into a chat message). */
export function resultSummaryLine(resolve: ShareResolve): string {
  if (resolve.winners === 0) return "Nobody backed the winning side — every stake was refunded.";
  const base = `${resolve.winners} winner${resolve.winners !== 1 ? "s" : ""} split ${fmtPoints(resolve.pool)}`;
  if (resolve.topUsername && (resolve.topProfit ?? 0) > 0) {
    return `${base} — biggest win: ${resolve.topUsername} +${fmtPoints(resolve.topProfit ?? 0)}`;
  }
  return base;
}

/** The result card's headline — the winning team's name, "IT'S A DRAW", or a
 * neutral "RESULT" fallback for the (RPC-guarded-against) case where neither
 * applies. */
export function resultHeadline(resolve: ShareResolve): string {
  if (resolve.drawn) return "IT'S A DRAW";
  if (resolve.winner) return `${resolve.winner.name.toUpperCase()} WINS`;
  return "RESULT";
}
