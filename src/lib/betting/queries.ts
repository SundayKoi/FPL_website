import "server-only";
import { createBettingServiceClient } from "./service-client";
import { computePools } from "./pools";
import type {
  BettingTeam,
  MarketDetailData,
  MarketCardData,
  OpenBetRow,
  TopBet,
  PickemData,
  PickemLegData,
  PickemCardData,
  LeaderboardRow,
  ProfileStats,
  BetHistoryRow,
} from "./types";

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

// === Task 8: pick'em, leaderboard, profile ===================================
// No dedicated pick'em SQL view exists (same reasoning as the market cards
// above) — assembled here from betting_pickems/betting_pickem_legs/
// betting_pickem_cards/betting_markets/betting_teams, shaped to match
// c:\fpl_gambling\api\routes_pickems.py's _pickem_payload for parity.
// betting_leaderboard (20260813000006_betting_leaderboard_view.sql) IS a
// real view, per the controller ruling — leaderboard reads go straight
// through it.

interface PickemRow {
  id: number;
  title: string;
  status: MarketDetailData["status"];
  carryover: number;
  lock_at: string;
}

/** How long a resolved/cancelled pick'em's result stays visible on the
 * betting index after the fact, once no pick'em is OPEN/LOCKED — long enough
 * that players who miss the live window still catch the perfect-card banner
 * / their own card's payout before it's replaced by the next night's card.
 * Not ported from the source (c:\fpl_gambling's /events/{id}/pickem is
 * scoped to one event and has no such window); chosen for this task. */
const PICKEM_RESULT_GRACE_HOURS = 48;

/** The pick'em row to show on the betting index: the currently OPEN/LOCKED
 * one if there is one (soonest-to-lock first), otherwise the most recently
 * RESOLVED/CANCELLED one within PICKEM_RESULT_GRACE_HOURS. `null` when
 * neither exists — see fetchOpenPickem's own comment for why this fallback
 * matters (without it, a resolved pick'em's result is unreachable). */
