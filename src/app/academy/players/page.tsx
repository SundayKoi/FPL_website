import AcademyPlayersDirectory from "@/components/academy/AcademyPlayersDirectory";
import { fetchAcademyDraftData } from "@/lib/academy/draft";
import { fetchAcademyPlayers, mergeAcademyPlayers } from "@/lib/academy/playerSheet";
import { createServerSupabase } from "@/lib/supabase/server";

export default async function AcademyPlayersPage() {
  const supabase = await createServerSupabase();
  const [draftData, sheetPlayers] = await Promise.all([fetchAcademyDraftData(supabase), fetchAcademyPlayers()]);
  const players = draftData.draft ? mergeAcademyPlayers(draftData.players, sheetPlayers) : [];
  return <AcademyPlayersDirectory players={players} />;
}
