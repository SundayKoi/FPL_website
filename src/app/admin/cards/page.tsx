import Link from "next/link";
import { redirect } from "next/navigation";
import AdminChampionsDrop from "@/components/schedule/AdminChampionsDrop";
import AdminChase from "@/components/schedule/AdminChase";
import AdminLiveDrops from "@/components/schedule/AdminLiveDrops";
import AdminWeeklyDraw from "@/components/schedule/AdminWeeklyDraw";
import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import { fetchStaffTier } from "@/lib/auth/staffTier";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import { fetchCardEditionWeeks, fetchCardSeason } from "@/lib/cards/queries";
import { fetchChase } from "@/lib/packs/queries";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata = { title: "Cards & rewards — FPL Admin" };
export const dynamic = "force-dynamic";

async function loadCurrentTime() {
  return Date.now();
}

export default async function AdminCardsPage() {
  const supabase = await createServerSupabase();
  const { isOwner } = await fetchStaffTier(supabase);
  if (!isOwner) redirect("/admin");

  const settingsResult = await supabase
    .from("league_settings")
    .select("live_until, live_label, champions_until")
    .eq("id", 1)
    .single();
  const settings = settingsResult.data as { live_until?: string | null; live_label?: string | null; champions_until?: string | null } | null;
  const now = await loadCurrentTime();
  const liveActive = Boolean(settings?.live_until && Date.parse(settings.live_until) > now);
  const championsActive = Boolean(settings?.champions_until && Date.parse(settings.champions_until) > now);

  let chase: { title: string; claimedBy: string | null } | null = null;
  let chaseUnavailable = false;
  try {
    const service = createBettingServiceClient();
    const season = await fetchCardSeason(service, "premier");
    const [week] = season ? await fetchCardEditionWeeks(service, season) : [];
    if (week) {
      const row = await fetchChase(service, week);
      chase = row ? { title: row.title, claimedBy: row.claimedBy } : null;
    }
  } catch {
    chaseUnavailable = true;
  }

  return (
    <main className="page-backdrop mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 text-content sm:px-6 lg:px-8">
      <AdminSectionHeader title="Cards & rewards" description="The controls below have different targets: global drop windows, the current champions edition, the newest Premier edition, and the current global weekly draw." />

      {settingsResult.error ? <p role="alert" className="card-brand p-4 text-sm text-red-300">Reward settings are unavailable. No control values could be confirmed.</p> : null}

      <section className="card-brand flex flex-col gap-3 p-4 sm:p-5" aria-labelledby="live-drops-heading">
        <p className="label-dash">Site-wide window</p>
        <h2 id="live-drops-heading" className="type-display text-xl">Live card drops</h2>
        <AdminLiveDrops liveUntil={settings?.live_until ?? null} liveLabel={settings?.live_label ?? null} active={liveActive} />
      </section>

      <section className="card-brand flex flex-col gap-3 p-4 sm:p-5" aria-labelledby="champions-heading">
        <p className="label-dash">Current champions edition</p>
        <h2 id="champions-heading" className="type-display text-xl">Champions drop</h2>
        <AdminChampionsDrop until={settings?.champions_until ?? null} active={championsActive} />
        <Link href="/admin/champions" className="w-fit text-sm text-action-text underline underline-offset-4">Open champions preview and signing desk →</Link>
      </section>

      <section className="card-brand flex flex-col gap-3 p-4 sm:p-5" aria-labelledby="chase-heading">
        <p className="label-dash">Newest Premier card edition</p>
        <h2 id="chase-heading" className="type-display text-xl">Weekly chase</h2>
        {chaseUnavailable ? <p role="alert" className="text-sm text-red-300">The current chase could not be loaded.</p> : <AdminChase current={chase} />}
      </section>

      <section className="card-brand flex flex-col gap-3 p-4 sm:p-5" aria-labelledby="draw-heading">
        <p className="label-dash">Current global run</p>
        <h2 id="draw-heading" className="type-display text-xl">Weekly draw</h2>
        <AdminWeeklyDraw />
      </section>

      <nav aria-label="Specialist card workspaces" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {[
          ["Season’s End", "/admin/seasons-end", "Review awards and release controls"],
          ["The Send-off", "/admin/sendoff", "Build playoff editions"],
          ["On Air", "/admin/on-air", "Manage caster cards"],
          ["Expedition seasons", "/admin/expeditions", "Review standings and close a season"],
          ["Card claims", "/admin/claims", "Review card ownership requests"],
        ].map(([label, href, detail]) => (
          <Link key={href} href={href} className="card-brand flex min-h-24 flex-col justify-center gap-1 p-4 transition hover:border-border-strong">
            <span className="font-semibold text-content">{label} <span aria-hidden="true">→</span></span>
            <span className="text-xs text-muted">{detail}</span>
          </Link>
        ))}
      </nav>
    </main>
  );
}
