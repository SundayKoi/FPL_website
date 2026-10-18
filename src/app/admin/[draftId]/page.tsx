import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { fetchStaffTier } from "@/lib/auth/staffTier";
import type { Draft, Player, Profile, Team } from "@/lib/draft/types";
import DraftSetupEditor from "@/components/admin/DraftSetupEditor";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AdminDraftPage({
  params,
}: {
  params: Promise<{ draftId: string }>;
}) {
  const { draftId } = await params;
  const supabase = await createServerSupabase();
  const { isAdmin, isOwner } = await fetchStaffTier(supabase);
  if (!isAdmin) redirect("/");

  const [draftRes, teamsRes, playersRes, profilesRes, offseasonRes] = await Promise.all([
    supabase.from("drafts").select("*").eq("id", draftId).single(),
    supabase.from("teams").select("*").eq("draft_id", draftId).order("nomination_position"),
    supabase.from("players").select("*").eq("draft_id", draftId).order("display_name"),
    supabase.from("profiles").select("*").order("display_name"),
    // An offseason week's auction: its players aren't the league's, so the
    // league point values don't apply (docs/offseason.md).
    UUID.test(draftId)
      ? supabase
          .from("offseason_weeks")
          .select("id")
          .or(`main_draft_id.eq.${draftId},elimination_draft_id.eq.${draftId}`)
          .limit(1)
      : Promise.resolve({ data: [] }),
  ]);
  const isOffseasonDraft = (offseasonRes.data?.length ?? 0) > 0;

  if (!draftRes.data) redirect("/admin");

  return (
    <main className="page-container page-spacing page-backdrop flex w-full flex-1 flex-col gap-6">
      <h1 className="type-display text-2xl text-white">
        Setup — {(draftRes.data as Draft).name}
      </h1>
      {isOwner ? (
        <DraftSetupEditor
          draft={draftRes.data as Draft}
          teams={(teamsRes.data as Team[]) ?? []}
          players={(playersRes.data as Player[]) ?? []}
          profiles={(profilesRes.data as Profile[]) ?? []}
          leaguePoints={!isOffseasonDraft}
        />
      ) : (
        <p className="text-sm text-muted">Some league configuration is owner-only.</p>
      )}
    </main>
  );
}
