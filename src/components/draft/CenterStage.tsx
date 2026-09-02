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
      <section className="card-brand flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border p-8 text-center">
        <p className="text-sm text-muted">
          Waiting for {nominatorTeam?.name ?? "the next team"} to nominate…
        </p>
      </section>
    );
  }

  return (
    <section
      className="card-brand flex flex-col items-center justify-center gap-3 p-8 text-center"
      style={{ boxShadow: "0 16px 40px rgb(0 0 0 / 0.5)" }}
    >
      <div>
        <h2 className="type-display text-3xl text-white">{player.display_name}</h2>
        <p className="text-xs uppercase tracking-wide text-muted">
          {player.role}
          {player.rank ? ` · ${player.rank}` : ""}
        </p>
        {player.opgg_url && (
          <a
            href={player.opgg_url}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-muted underline"
          >
            op.gg
          </a>
        )}
      </div>

      <div className="type-display text-5xl text-gold">{lot.current_bid}</div>
      <p className="text-sm text-muted">
        Leading: <span className="text-muted">{leadingTeam?.name ?? "—"}</span>
      </p>

      <div
        className={`font-display italic font-bold tabular-nums text-7xl ${
          paused ? "text-gold" : secondsLeft <= 5 ? "text-red-500 animate-pulse" : "text-gold"
        }`}
      >
        {paused ? "PAUSED" : secondsLeft}
      </div>
    </section>
  );
}
