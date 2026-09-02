"use client";

import type { PlayerAggRow } from "@/lib/stats/types";

type StatRow = {
  label: string;
  pick: (row: PlayerAggRow) => number | string;
};

// Every PlayerAggRow display stat the Leaderboard doesn't already reduce to
// a single column, plus the columns it does — the drawer is the full
// side-by-side comparison, independent of whichever columns happen to be
// visible in the table above it.
const STAT_ROWS: StatRow[] = [
  { label: "Role", pick: (r) => r.role_mode },
  { label: "Games", pick: (r) => r.games },
  { label: "Wins", pick: (r) => r.wins },
  { label: "Win Rate", pick: (r) => `${r.winrate_pct.toFixed(1)}%` },
  { label: "KDA", pick: (r) => r.kda.toFixed(2) },
  { label: "Kills/Game", pick: (r) => r.avg_kills.toFixed(1) },
  { label: "Deaths/Game", pick: (r) => r.avg_deaths.toFixed(1) },
  { label: "Assists/Game", pick: (r) => r.avg_assists.toFixed(1) },
  { label: "Kill Participation", pick: (r) => `${r.avg_kp_pct.toFixed(1)}%` },
  { label: "CS/Min", pick: (r) => r.avg_cs_per_min.toFixed(2) },
  { label: "Gold/Min", pick: (r) => r.avg_gold_per_min.toFixed(0) },
  { label: "DMG/Min", pick: (r) => r.avg_dmg_per_min.toFixed(0) },
  { label: "DMG Share", pick: (r) => `${r.avg_dmg_share_pct.toFixed(1)}%` },
  { label: "Vision/Min", pick: (r) => r.avg_vision_per_min.toFixed(2) },
  { label: "Solo Kills/Game", pick: (r) => r.avg_solo_kills.toFixed(1) },
  { label: "Total Plates", pick: (r) => r.total_plates },
  { label: "Double Kills", pick: (r) => r.total_doubles },
  { label: "Triple Kills", pick: (r) => r.total_triples },
  { label: "Quadra Kills", pick: (r) => r.total_quadras },
  { label: "Penta Kills", pick: (r) => r.total_pentas },
  { label: "CS @ 10", pick: (r) => r.avg_cs_at_10.toFixed(1) },
  { label: "Gold @ 10", pick: (r) => r.avg_gold_at_10.toFixed(0) },
  { label: "XP @ 10", pick: (r) => r.avg_xp_at_10.toFixed(0) },
  { label: "DMG Taken/Min", pick: (r) => r.avg_dmg_taken_per_min.toFixed(0) },
  { label: "First Blood Involvements", pick: (r) => r.first_blood_involvements },
  { label: "Avg Game Duration", pick: (r) => `${r.avg_game_duration.toFixed(1)}m` },
];

export default function CompareDrawer({
  players,
  onRemove,
  onClose,
}: {
  players: PlayerAggRow[];
  onRemove: (row: PlayerAggRow) => void;
  onClose: () => void;
}) {
  if (players.length === 0) return null;

  return (
    <div
      role="dialog"
      aria-label="Compare players"
      className="fixed inset-x-0 bottom-0 z-50 max-h-[70vh] overflow-y-auto border-t border-border-subtle bg-surface shadow-[0_-8px_24px_rgb(0_0_0_/_0.45)] sm:inset-x-auto sm:inset-y-0 sm:right-0 sm:max-h-none sm:w-[420px] sm:overflow-y-auto sm:border-l sm:border-t-0"
    >
      <div className="relative flex items-center justify-between border-b border-border-subtle px-4 py-3">
        <hr className="neon-rule absolute inset-x-0 top-0" />
        <span className="mono-label">Compare ({players.length}/3)</span>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-border-strong px-2.5 py-1 text-xs font-semibold text-muted transition hover:border-action-text/60 hover:text-action-text"
        >
          Close
        </button>
      </div>

      <div className="overflow-x-auto p-4">
        <table className="w-full min-w-[480px] border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 bg-surface px-2 py-1.5 text-left text-xs uppercase tracking-wide text-muted">
                Stat
              </th>
              {players.map((p) => (
                <th key={`${p.summoner_name}#${p.tag}`} className="px-2 py-1.5 text-left">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-semibold text-white">
                      {p.summoner_name}
                      <span className="text-muted">#{p.tag}</span>
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove ${p.summoner_name} from compare`}
                      onClick={() => onRemove(p)}
                      className="shrink-0 text-muted hover:text-action-text"
                    >
                      ×
                    </button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {STAT_ROWS.map((stat) => (
              <tr key={stat.label} className="border-t border-border-subtle/60">
                <td className="px-2 py-1.5 text-xs text-muted">{stat.label}</td>
                {players.map((p) => (
                  <td key={`${p.summoner_name}#${p.tag}-${stat.label}`} className="px-2 py-1.5 text-white">
                    {stat.pick(p)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
