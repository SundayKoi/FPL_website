import type { Lot, Player, Team } from "@/lib/draft/types";

export default function CenterStage({
  lot,
  player,
  leadingTeam,
  secondsLeft,
  paused,
  nominatorTeam = null,
}: {
  lot: Lot | null;
  player: Player | null;
  leadingTeam: Team | null;
  secondsLeft: number;
  paused: boolean;
  /** Optional: team on the clock, used only for the "waiting to nominate" message. */
  nominatorTeam?: Team | null;
}) {
  if (!lot || !player) {
    return (
      <section className="flex flex-col items-center justify-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/40 p-8 text-center">
        <p className="text-sm text-zinc-400">
          Waiting for {nominatorTeam?.name ?? "the next team"} to nominate…
        </p>
      </section>
    );
  }

  return (
    <section className="flex flex-col items-center justify-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-8 text-center">
      <div>
        <h2 className="text-2xl font-bold text-zinc-100">{player.display_name}</h2>
        <p className="text-xs uppercase tracking-wide text-zinc-500">
          {player.role}
          {player.rank ? ` · ${player.rank}` : ""}
        </p>
        {player.opgg_url && (
          <a
            href={player.opgg_url}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-indigo-400 underline"
          >
            op.gg
          </a>
        )}
      </div>

      <div className="text-5xl font-extrabold text-emerald-400">{lot.current_bid}</div>
      <p className="text-sm text-zinc-400">
        Leading: <span className="text-zinc-100">{leadingTeam?.name ?? "—"}</span>
      </p>

      <div
        className={`font-mono text-4xl font-bold tabular-nums ${
          paused ? "text-amber-400" : secondsLeft <= 5 ? "text-red-500" : "text-zinc-100"
        }`}
      >
        {paused ? "PAUSED" : secondsLeft}
      </div>
    </section>
  );
}
