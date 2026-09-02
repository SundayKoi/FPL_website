import type { GameLogRow, PlayerAggRow } from "@/lib/stats/types";
import { formatShortDateET } from "@/lib/captain/format";

/**
 * Section 5 of the captain page: the team's ingested games (`stats_game_log`)
 * and their players' `stats_player_agg` lines for the current season.
 */
export default function MyResults({
  teamName,
  games,
  players,
}: {
  teamName: string;
  games: GameLogRow[];
  players: PlayerAggRow[];
}) {
  return (
    <details className="card-brand group overflow-hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
        <span role="heading" aria-level={2} className="label-dash">My results &amp; stats</span>
        <span aria-hidden className="text-xl leading-none text-primary transition group-open:rotate-45">+</span>
      </summary>
      <section aria-label="My results &amp; stats" className="border-t border-border px-5 pb-5 pt-4">

      {games.length === 0 ? (
        <p className="mt-3 text-sm text-muted">No ingested games yet this season.</p>
      ) : (
        <ul className="mt-3 flex flex-col divide-y divide-border/60">
          {games.map((game) => {
            const won = game.winner_team === teamName;
            const opponent = game.blue_team === teamName ? game.red_team : game.blue_team;
            return (
              <li key={game.match_id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                <span
                  className={`w-10 shrink-0 text-center text-xs font-bold uppercase ${won ? "text-prestige" : "text-muted"}`}
                >
                  {won ? "Win" : "Loss"}
                </span>
                <span className="min-w-0 flex-1 truncate text-white">vs {opponent}</span>
                <span className="shrink-0 text-xs text-muted">{formatShortDateET(game.game_date, "Date unknown")}</span>
                <span className="shrink-0 text-xs text-muted">{game.duration_min?.toFixed?.(0) ?? "—"}m</span>
              </li>
            );
          })}
        </ul>
      )}

      {players.length > 0 && (
        <>
          <h3 className="label-dash mt-5">Player lines</h3>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[28rem] text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-muted">
                  <th className="py-1 pr-3 font-semibold">Player</th>
                  <th className="py-1 pr-3 font-semibold">Role</th>
                  <th className="py-1 pr-3 font-semibold">GP</th>
                  <th className="py-1 pr-3 font-semibold">Win%</th>
                  <th className="py-1 pr-3 font-semibold">KDA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {players.map((p) => (
                  <tr key={`${p.summoner_name}#${p.tag}`}>
                    <td className="py-1.5 pr-3 font-semibold text-white">
                      {p.summoner_name}
                      <span className="text-muted">#{p.tag}</span>
                    </td>
                    <td className="py-1.5 pr-3 text-muted">{p.role_mode}</td>
                    <td className="py-1.5 pr-3 text-muted">{p.games}</td>
                    <td className="py-1.5 pr-3 text-muted">{p.winrate_pct}%</td>
                    <td className="py-1.5 pr-3 text-muted">{p.kda}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {games.length === 0 && players.length === 0 && (
        <p className="mt-1 text-xs text-muted">Results show up here automatically once games are ingested.</p>
      )}
      </section>
    </details>
  );
}
