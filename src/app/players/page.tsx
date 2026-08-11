import PlayersDirectory from "@/components/players/PlayersDirectory";
import { PLAYER_SEASONS } from "@/lib/players/seasonData";

export default function PlayersPage() {
  return <PlayersDirectory seasons={PLAYER_SEASONS} />;
}
