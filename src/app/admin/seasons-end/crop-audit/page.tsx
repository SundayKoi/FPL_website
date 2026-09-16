import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import BestOfChampionCropAudit from "@/components/admin/BestOfChampionCropAudit";
import { CHAMPIONS } from "@/lib/match-draft/champions";
import { fetchStaffTier } from "@/lib/auth/staffTier";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Best of Champion Crop Audit · FPL Admin" };

/** Developer-only visual audit; access remains behind the existing staff gate. */
export default async function BestOfChampionCropAuditPage() {
  const supabase = await createServerSupabase();
  const staff = await fetchStaffTier(supabase);
  if (!staff.isAdmin && !staff.isOwner) redirect("/admin");

  return (
    <main className="page-backdrop flex w-full flex-1 flex-col gap-6 px-3 py-8 sm:px-5 lg:px-7 2xl:px-10">
      <header className="flex flex-col gap-3">
        <Link href="/admin/seasons-end" className="label-dash w-fit hover:text-coral">← Season&apos;s End</Link>
        <p className="text-xs uppercase tracking-[.3em] text-gold">Developer visual audit</p>
        <h1 className="type-display text-4xl sm:text-6xl">Best of Champion Crops</h1>
        <p className="max-w-3xl text-sm text-steel">
          Review every supported base-skin splash at the same 5:7 ratio used by the real Best of renderer. Adjustments stay in this browser until exported; this surface never writes crop data or awards.
        </p>
      </header>
      <BestOfChampionCropAudit champions={CHAMPIONS.map(({ name, id }) => ({ name, id }))} />
    </main>
  );
}
