import { redirect } from "next/navigation";
import { requireBettingStaff } from "@/lib/betting/access";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import type { BettingTeam } from "@/lib/betting/types";
import CatalogAdmin, { type StoreItemRow } from "@/components/admin/betting/CatalogAdmin";

export default async function AdminBettingCatalogPage() {
  try {
    await requireBettingStaff();
  } catch {
    redirect("/");
  }

  const service = createBettingServiceClient();
  const [teamsRes, eventsRes, storeRes] = await Promise.all([
    service.from("betting_teams").select("*").order("name"),
    service.from("betting_events").select("*").order("id"),
    service.from("betting_store_items").select("*").order("id"),
  ]);
  const teams = (teamsRes.data as BettingTeam[] | null) ?? [];
  const events = (eventsRes.data as { id: number; name: string; description: string | null }[] | null) ?? [];
  const storeItems = (storeRes.data as StoreItemRow[] | null) ?? [];

  return (
    <main className="bg-hash mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-6 py-16">
      <header>
        <span className="label-dash">STAFF ONLY</span>
        <h1 className="type-display mt-3 text-4xl sm:text-5xl">Betting — Catalog</h1>
      </header>
      <CatalogAdmin teams={teams} events={events} storeItems={storeItems} />
    </main>
  );
}
