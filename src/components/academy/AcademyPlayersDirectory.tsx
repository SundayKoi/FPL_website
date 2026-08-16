import PlayersDirectory from "@/components/players/PlayersDirectory";
import type { RoleSection } from "@/lib/players/seasonData";
import type { AcademySheetPlayer } from "@/lib/academy/playerSheet";

export default function AcademyPlayersDirectory({ players }: { players: AcademySheetPlayer[] }) {
  const roleKey = (role: string) => {
    const normalized = role.toLowerCase();
    return normalized === "middle" ? "mid" : normalized === "bottom" ? "adc" : normalized;
  };
  const sections: RoleSection[] = ["top", "jungle", "mid", "adc", "support"].map((key) => ({
    key: key as RoleSection["key"],
    label: key === "adc" ? "ADC" : key[0].toUpperCase() + key.slice(1),
    players: players
      .filter((player) => roleKey(player.role) === key)
      .map((player) => ({ name: player.name, rank: player.rank, min: 0, opggUrl: player.opggUrl ?? "" })),
  }));

  return (
    <PlayersDirectory
      seasons={{ "season-5": sections, "season-4": [] }}
      isAdmin={false}
      pageView="academy"
      showFreeAgency={false}
      showMinSort={false}
      emptyStateMessages={{ "season-5": "Academy player data is unavailable right now." }}
    />
  );
}
