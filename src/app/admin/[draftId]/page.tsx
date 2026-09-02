import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { fetchStaffTier } from "@/lib/auth/staffTier";
import type { Draft, Player, Profile, Team } from "@/lib/draft/types";
import DraftSetupEditor from "@/components/admin/DraftSetupEditor";

export default async function AdminDraftPage({
  params,
}: {
  params: Promise<{ draftId: string }>;
}) {
  const { draftId } = await params;
  const supabase = await createServerSupabase();
  const { isAdmin, isOwner } = await fetchStaffTier(supabase);
  if (!isAdmin) redirect("/");

  const [draftRes, teamsRes, playersRes, profilesRes] = await Promise.all([
    supabase.from("drafts").select("*").eq("id", draftId).single(),
    supabase.from("teams").select("*").eq("draft_id", draftId).order("nomination_position"),
    supabase.from("players").select("*").eq("draft_id", draftId).order("display_name"),
    supabase.from("profiles").select("*").order("display_name"),
  ]);

  if (!draftRes.data) redirect("/admin");

  return (
    <main className="page-backdrop mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-16">
      <h1 className="type-display text-2xl text-white">
        Setup — {(draftRes.data as Draft).name}
      </h1>
      {isOwner ? (
        <DraftSetupEditor
          draft={draftRes.data as Draft}
          teams={(teamsRes.data as Team[]) ?? []}
          players={(playersRes.data as Player[]) ?? []}
          profiles={(profilesRes.data as Profile[]) ?? []}
        />
      ) : (
        <p className="text-sm text-muted">Some league configuration is owner-only.</p>
      )}
    </main>
  );
}
