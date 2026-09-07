import PlayersDirectory from "@/components/players/PlayersDirectory";
import type { PlayerPoolRow } from "@/components/players/PlayerPoolAdmin";
import type { RoleSection } from "@/lib/players/seasonData";
import type { AcademySheetPlayer } from "@/lib/academy/playerSheet";
import { normalizePlayerName } from "@/lib/players/freeAgency";
import { academyOpggUrlForPlayer, individualOpggUrl } from "@/lib/academy/playerSheet";
import type {
  PlayerIdentityLinkRow,
  VerifiedProfileOption,
} from "@/components/players/PlayerIdentityAdmin";
import type { RosterClaimTarget } from "@/lib/teams/rosterClaims";

type Props = {
  players: AcademySheetPlayer[];
  canonicalPlayers?: PlayerPoolRow[];
  isAdmin?: boolean;
  poolSeasonKey?: "academy-1";
  identitySeason?: string;
  identityLinks?: PlayerIdentityLinkRow[];
  identityProfiles?: VerifiedProfileOption[];
  playerClaims?: Record<string, RosterClaimTarget>;
};

export default function AcademyPlayersDirectory({
  players,
  canonicalPlayers = [],
  isAdmin = false,
  poolSeasonKey = "academy-1",
  identitySeason,
  identityLinks = [],
  identityProfiles = [],
  playerClaims = {},
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
            playerPoolId: player.id,
            opggUrl:
              individualOpggUrl(
                player.opgg_url ?? sheetByName.get(normalizePlayerName(player.display_name))?.opggUrl,
                player.display_name,
              ) ?? academyOpggUrlForPlayer(player.display_name) ?? "",
          }))
      : players
          .filter((player) => roleKey(player.role) === key)
          .map((player) => ({ name: player.name, rank: player.rank, min: 0, opggUrl: player.opggUrl ?? "" })),
  }));

  return (
    <PlayersDirectory
      profileLinks={false}
      seasons={{ "season-5": sections, "season-4": [], "academy-1": [] }}
      canonicalPlayers={canonicalPlayers}
      isAdmin={isAdmin}
      poolSeasonKey={poolSeasonKey}
      identityLeague={identitySeason ? "academy" : undefined}
      identitySeason={identitySeason}
      identityLinks={identityLinks}
      identityProfiles={identityProfiles}
      playerClaims={playerClaims}
      showFreeAgency={false}
      showMinSort={false}
      emptyStateMessages={{ "season-5": "Academy player data is unavailable right now." }}
    />
  );
}
