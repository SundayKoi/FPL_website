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
  return (
    <section aria-labelledby="preseason-player-pool-title" className="card-brand mt-6 overflow-hidden p-5 sm:p-6 xl:mt-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="label-dash">PLAYER POOL · SEASON 5</span>
          <h2 id="preseason-player-pool-title" className="type-display mt-2 text-4xl sm:text-5xl">Who is still on the board?</h2>
        </div>
        <p className="max-w-md text-right text-sm leading-6 text-steel">
          Available players stay clear. Captains, free-agency signings, and completed picks remain visible but locked.
        </p>
      </div>

      {players.length === 0 ? (
        <p className="mt-6 border-t border-line/60 pt-5 text-sm text-steel">
          The featured draft player pool has not been published yet.
        </p>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {ROLE_ORDER.map((role) => {
            const rolePlayers = players.filter((player) => player.role === role);
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
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t border-current/15 px-4 py-3 text-sm"
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
                          <span aria-hidden="true" className="inline-block select-none blur-[3px]">{player.displayName}</span>
                          <span className="ml-2 text-[10px] uppercase tracking-[0.12em] text-steel">{player.lockLabel}</span>
                        </span>
                      )}
                      <span className="font-medium text-steel">{player.rank ?? "—"}</span>
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
        Locked names are shown for league context and cannot be drafted again.
      </p>
    </section>
  );
}
