import { redirect } from "next/navigation";
import { requireBettingStaff } from "@/lib/betting/access";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import { fetchPendingSuggestions } from "@/lib/betting/queries";
import PropsAdmin from "@/components/admin/betting/PropsAdmin";

export default async function AdminBettingPropsPage() {
  try {
    await requireBettingStaff();
  } catch {
    redirect("/");
  }

  const service = createBettingServiceClient();
  const [suggestions, eventsRes] = await Promise.all([
    fetchPendingSuggestions(),
    service.from("betting_events").select("id, name").order("id"),
  ]);
  const events = (eventsRes.data as { id: number; name: string }[] | null) ?? [];

  return (
    <main className="bg-hash mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-6 py-16">
      <header>
        <span className="label-dash">STAFF ONLY</span>
        <h1 className="type-display mt-3 text-4xl sm:text-5xl">Betting — Prop Suggestions</h1>
        <p className="mt-3 max-w-2xl text-sm text-muted">
          Approving turns a suggestion into a real market (two outcome sides, normal pool betting, auto-announced in
          Discord). Betting locks at the game time you pick.
        </p>
      </header>
      <PropsAdmin suggestions={suggestions} events={events} />
    </main>
  );
}
