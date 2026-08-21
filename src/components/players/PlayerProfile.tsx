"use client";

import { useRouter } from "next/navigation";
import PlayerDetail from "@/components/stats/PlayerDetail";
import { ALL_SEASONS } from "@/components/stats/SeasonSelect";

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
    <main className="grid-neon flex-1">
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <PlayerDetail
          summonerName={summonerName}
          tag={tag}
          season={ALL_SEASONS}
          phase="All"
          onBack={() => router.push("/players")}
        />
      </div>
    </main>
  );
}
