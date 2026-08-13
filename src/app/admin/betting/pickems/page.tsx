import { redirect } from "next/navigation";
import { requireBettingStaff } from "@/lib/betting/access";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import PickemsAdmin, { type AdminPickemRow, type LegOption } from "@/components/admin/betting/PickemsAdmin";

interface PickemRow {
  id: number;
  event_id: number;
  title: string;
  status: "OPEN" | "LOCKED" | "RESOLVED" | "CANCELLED";
  carryover: number;
  lock_at: string;
}
interface MarketRow {
  id: number;
  title: string | null;
  status: "OPEN" | "LOCKED" | "RESOLVED" | "CANCELLED";
  lock_at: string;
  draw_enabled: boolean;
  team_a_id: number;
  team_b_id: number;
}

async function fetchAdminPickems(): Promise<{ pickems: AdminPickemRow[]; bank: number; legOptions: LegOption[] }> {
  const service = createBettingServiceClient();
  const [pickemsRes, legsRes, cardsRes, bankRes, marketsRes, teamsRes] = await Promise.all([
    service.from("betting_pickems").select("*").order("id", { ascending: false }).limit(50),
    service.from("betting_pickem_legs").select("pickem_id, market_id"),
    service.from("betting_pickem_cards").select("pickem_id, amount"),
    service.from("betting_pickem_bank").select("balance").eq("id", 1).single(),
    service.from("betting_markets").select("id, title, status, lock_at, draw_enabled, team_a_id, team_b_id"),
    service.from("betting_teams").select("id, short_code"),
  ]);

  const pickems = (pickemsRes.data as PickemRow[] | null) ?? [];
  const legs = (legsRes.data as { pickem_id: number; market_id: number }[] | null) ?? [];
  const cards = (cardsRes.data as { pickem_id: number; amount: number }[] | null) ?? [];
  const markets = (marketsRes.data as MarketRow[] | null) ?? [];
  const marketById = new Map(markets.map((m) => [m.id, m]));
  const teamCodes = new Map(((teamsRes.data as { id: number; short_code: string }[] | null) ?? []).map((t) => [t.id, t.short_code]));

  const legsByPickem = new Map<number, number[]>();
  for (const l of legs) legsByPickem.set(l.pickem_id, [...(legsByPickem.get(l.pickem_id) ?? []), l.market_id]);

  const poolByPickem = new Map<number, number>();
  for (const c of cards) poolByPickem.set(c.pickem_id, (poolByPickem.get(c.pickem_id) ?? 0) + c.amount);

  const allLegsSettled = (marketIds: number[]) =>
    marketIds.every((id) => {
      const m = marketById.get(id);
      return m && (m.status === "RESOLVED" || m.status === "CANCELLED");
    });

  const adminPickems: AdminPickemRow[] = pickems.map((p) => {
    const marketIds = legsByPickem.get(p.id) ?? [];
    return {
      id: p.id,
      title: p.title,
      status: p.status,
      carryover: p.carryover,
      lock_at: p.lock_at,
      pool: (poolByPickem.get(p.id) ?? 0) + p.carryover,
      legCount: marketIds.length,
      legLabels: marketIds.map((id) => {
        const m = marketById.get(id);
        if (!m) return `#${id}`;
        return m.title ?? `${teamCodes.get(m.team_a_id) ?? "?"} vs ${teamCodes.get(m.team_b_id) ?? "?"}`;
      }),
      readyToResolve: (p.status === "OPEN" || p.status === "LOCKED") && marketIds.length > 0 && allLegsSettled(marketIds),
    };
  });

  // Legs eligible for a *new* pick'em: OPEN, not locked, no draw option
  // (create_pickem_admin's own guards — validated again server-side there).
  const now = Date.now();
  const legOptions: LegOption[] = markets
    .filter((m) => m.status === "OPEN" && new Date(m.lock_at).getTime() > now && !m.draw_enabled)
    .map((m) => ({
      id: m.id,
      label: m.title ?? `${teamCodes.get(m.team_a_id) ?? "?"} vs ${teamCodes.get(m.team_b_id) ?? "?"}`,
    }));

  return { pickems: adminPickems, bank: (bankRes.data as { balance: number } | null)?.balance ?? 0, legOptions };
}

export default async function AdminBettingPickemsPage() {
  try {
    await requireBettingStaff();
  } catch {
    redirect("/");
  }

  const service = createBettingServiceClient();
  const [{ pickems, bank, legOptions }, eventsRes] = await Promise.all([
    fetchAdminPickems(),
    service.from("betting_events").select("id, name").order("id"),
  ]);
  const events = (eventsRes.data as { id: number; name: string }[] | null) ?? [];

  return (
    <main className="bg-hash mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-6 py-16">
      <header>
        <span className="label-dash">STAFF ONLY</span>
        <h1 className="type-display mt-3 text-4xl sm:text-5xl">Betting — Pick&apos;ems</h1>
      </header>
      <PickemsAdmin pickems={pickems} events={events} legOptions={legOptions} bank={bank} />
    </main>
  );
}
