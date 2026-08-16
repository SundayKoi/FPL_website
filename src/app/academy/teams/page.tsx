import { createServerSupabase } from "@/lib/supabase/server";
import { fetchAcademyDraftData } from "@/lib/academy/draft";
import { toRosterTeams } from "@/lib/teams/roster";
import { PLACEHOLDER_TEAMS } from "@/components/teams/placeholderTeams";
import TeamsDirectory from "@/components/teams/TeamsDirectory";

export default async function AcademyTeamsPage() {
  const supabase = await createServerSupabase();
  const data = await fetchAcademyDraftData(supabase);
  const hasDraft = Boolean(data.draft);
  return (
    <TeamsDirectory
      draftName={data.draft?.name ?? "S1 Academy"}
      isPreview={!hasDraft}
      league="academy"
      teams={hasDraft ? toRosterTeams(data.teams, data.players, data.profiles) : PLACEHOLDER_TEAMS}
    />
  );
}
