import type { PreseasonPlayer } from "@/lib/home/preseason";
import type { LolRole } from "@/lib/draft/types";

const ROLE_ORDER: LolRole[] = ["top", "jungle", "mid", "adc", "support"];
const ROLE_LABELS: Record<LolRole, string> = {
  top: "Top",
  jungle: "Jungle",
  mid: "Mid",
  adc: "ADC",
  support: "Support",
};
const ROLE_TONES: Record<LolRole, string> = {
  top: "border-violet-300/50 bg-violet-300/10 text-violet-100",
  jungle: "border-emerald-300/50 bg-emerald-300/10 text-emerald-100",
  mid: "border-sky-300/50 bg-sky-300/10 text-sky-100",
  adc: "border-amber-300/50 bg-amber-300/10 text-amber-100",
  support: "border-purple-300/50 bg-purple-300/10 text-purple-100",
};

export default function PreseasonPlayerPool({ players }: { players: PreseasonPlayer[] }) {
  function rankValue(rank: string | null) {
    const normalized = rank?.trim().toUpperCase() ?? "";
    const tier = normalized.startsWith("M") ? 5 : normalized.startsWith("D") ? 4 : normalized.startsWith("E") ? 3 : normalized.startsWith("P") ? 2 : normalized.startsWith("G") ? 1 : 0;
    const division = Number(normalized.replace(/^[A-Z]+/, "")) || 0;
    return tier * 100 + division;
  }

  return (
    <section aria-labelledby="preseason-player-pool-title" className="card-brand mt-6 overflow-hidden p-5 sm:p-6 xl:mt-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="label-dash">PLAYER POOL · SEASON 5</span>
          <h2 id="preseason-player-pool-title" className="type-display mt-2 text-4xl sm:text-5xl">Who is still on the board?</h2>
        </div>
        <p className="max-w-md text-right text-sm leading-6 text-steel">
          Remaining players are open for the draft. Captains stay at the top, with every player ranked for quick scouting.
        </p>
      </div>

      {players.length === 0 ? (
        <p className="mt-6 border-t border-line/60 pt-5 text-sm text-steel">
          The featured draft player pool has not been published yet.
        </p>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {ROLE_ORDER.map((role) => {
            const rolePlayers = players
              .filter((player) => player.role === role)
              .sort((left, right) => {
                const leftCaptain = left.lockLabel === "Captain";
                const rightCaptain = right.lockLabel === "Captain";
                if (leftCaptain !== rightCaptain) return leftCaptain ? -1 : 1;
                if (left.available !== right.available) return left.available ? -1 : 1;
                return rankValue(right.rank) - rankValue(left.rank) || left.displayName.localeCompare(right.displayName);
              });
            return (
              <section key={role} className={`overflow-hidden rounded border ${ROLE_TONES[role]}`}>
                <h3 className="px-4 py-3 text-lg font-bold uppercase tracking-wide">{ROLE_LABELS[role]}</h3>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 bg-navy px-4 py-2 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-steel">
                  <span>Player</span>
                  <span>Rank</span>
                </div>
                <ul>
                  {rolePlayers.map((player) => (
                    <li
                      key={player.id}
                      data-available={player.available ? "true" : "false"}
                      className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t border-current/15 px-4 py-3 text-sm ${
                        player.available ? "bg-white/[0.02]" : "bg-black/35 opacity-55"
                      }`}
                    >
                      {player.available ? (
                        <a
                          href={player.opggUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="min-w-0 break-words font-semibold text-white underline decoration-current/40 underline-offset-4 hover:text-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
                        >
                          {player.displayName}
                        </a>
                      ) : (
                        <span
                          aria-label={`${player.displayName}, unavailable: ${player.lockLabel}`}
                          className="min-w-0 truncate font-semibold text-white"
                        >
                          <span>{player.displayName}</span>
                          <span className="ml-2 rounded border border-line px-1.5 py-0.5 text-[10px] uppercase tracking-[0.12em] text-steel">{player.lockLabel}</span>
                        </span>
                      )}
                      <span className="flex items-center gap-1.5 whitespace-nowrap rounded border border-line/80 bg-navy/70 px-2 py-1 font-mono text-xs font-bold text-gold">
                        <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-steel">Rank</span>
                        {player.rank ?? "Unranked"}
                      </span>
                    </li>
                  ))}
                  {rolePlayers.length === 0 ? (
                    <li className="border-t border-current/15 px-4 py-3 text-sm text-steel">No players listed</li>
                  ) : null}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      <p className="mt-4 text-[10px] uppercase tracking-[0.1em] text-steel/70">
        Remaining players are sorted by rank. Committed players remain visible with their acquisition status.
      </p>
    </section>
  );
}
