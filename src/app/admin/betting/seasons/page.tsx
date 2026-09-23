import { redirect } from "next/navigation";
import { requireBettingStaff } from "@/lib/betting/access";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import SeasonsAdmin, { type SeasonRow } from "@/components/admin/betting/SeasonsAdmin";

export default async function AdminBettingSeasonsPage() {
  try {
    await requireBettingStaff();
  } catch {
    redirect("/");
  }

  const service = createBettingServiceClient();
  const { data } = await service
    .from("betting_seasons")
    .select("id, name, status, started_at, closed_at")
    .order("id", { ascending: false })
    .limit(20);
  const seasons = (data as SeasonRow[] | null) ?? [];

  return (
    <main className="page-container page-spacing page-backdrop flex w-full flex-1 flex-col gap-8">
      <header>
        <span className="label-dash">STAFF ONLY</span>
        <h1 className="type-display mt-3 text-4xl sm:text-5xl">Betting — Seasons</h1>
      </header>
      <SeasonsAdmin seasons={seasons} />
    </main>
  );
}
