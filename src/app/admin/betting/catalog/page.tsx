import { redirect } from "next/navigation";
import { requireBettingStaff } from "@/lib/betting/access";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import type { BettingEvent, BettingTeam } from "@/lib/betting/types";
import CatalogAdmin, { type StoreItemRow } from "@/components/admin/betting/CatalogAdmin";

export default async function AdminBettingCatalogPage() {
  try {
    await requireBettingStaff();
  } catch {
    redirect("/");
  }

  const service = createBettingServiceClient();
  const [teamsRes, eventsRes, storeRes] = await Promise.all([
    // synthetic prop-bet outcome rows are engine plumbing, not catalog entries
    service.from("betting_teams").select("*").eq("is_prop_outcome", false).order("name"),
    service.from("betting_events").select("*").order("id"),
    service.from("betting_store_items").select("*").order("id"),
  ]);
  const teams = (teamsRes.data as BettingTeam[] | null) ?? [];
  const events = (eventsRes.data as BettingEvent[] | null) ?? [];
  const storeItems = (storeRes.data as StoreItemRow[] | null) ?? [];

  return (
    <main className="page-backdrop mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-6 py-16">
      <header>
        <span className="label-dash">STAFF ONLY</span>
        <h1 className="type-display mt-3 text-4xl sm:text-5xl">Betting — Catalog</h1>
      </header>
      <CatalogAdmin teams={teams} events={events} storeItems={storeItems} />
    </main>
  );
}
