import AcademyPlayersDirectory from "@/components/academy/AcademyPlayersDirectory";
import { fetchAcademyDraftData } from "@/lib/academy/draft";
import { fetchAcademyPlayers } from "@/lib/academy/playerSheet";
import { createServerSupabase } from "@/lib/supabase/server";

export default async function AcademyPlayersPage() {
  const supabase = await createServerSupabase();
  const [draftData, sheetPlayers] = await Promise.all([fetchAcademyDraftData(supabase), fetchAcademyPlayers()]);
  const names = new Set(draftData.players.map((player) => player.display_name.trim().toLowerCase()));
  const players = draftData.draft ? sheetPlayers.filter((player) => names.has(player.name.trim().toLowerCase())) : [];
  return <AcademyPlayersDirectory players={players} />;
}
