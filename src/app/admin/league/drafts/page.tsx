import { redirect } from "next/navigation";
import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import DraftListClient from "@/components/admin/DraftListClient";
import { fetchStaffTier } from "@/lib/auth/staffTier";
import { createServerSupabase } from "@/lib/supabase/server";
import type { Draft } from "@/lib/draft/types";

export const metadata = { title: "Drafts — FPL Admin" };

export default async function AdminDraftsPage() {
  const supabase = await createServerSupabase();
  const { isOwner } = await fetchStaffTier(supabase);
  if (!isOwner) redirect("/admin");
  const result = await supabase.from("drafts").select("*").order("created_at", { ascending: false });

  return (
    <main className="page-backdrop mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 text-content sm:px-6 lg:px-8">
      <AdminSectionHeader title="Drafts" description="Create, schedule, and manage auction drafts. Opening a draft takes you to its focused setup editor." />
      {result.error ? (
        <p role="alert" className="card-brand p-4 text-sm text-red-300">Drafts could not be loaded.</p>
      ) : (
        <DraftListClient initialDrafts={(result.data as Draft[] | null) ?? []} />
      )}
    </main>
  );
}
