import DraftBoard from "@/components/draft/DraftBoard";
import { createServerSupabase } from "@/lib/supabase/server";

export default async function DraftPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Academy runs a single division, so it has no nemesis draft to hold once the
  // auction finishes. Derived from league_settings rather than a per-draft flag
  // so a future Academy season cannot forget to set it.
  const supabase = await createServerSupabase();
  const { data: settings } = await supabase
    .from("league_settings")
    .select("academy_draft_id")
    .eq("id", 1)
    .single();
  const academyDraftId = (settings as { academy_draft_id?: string | null } | null)?.academy_draft_id;

  return <DraftBoard draftId={id} nemesisEnabled={id !== academyDraftId} />;
}
