import type { HomeStandingTeam } from "@/lib/home/standings";

export default function HomeStandings({
  teams,
  seasonLabel,
}: {
  teams: HomeStandingTeam[];
  /** The league's season code. Academy and Premier run different ones, so the
   *  copy here is passed in rather than hardcoded to Premier's. */
  seasonLabel?: string;
}) {
  const hasHistoricalStats = teams.some((team) => team.winrate_pct !== undefined);
  const season = seasonLabel?.trim() || "S5";

  return (
    <article
      aria-labelledby="home-standings-title"
      className="card-brand flex min-h-0 flex-col overflow-hidden p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="label-dash">TEAM STANDINGS</span>
          <h2 id="home-standings-title" className="type-display mt-2 text-3xl sm:text-4xl">
            Team standings
          </h2>
        </div>
        <span className="shrink-0 rounded-full bg-coral/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-coral">
          {hasHistoricalStats ? `${season} standings` : "0–0 start"}
        </span>
      </div>

      {teams.length === 0 ? (
        <p className="mt-5 text-sm leading-6 text-steel">
          Standings will appear once the {season} teams are configured.
        </p>
      ) : (
        <div className="mt-5 flex flex-col">
          {teams.map((team) => (
            <div
              key={team.id}
              className="grid min-w-0 grid-cols-[1.75rem_minmax(0,1fr)_auto_auto] items-center gap-2 border-t border-line/50 py-3 first:border-t-0 first:pt-0 last:pb-0"
            >
              <span className="font-mono text-xs font-semibold text-steel">#{team.nomination_position}</span>
              <div className="flex min-w-0 items-center gap-2">
                <span className="shrink-0 font-mono text-xs text-coral">{team.abbreviation}</span>
                <span className="min-w-0 truncate text-sm font-semibold text-white">{team.name}</span>
              </div>
              <span className="whitespace-nowrap font-mono text-sm font-semibold text-steel">
                {team.wins}–{team.losses}
              </span>
              {hasHistoricalStats ? (
                <span className="whitespace-nowrap font-mono text-xs font-semibold text-cyan">
                  {team.winrate_pct ?? 0}%
                </span>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
