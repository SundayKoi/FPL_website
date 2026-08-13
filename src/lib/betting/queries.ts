import "server-only";
import { createBettingServiceClient } from "./service-client";
import { computePools } from "./pools";
import type { BettingTeam, MarketDetailData, MarketCardData, OpenBetRow, TopBet } from "./types";

// Data layer for the betting index/detail pages. Reads go through the
// service client, not the cookie-bound createServerSupabase() — per the
// controller ruling, that client is for session/auth only (see wallet.ts's
// betting_profiles balance read for the existing precedent). RLS's public
// read policies on these tables (20260813000001_betting_schema.sql) mean
// there's nothing privileged in these queries; the service client is used
// purely for consistency of "which client touches betting tables."
//
// No market/odds SQL views exist in the source — pools are aggregated here
// from raw betting_bets rows via computePools() (pools.ts).

interface MarketRow {
  id: number;
  event_id: number;
  team_a_id: number;
  team_b_id: number;
  title: string | null;
  rules: string | null;
  status: "OPEN" | "LOCKED" | "RESOLVED" | "CANCELLED";
  game_at: string;
  lock_at: string;
  winning_team_id: number | null;
  open_line_prob_a: number | null;
  draw_enabled: boolean;
  drawn: boolean;
}

interface BetRow {
  discord_id: string;
  team_id: number | null;
  is_draw: boolean;
  amount: number;
}

const STATUS_RANK: Record<MarketRow["status"], number> = { OPEN: 0, LOCKED: 1, RESOLVED: 2, CANCELLED: 3 };

function teamMap(rows: BettingTeam[]): Map<number, BettingTeam> {
  return new Map(rows.map((t) => [t.id, t]));
}

/** Markets a visitor can currently act on or is about to lose the chance to
 * — OPEN and LOCKED only. Sorted soonest-to-lock first within each status. */
export async function fetchMarketCards(): Promise<MarketCardData[]> {
  const service = createBettingServiceClient();

  const [marketsResult, teamsResult, eventsResult] = await Promise.all([
    service.from("betting_markets").select("*").in("status", ["OPEN", "LOCKED"]),
    service.from("betting_teams").select("*"),
    service.from("betting_events").select("id, name"),
  ]);

  const markets = (marketsResult.data as MarketRow[] | null) ?? [];
  const teams = teamMap((teamsResult.data as BettingTeam[] | null) ?? []);
  const eventNames = new Map(((eventsResult.data as { id: number; name: string }[] | null) ?? []).map((e) => [e.id, e.name]));

  if (markets.length === 0) return [];

  const { data: betsData } = await service
    .from("betting_bets")
    .select("market_id, team_id, is_draw, amount")
    .in(
      "market_id",
      markets.map((m) => m.id)
    );
  const bets = (betsData as (BetRow & { market_id: number })[] | null) ?? [];
  const betsByMarket = new Map<number, BetRow[]>();
  for (const b of bets) {
    const list = betsByMarket.get(b.market_id) ?? [];
    list.push(b);
    betsByMarket.set(b.market_id, list);
  }

  const cards = markets
    .filter((m) => teams.has(m.team_a_id) && teams.has(m.team_b_id))
    .map((m) => {
      const teamA = teams.get(m.team_a_id)!;
      const teamB = teams.get(m.team_b_id)!;
      const { poolA, poolB, poolDraw } = computePools(betsByMarket.get(m.id) ?? [], teamA.id, teamB.id);
      const card: MarketCardData = {
        id: m.id,
        title: m.title,
        status: m.status,
        game_at: m.game_at,
        lock_at: m.lock_at,
        team_a: teamA,
        team_b: teamB,
        pool_a: poolA,
        pool_b: poolB,
        pool_draw: poolDraw,
        draw_enabled: m.draw_enabled,
        open_line_prob_a: m.open_line_prob_a,
        event_name: eventNames.get(m.event_id) ?? "",
      };
      return card;
    });

  cards.sort((x, y) => {
    const rankDiff = STATUS_RANK[x.status] - STATUS_RANK[y.status];
    if (rankDiff !== 0) return rankDiff;
    return new Date(x.lock_at).getTime() - new Date(y.lock_at).getTime();
  });

  return cards;
}

/** Full detail for one market — pools, rules, and a top-bets leaderboard strip. */
export async function fetchMarketDetail(marketId: number): Promise<MarketDetailData | null> {
  const service = createBettingServiceClient();

  const { data: marketData } = await service.from("betting_markets").select("*").eq("id", marketId).single();
  const market = marketData as MarketRow | null;
  if (!market) return null;

  const [teamsResult, eventResult, betsResult] = await Promise.all([
    service.from("betting_teams").select("*").in("id", [market.team_a_id, market.team_b_id]),
    service.from("betting_events").select("name").eq("id", market.event_id).single(),
    service.from("betting_bets").select("discord_id, team_id, is_draw, amount").eq("market_id", marketId),
  ]);

  const teams = teamMap((teamsResult.data as BettingTeam[] | null) ?? []);
  const teamA = teams.get(market.team_a_id);
  const teamB = teams.get(market.team_b_id);
  if (!teamA || !teamB) return null;

  const bets = (betsResult.data as BetRow[] | null) ?? [];
  const { poolA, poolB, poolDraw } = computePools(bets, teamA.id, teamB.id);

  const discordIds = [...new Set(bets.map((b) => b.discord_id))];
  const { data: profilesData } =
    discordIds.length > 0
      ? await service.from("betting_profiles").select("discord_id, username").in("discord_id", discordIds)
      : { data: [] as { discord_id: string; username: string }[] };
  const usernames = new Map(((profilesData as { discord_id: string; username: string }[] | null) ?? []).map((p) => [p.discord_id, p.username]));

  const topBets: TopBet[] = bets
    .map((b) => ({
      discord_id: b.discord_id,
      username: usernames.get(b.discord_id) ?? b.discord_id,
      team_id: b.team_id,
      is_draw: b.is_draw,
      amount: b.amount,
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10);

  return {
    id: market.id,
    event_id: market.event_id,
    title: market.title,
    rules: market.rules,
    status: market.status,
    game_at: market.game_at,
    lock_at: market.lock_at,
    winning_team_id: market.winning_team_id,
    draw_enabled: market.draw_enabled,
    drawn: market.drawn,
    open_line_prob_a: market.open_line_prob_a,
    team_a: teamA,
    team_b: teamB,
    pool_a: poolA,
    pool_b: poolB,
    pool_draw: poolDraw,
    event_name: (eventResult.data as { name: string } | null)?.name ?? "",
    top_bets: topBets,
  };
}

/** The signed-in viewer's unsettled bets on one market — drives the "Your
 * position" / cashout strip on the market detail page. */
export async function fetchOpenBets(discordId: string, marketId: number): Promise<OpenBetRow[]> {
  const service = createBettingServiceClient();
  const { data } = await service
    .from("betting_bets")
    .select("id, market_id, team_id, is_draw, amount")
    .eq("discord_id", discordId)
    .eq("market_id", marketId)
    .eq("settled", false);
  return (data as OpenBetRow[] | null) ?? [];
}
