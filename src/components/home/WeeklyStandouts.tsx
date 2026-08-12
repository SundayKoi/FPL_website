import Link from "next/link";
import type { WeeklyStandout } from "@/lib/stats/weekly";

type WeeklyStandoutsProps = {
  standouts: WeeklyStandout[];
};

function roleLabel(role: string): string {
  return role === "UTILITY" ? "SUPPORT" : role;
}

export default function WeeklyStandouts({ standouts }: WeeklyStandoutsProps) {
  return (
    <article
      aria-labelledby="weekly-standouts-title"
      className="card-brand flex min-h-0 flex-col justify-between overflow-hidden p-5 sm:p-6"
    >
      <div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="label-dash">POWER RANKINGS</span>
            <h2 id="weekly-standouts-title" className="type-display mt-2 text-3xl sm:text-4xl">
              Latest Week&apos;s Standouts
            </h2>
          </div>
          <span className="shrink-0 rounded-full bg-cyan/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-cyan">
            Power score
          </span>
        </div>

        {standouts.length === 0 ? (
          <p className="mt-5 max-w-md text-sm leading-6 text-steel">
            Weekly standouts will appear here once the latest match stats are available.
          </p>
        ) : (
          <div className="mt-6 flex flex-col gap-3">
            {standouts.map((player, index) => (
              <div
                key={`${player.summoner_name}-${player.tag}`}
                className="grid grid-cols-[2rem_1fr_auto] items-center gap-3 border-t border-line/50 pt-3 first:border-t-0 first:pt-0"
              >
                <span className="font-mono text-sm font-semibold text-steel">#{index + 1}</span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">{player.summoner_name}</p>
                  <p className="font-mono text-xs text-steel">
                    {roleLabel(player.role_mode)} · {player.games}g · {player.kda.toFixed(2)} KDA
                  </p>
                </div>
                <span className="type-display text-3xl text-cyan">{player.score.toFixed(1)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <Link
        href="/stats"
        className="mt-8 inline-flex w-fit items-center gap-2 font-semibold text-gold hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold"
      >
        View full stats <span aria-hidden>→</span>
      </Link>
    </article>
  );
}
