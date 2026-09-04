import type { GameLogRow, PlayerAggRow } from "@/lib/stats/types";
import { formatShortDateET } from "@/lib/captain/format";

export function MyTeamPerformance({ teamName, games, players }: { teamName: string; games: GameLogRow[]; players: PlayerAggRow[] }) {
  return (
    <details className="card-brand group overflow-hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus [&::-webkit-details-marker]:hidden">
        <span role="heading" aria-level={2} className="label-dash">Team performance details</span>
        <span aria-hidden className="text-xl leading-none text-action-text transition group-open:rotate-45">+</span>
      </summary>
      <section aria-label="Team performance details" className="border-t border-border-subtle px-5 pb-5 pt-4">
        {games.length === 0 ? (
          <p className="text-sm text-muted">No ingested games yet this season.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border-subtle/60">
            {games.map((game) => {
              const won = game.winner_team.trim().toLowerCase() === teamName.trim().toLowerCase();
              const opponent = game.blue_team.trim().toLowerCase() === teamName.trim().toLowerCase() ? game.red_team : game.blue_team;
              return (
                <li key={game.match_id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                  <span className={`w-10 shrink-0 text-center text-xs font-bold uppercase ${won ? "text-prestige" : "text-muted"}`}>{won ? "Win" : "Loss"}</span>
                  <span className="min-w-0 flex-1 text-white">vs {opponent}</span>
                  <span className="shrink-0 text-xs text-muted">{formatShortDateET(game.game_date, "Date unknown")}</span>
                  <span className="shrink-0 text-xs text-muted">{game.duration_min?.toFixed?.(0) ?? "—"}m</span>
                </li>
              );
            })}
          </ul>
        )}
        {players.length > 0 ? (
          <>
            <h3 className="label-dash mt-5">Player lines</h3>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[28rem] text-left text-sm">
                <thead><tr className="text-xs uppercase tracking-wide text-muted"><th className="py-1 pr-3">Player</th><th className="py-1 pr-3">Role</th><th className="py-1 pr-3">GP</th><th className="py-1 pr-3">Win%</th><th className="py-1 pr-3">KDA</th></tr></thead>
                <tbody className="divide-y divide-border-subtle/60">{players.map((player) => <tr key={`${player.summoner_name}#${player.tag}`}><td className="py-1.5 pr-3 font-semibold text-white">{player.summoner_name}<span className="text-muted">#{player.tag}</span></td><td className="py-1.5 pr-3 text-muted">{player.role_mode}</td><td className="py-1.5 pr-3 text-muted">{player.games}</td><td className="py-1.5 pr-3 text-muted">{player.winrate_pct}%</td><td className="py-1.5 pr-3 text-muted">{player.kda}</td></tr>)}</tbody>
              </table>
            </div>
          </>
        ) : null}
      </section>
    </details>
  );
}
