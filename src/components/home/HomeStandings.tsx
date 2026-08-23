import CountUp from "./CountUp";
import type { HomeStandingTeam } from "@/lib/home/standings";

/** W/L dots for a team's recent series, oldest first. */
function FormDots({ form }: { form: ("W" | "L")[] }) {
  if (form.length === 0) return null;
  return (
    <span className="flex items-center gap-1" aria-label={`Recent form: ${form.join(", ")}`}>
      {form.map((result, index) => (
        <span
          key={index}
          aria-hidden
          className={`h-1.5 w-1.5 rounded-full ${result === "W" ? "bg-mint" : "bg-red-400/80"}`}
        />
      ))}
    </span>
  );
}

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
          {teams.map((team, index) => (
            <div
              key={team.id}
              tabIndex={0}
              className={`group border-t border-line/50 py-3 transition first:border-t-0 first:pt-0 last:pb-0 hover:bg-line/15 focus-visible:bg-line/15 focus-visible:outline-none ${
                index === 0 ? "row-rank-1" : ""
              }`}
            >
              <div className="grid min-w-0 grid-cols-[1.75rem_minmax(0,1fr)_auto_auto_auto] items-center gap-2">
                {/* Standings rank — the list arrives sorted by record
                    (deriveSeriesStandings), so position is the index. The
                    team's nomination_position is its DRAFT slot, not rank. */}
                <span className={`font-mono text-xs font-semibold ${index === 0 ? "text-gold" : "text-steel"}`}>
                  #{index + 1}
                </span>
                <div className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0 font-mono text-xs text-coral">{team.abbreviation}</span>
                  <span className="min-w-0 truncate text-sm font-semibold text-white">{team.name}</span>
                </div>
                <FormDots form={team.form ?? []} />
                <span className="whitespace-nowrap font-mono text-sm font-semibold text-steel">
                  {team.wins}–{team.losses}
                </span>
                {hasHistoricalStats ? (
                  <CountUp
                    value={team.winrate_pct ?? 0}
                    suffix="%"
                    className="whitespace-nowrap font-mono text-xs font-semibold text-cyan"
                  />
                ) : null}
              </div>
              {team.next_opponent ? (
                <p className="hidden pl-[1.75rem] pt-1 font-mono text-[11px] text-steel group-hover:block group-focus-visible:block">
                  <span className="text-coral">Next</span> vs {team.next_opponent}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
