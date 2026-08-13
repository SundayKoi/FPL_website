import { redirect } from "next/navigation";
import { requireBettingStaff } from "@/lib/betting/access";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import type { BettingTeam } from "@/lib/betting/types";
import MarketsAdmin, { type AdminMarketRow } from "@/components/admin/betting/MarketsAdmin";

interface MarketRow {
  id: number;
  event_id: number;
  team_a_id: number;
  team_b_id: number;
  title: string | null;
  status: "OPEN" | "LOCKED" | "RESOLVED" | "CANCELLED";
  game_at: string;
  lock_at: string;
  winning_team_id: number | null;
  drawn: boolean;
  draw_enabled: boolean;
  rake_bps: number;
}

/**
 * Every market, newest first (capped at 200 — an admin listing, not the
 * public index, so unlike queries.ts's fetchMarketCards() this deliberately
 * includes RESOLVED/CANCELLED history too).
 */
async function fetchAdminMarkets(): Promise<AdminMarketRow[]> {
  const service = createBettingServiceClient();
  const [marketsRes, teamsRes, eventsRes] = await Promise.all([
    service.from("betting_markets").select("*").order("id", { ascending: false }).limit(200),
    service.from("betting_teams").select("*"),
    service.from("betting_events").select("id, name"),
  ]);

  const markets = (marketsRes.data as MarketRow[] | null) ?? [];
  const teams = new Map(((teamsRes.data as BettingTeam[] | null) ?? []).map((t) => [t.id, t]));
  const eventNames = new Map(((eventsRes.data as { id: number; name: string }[] | null) ?? []).map((e) => [e.id, e.name]));

  if (markets.length === 0) return [];

  const { data: betsData } = await service
    .from("betting_bets")
    .select("market_id, amount")
    .in("market_id", markets.map((m) => m.id));
  const volumeByMarket = new Map<number, number>();
  for (const b of (betsData as { market_id: number; amount: number }[] | null) ?? []) {
    volumeByMarket.set(b.market_id, (volumeByMarket.get(b.market_id) ?? 0) + b.amount);
  }

  return markets
    .filter((m) => teams.has(m.team_a_id) && teams.has(m.team_b_id))
    .map((m) => ({
      id: m.id,
      title: m.title,
      status: m.status,
      event_id: m.event_id,
      event_name: eventNames.get(m.event_id) ?? "—",
      team_a: teams.get(m.team_a_id)!,
      team_b: teams.get(m.team_b_id)!,
      game_at: m.game_at,
      lock_at: m.lock_at,
      winning_team_id: m.winning_team_id,
      drawn: m.drawn,
      draw_enabled: m.draw_enabled,
      rake_bps: m.rake_bps,
      volume: volumeByMarket.get(m.id) ?? 0,
    }));
}

export default async function AdminBettingMarketsPage() {
  try {
    await requireBettingStaff();
  } catch {
    redirect("/");
  }

  const service = createBettingServiceClient();
  const [markets, teamsRes, eventsRes] = await Promise.all([
    fetchAdminMarkets(),
    service.from("betting_teams").select("*").order("name"),
    service.from("betting_events").select("*").order("id"),
  ]);
  const teams = (teamsRes.data as BettingTeam[] | null) ?? [];
  const events = (eventsRes.data as { id: number; name: string }[] | null) ?? [];

  return (
    <main className="bg-hash mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-16">
      <header>
        <span className="label-dash">STAFF ONLY</span>
        <h1 className="type-display mt-3 text-4xl sm:text-5xl">Betting — Markets</h1>
      </header>
      <MarketsAdmin markets={markets} teams={teams} events={events} />
    </main>
  );
}
