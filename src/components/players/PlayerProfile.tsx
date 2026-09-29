"use client";

import { useRouter } from "next/navigation";
import PlayerDetail from "@/components/stats/PlayerDetail";
import { ALL_SEASONS } from "@/components/stats/SeasonSelect";
import LeaguePageShell from "@/components/league/LeaguePageShell";

/**
 * Standalone, shareable player profile (/players/[player]) — the same
 * scouting view the stats page opens via ?player=, given its own URL so
 * rosters, match pages, and Discord links can point straight at a player.
 * Career scope (all seasons, all phases); the stats page keeps the
 * season/phase-filtered version.
 */
export default function PlayerProfile({ summonerName, tag }: { summonerName: string; tag: string }) {
  const router = useRouter();
  return (
    <LeaguePageShell
      league="premier"
      title="Player profile"
      season={ALL_SEASONS}
      activeSection="players"
      description="Career performance and recent games from the league stats record."
    >
        <PlayerDetail
          summonerName={summonerName}
          tag={tag}
          season={ALL_SEASONS}
          phase="All"
          onBack={() => router.push("/players")}
        />
    </LeaguePageShell>
  );
}