async function fetchPickemRow(service: ReturnType<typeof createBettingServiceClient>): Promise<PickemRow | null> {
  const { data: openData } = await service
    .from("betting_pickems")
    .select("id, title, status, carryover, lock_at")
    .in("status", ["OPEN", "LOCKED"])
    .order("lock_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (openData) return openData as PickemRow;

  const since = new Date(Date.now() - PICKEM_RESULT_GRACE_HOURS * 60 * 60 * 1000).toISOString();
  const { data: recentData } = await service
    .from("betting_pickems")
    .select("id, title, status, carryover, lock_at")
    .in("status", ["RESOLVED", "CANCELLED"])
    .gte("resolved_at", since)
    .order("resolved_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (recentData as PickemRow | null) ?? null;
}

/** The pick'em to render above markets on the betting index page: the live
 * OPEN/LOCKED one, or — for a grace window after it settles — its result,
 * so players who bet on it can still see the outcome instead of the panel
 * simply vanishing the instant it resolves. `null` when there's nothing to
 * show at all. See fetchPickemRow/PICKEM_RESULT_GRACE_HOURS above. */
export async function fetchOpenPickem(discordId?: string): Promise<PickemData | null> {
  const service = createBettingServiceClient();

  const pickem = await fetchPickemRow(service);
  if (!pickem) return null;

  const { data: legRows } = await service.from("betting_pickem_legs").select("market_id").eq("pickem_id", pickem.id);
  const marketIds = ((legRows as { market_id: number }[] | null) ?? []).map((l) => l.market_id);
  if (marketIds.length === 0) return null;

  const [marketsResult, cardsResult] = await Promise.all([
    service.from("betting_markets").select("*").in("id", marketIds),
    service.from("betting_pickem_cards").select("amount").eq("pickem_id", pickem.id),
  ]);
  const markets = (marketsResult.data as MarketRow[] | null) ?? [];
  const teamIds = [...new Set(markets.flatMap((m) => [m.team_a_id, m.team_b_id]))];
  const { data: teamsData } = await service.from("betting_teams").select("*").in("id", teamIds);
  const teams = teamMap((teamsData as BettingTeam[] | null) ?? []);

  const legs: PickemLegData[] = markets
    .filter((m) => teams.has(m.team_a_id) && teams.has(m.team_b_id))
    .sort((a, b) => new Date(a.game_at).getTime() - new Date(b.game_at).getTime() || a.id - b.id)
    .map((m) => {
      const teamA = teams.get(m.team_a_id)!;
      const teamB = teams.get(m.team_b_id)!;
      return {
        market_id: m.id,
        title: m.title ?? `${teamA.short_code} vs ${teamB.short_code}`,
        team_a: teamA,
        team_b: teamB,
        status: m.status,
        winning_team_id: m.winning_team_id,
      };
    });

  const cards = (cardsResult.data as { amount: number }[] | null) ?? [];
  const pool = cards.reduce((sum, c) => sum + c.amount, 0) + pickem.carryover;

  let myCard: PickemCardData | null = null;
  if (discordId) {
    const { data: cardData } = await service
      .from("betting_pickem_cards")
      .select("amount, picks, correct, payout, settled")
      .eq("pickem_id", pickem.id)
      .eq("discord_id", discordId)
      .maybeSingle();
    if (cardData) {
      const c = cardData as { amount: number; picks: Record<string, number>; correct: number | null; payout: number | null; settled: boolean };
      myCard = {
        amount: c.amount,
        picks: Object.fromEntries(Object.entries(c.picks).map(([k, v]) => [Number(k), v])),
        correct: c.correct,
        payout: c.payout,
        settled: c.settled,
      };
    }
  }

  return {
    id: pickem.id,
    title: pickem.title,
    status: pickem.status,
    carryover: pickem.carryover,
    lock_at: pickem.lock_at,
    pool,
    cards: cards.length,
    legs,
    my_card: myCard,
  };
}

interface LeaderboardViewRow {
  discord_id: string;
  username: string;
  avatar_url: string | null;
  balance: number;
  profit: number;
  wins: number;
  losses: number;
  current_streak: number;
  perfect_pickems: number;
}

/** Compact emoji flair from a leaderboard row — ports
 * c:\fpl_gambling\api\stats.py's badges_for()/leaderboard_badges(). */
function badgesFor(currentStreak: number, perfectPickems: number): string[] {
  const badges: string[] = [];
  if (currentStreak >= 3) badges.push(`🔥${currentStreak}`);
  if (perfectPickems >= 1) badges.push(`🎯${perfectPickems}`);
  return badges;
}

/** The public leaderboard — ranked by wallet balance or lifetime net
 * gambling profit, matching c:\fpl_gambling\api\routes_extra.py's GET
 * /leaderboard (`by` query param becomes the ranking column here). */
export async function fetchLeaderboard(by: "balance" | "profit" = "balance", limit = 25): Promise<LeaderboardRow[]> {
  const service = createBettingServiceClient();
  const { data } = await service
    .from("betting_leaderboard")
    .select("*")
    .order(by, { ascending: false })
    .order("discord_id", { ascending: true })
    .limit(limit);
  const rows = (data as LeaderboardViewRow[] | null) ?? [];
  return rows.map((r, i) => ({
    rank: i + 1,
    discord_id: r.discord_id,
    username: r.username,
    avatar_url: r.avatar_url,
    balance: r.balance,
    profit: r.profit,
    badges: badgesFor(r.current_streak, r.perfect_pickems),
  }));
}

/** (current, best) win streaks from a chronological win/loss list. Ports
 * c:\fpl_gambling\api\stats.py's `_streaks()` exactly. */
function streaksOf(results: boolean[]): { current: number; best: number } {
  let best = 0;
  let run = 0;
  for (const won of results) {
    run = won ? run + 1 : 0;
    best = Math.max(best, run);
  }
  let current = 0;
  for (let i = results.length - 1; i >= 0; i--) {
    if (!results[i]) break;
    current++;
  }
  return { current, best };
}

/** Ledger reasons that net into "profit" — see the leaderboard view
 * migration's header note for the full rationale; kept in sync with it. */
const PROFIT_REASONS = [
  "bet_place",
  "bet_payout",
  "cashout",
  "refund",
  "pickem_place",
  "pickem_payout",
  "pickem_refund",
  "pickem_cancel",
];

/** The signed-in viewer's own record/profit/streaks/biggest-win for the
 * profile page — ports c:\fpl_gambling\api\stats.py's player_stats(). Not a
 * SQL view (only the public leaderboard needed one per the controller
 * ruling): assembled here the same way fetchMarketDetail/fetchMarketCards
 * assemble market data, since this is a single viewer's private read. */
export async function fetchProfileStats(discordId: string): Promise<ProfileStats> {
  const service = createBettingServiceClient();

  const { data: betsData } = await service
    .from("betting_bets")
    .select("payout, amount, created_at, id")
    .eq("discord_id", discordId)
    .eq("settled", true)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  const rows = (betsData as { payout: number | null; amount: number; created_at: string; id: number }[] | null) ?? [];
  const graded = rows.filter((r) => r.payout !== r.amount);
  const results = graded.map((r) => (r.payout ?? 0) - r.amount > 0);
  const wins = results.filter(Boolean).length;
  const losses = results.length - wins;
  const biggestWin = graded.reduce((max, r) => Math.max(max, (r.payout ?? 0) - r.amount), 0);
  const { current, best } = streaksOf(results);

  const { data: cardsData } = await service
    .from("betting_pickem_cards")
    .select("pickem_id")
    .eq("discord_id", discordId)
    .gt("payout", 0)
    .not("correct", "is", null);
  const paidCards = (cardsData as { pickem_id: number }[] | null) ?? [];
  let perfectPickems = 0;
  if (paidCards.length > 0) {
    const { data: resolvedPickems } = await service
      .from("betting_pickems")
      .select("id")
      .in(
        "id",
        paidCards.map((c) => c.pickem_id)
      )
      .eq("status", "RESOLVED");
    perfectPickems = ((resolvedPickems as { id: number }[] | null) ?? []).length;
  }

  const { data: ledgerData } = await service.from("betting_ledger").select("delta").eq("discord_id", discordId).in("reason", PROFIT_REASONS);
  const profit = ((ledgerData as { delta: number }[] | null) ?? []).reduce((sum, r) => sum + r.delta, 0);

  return {
    wins,
    losses,
    profit,
    biggest_win: biggestWin,
    current_streak: current,
    best_streak: best,
    perfect_pickems: perfectPickems,
  };
}

/** The signed-in viewer's bet history (open + settled), most recent first —
 * drives the profile page's open-bets/recent-settled lists. */
export async function fetchRecentBets(discordId: string, limit = 50): Promise<BetHistoryRow[]> {
  const service = createBettingServiceClient();
  const { data } = await service
    .from("betting_bets")
    .select("id, market_id, team_id, is_draw, amount, payout, settled, created_at")
    .eq("discord_id", discordId)
    .order("created_at", { ascending: false })
    .limit(limit);
  const bets = (data as Omit<BetHistoryRow, "market_title">[] | null) ?? [];
  if (bets.length === 0) return [];

  const marketIds = [...new Set(bets.map((b) => b.market_id))];
  const { data: marketsData } = await service.from("betting_markets").select("id, title").in("id", marketIds);
  const titles = new Map(((marketsData as { id: number; title: string | null }[] | null) ?? []).map((m) => [m.id, m.title]));

  return bets.map((b) => ({ ...b, market_title: titles.get(b.market_id) ?? null }));
}
