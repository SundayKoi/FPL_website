import PlayersDirectory from "@/components/players/PlayersDirectory";
import type { PlayerPoolRow } from "@/components/players/PlayerPoolAdmin";
import type { RoleSection } from "@/lib/players/seasonData";
import type { AcademySheetPlayer } from "@/lib/academy/playerSheet";
import { normalizePlayerName } from "@/lib/players/freeAgency";

type Props = {
  players: AcademySheetPlayer[];
  canonicalPlayers?: PlayerPoolRow[];
  isAdmin?: boolean;
  poolSeasonKey?: "academy-1";
};

export default function AcademyPlayersDirectory({
  players,
  canonicalPlayers = [],
  isAdmin = false,
  poolSeasonKey = "academy-1",
}: Props) {
  const roleKey = (role: string) => {
    const normalized = role.toLowerCase();
    return normalized === "middle" ? "mid" : normalized === "bottom" ? "adc" : normalized;
  };
  const sheetByName = new Map(players.map((player) => [normalizePlayerName(player.name), player]));
  const sourceIsCanonical = canonicalPlayers.length > 0;
  const sections: RoleSection[] = ["top", "jungle", "mid", "adc", "support"].map((key) => ({
    key: key as RoleSection["key"],
    label: key === "adc" ? "ADC" : key[0].toUpperCase() + key.slice(1),
    players: sourceIsCanonical
      ? canonicalPlayers
          .filter((player) => player.role === key)
          .map((player) => ({
            name: player.display_name,
            rank: player.rank ?? "—",
            min: 0,
            opggUrl: player.opgg_url ?? sheetByName.get(normalizePlayerName(player.display_name))?.opggUrl ?? "",
          }))
      : players
          .filter((player) => roleKey(player.role) === key)
          .map((player) => ({ name: player.name, rank: player.rank, min: 0, opggUrl: player.opggUrl ?? "" })),
  }));

  return (
    <PlayersDirectory
      seasons={{ "season-5": sections, "season-4": [], "academy-1": [] }}
      canonicalPlayers={canonicalPlayers}
      isAdmin={isAdmin}
      pageView="academy"
      poolSeasonKey={poolSeasonKey}
      showFreeAgency={false}
      showMinSort={false}
      emptyStateMessages={{ "season-5": "Academy player data is unavailable right now." }}
    />
  );
}
