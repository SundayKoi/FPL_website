import TeamStatsRadar from "./TeamStatsRadar";
import type { PhaseFilter } from "./SeasonSelect";
import { StatBar } from "./statsUi";
import type { TeamAggRow } from "@/lib/stats/types";

export default function TeamDetail({
  row,
  teamName,
  season,
  phase,
  onBack,
}: {
  row: TeamAggRow | null;
  teamName: string;
  season: string;
  phase: PhaseFilter;
  onBack: () => void;
}) {
  const title = row?.team_name ?? teamName;
  return (
    <section className="card-neon flex flex-col gap-5 p-5" aria-label={`${title} team detail`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="mono-label">Team detail</p>
          <h2 className="mt-1 font-display text-3xl font-semibold text-white">{title}</h2>
          <p className="mt-1 font-mono text-xs text-muted">{season} · {phase}</p>
        </div>
        <button type="button" onClick={onBack} className="rounded border border-border-strong px-3 py-1.5 text-sm font-semibold text-muted hover:border-action-text hover:text-action-text">
          ← Back to teams
        </button>
      </div>

      {!row ? (
        <p className="border-t border-border-subtle/50 pt-5 text-muted">No team stats for this season/phase yet.</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <p className="mono-label">Record</p>
              <p className="mt-1 font-mono text-xl text-white">{row.wins}W · {row.losses}L</p>
            </div>
            <div>
              <p className="mono-label">Games</p>
              <p className="mt-1 font-mono text-xl text-white">{row.games}</p>
            </div>
            <div>
              <p className="mono-label">Win rate</p>
              <p className="mt-1 font-mono text-xl text-gold">{row.winrate_pct.toFixed(1)}%</p>
            </div>
          </div>
          <TeamStatsRadar row={row} />
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              ["Dragon control", row.dragon_rate, "cyan"],
              ["Baron control", row.baron_rate, "purple"],
              ["First blood", row.first_blood_rate, "pink"],
              ["First tower", row.first_tower_rate, "gold"],
            ].map(([label, value, color]) => (
              <div key={label as string} className="flex items-center gap-2">
                <span className="w-28 shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">{label}</span>
                <StatBar value={value as number} max={100} color={color as "cyan" | "purple" | "pink" | "gold"} className="flex-1" />
                <span className="w-12 text-right font-mono text-xs tabular-nums text-white">{Number.isFinite(value as number) ? (value as number).toFixed(1) : "0.0"}%</span>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
