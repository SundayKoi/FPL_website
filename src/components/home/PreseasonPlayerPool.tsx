import type { PreseasonPlayer } from "@/lib/home/preseason";
import { ROLE_LABELS, ROLE_ORDER } from "@/lib/draft/types";
import { rankValue, ROLE_TONES } from "@/lib/players/roleDisplay";

export default function PreseasonPlayerPool({ players }: { players: PreseasonPlayer[] }) {
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
                          className="min-w-0 break-words font-semibold text-white underline decoration-current/40 underline-offset-4 hover:text-coral focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral"
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
