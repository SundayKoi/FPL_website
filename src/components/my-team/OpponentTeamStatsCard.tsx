import Link from "next/link";
import type { MyTeamOpponent } from "@/lib/my-team/types";
import TeamStatsRadar from "@/components/stats/TeamStatsRadar";

const LINK_CLASS = "inline-flex rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

type OpponentTeamStatsCardProps = {
  opponent: MyTeamOpponent;
  draftScoutingHref: string;
};

export function OpponentTeamStatsCard({
  opponent,
  draftScoutingHref,
}: OpponentTeamStatsCardProps) {
  return (
    <section className="card-brand flex flex-col gap-4 p-5" aria-label={`Opponent profile: ${opponent.name}`}>
      <div>
        <p className="label-dash text-prestige">Opponent profile</p>
        <h2 className="mt-1 type-display text-2xl">Scout {opponent.name}</h2>
      </div>

      {opponent.statsUnavailable ? (
        <p className="text-sm text-muted">Team stats temporarily unavailable.</p>
      ) : opponent.stats ? (
        <>
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 font-mono text-sm text-white">
            <span>{opponent.stats.wins}W · {opponent.stats.losses}L</span>
            <span className="text-muted">{opponent.stats.games} games</span>
            <span className="text-gold">{opponent.stats.winrate_pct.toFixed(1)}%</span>
          </div>
          <TeamStatsRadar row={opponent.stats} />
        </>
      ) : (
        <p className="text-sm text-muted">No team stats for this season yet.</p>
      )}

      <div className="flex flex-wrap gap-2 border-t border-border-subtle/50 pt-4">
        <Link href={draftScoutingHref} className={`${LINK_CLASS} border-action-text/60 font-bold text-action-text hover:bg-action-fill hover:text-white`}>
          Open scouting page →
        </Link>
      </div>
    </section>
  );
}
