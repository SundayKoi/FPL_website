import type { BroadcasterMatchupPlayer } from "@/lib/broadcaster/matchups";

function statsFor(player: BroadcasterMatchupPlayer, spotlight: boolean) {
  if (!player.averages) return [];

  return [
    ...(spotlight && player.gameRecord
      ? [{ label: "Game WR", value: `${player.gameRecord.winratePct.toFixed(0)}%` }]
      : []),
    { label: "KDA", value: player.averages.kda.toFixed(2) },
    { label: "DMG/min", value: Math.round(player.averages.damagePerMin).toLocaleString() },
    ...(player.role === "jungle" || player.role === "support"
      ? [{ label: "Vision/min", value: player.averages.visionPerMin.toFixed(2) }]
      : []),
    ...(player.role === "top"
      ? [{ label: "Turrets/game", value: player.averages.turretsPerGame.toFixed(2) }]
      : []),
    ...(player.role !== "support"
      ? [
          { label: "Gold/min", value: Math.round(player.averages.goldPerMin).toLocaleString() },
          { label: "Multi-kills", value: Math.round(player.averages.multiKills).toLocaleString() },
        ]
      : []),
  ];
}

export default function BroadcasterPlayerStats({
  player,
  spotlight = false,
  layout = "block",
}: {
  player: BroadcasterMatchupPlayer;
  spotlight?: boolean;
  layout?: "block" | "rail";
}) {
  if (!player.averages) {
    return <p className="text-xs text-muted">Season stats unavailable</p>;
  }

  const rail = layout === "rail";

  return (
    <div
      aria-label={`${player.name} average stats`}
      className={rail
        ? "w-[4.75rem] shrink-0 rounded-xl border border-cyan/30 bg-canvas/70 p-1.5 sm:w-28 sm:p-2"
        : spotlight ? "rounded-xl border border-cyan/30 bg-canvas/70 p-3" : "min-w-[12rem] flex-1"}
    >
      <p className={spotlight ? "mono-label text-cyan" : "label-dash"}>
        {rail ? "Stats" : `Season averages · ${player.averages.games} games`}
      </p>
      <dl className={`mt-2 grid gap-1 ${rail ? "grid-cols-1" : `grid-cols-2 gap-2 ${spotlight ? "sm:grid-cols-3" : "gap-x-4 gap-y-2"}`}`}>
        {statsFor(player, spotlight).map((stat) => (
          <div
            key={stat.label}
            className={rail ? "rounded-md border border-white/10 bg-white/[0.04] px-1.5 py-1" : spotlight ? "rounded-lg border border-white/10 bg-white/[0.04] px-2 py-2" : undefined}
          >
            <dt className={rail ? "truncate text-[8px] uppercase tracking-wide text-muted sm:text-[10px] sm:tracking-wider" : "text-[10px] uppercase tracking-wider text-muted"}>{stat.label}</dt>
            <dd className={stat.label === "KDA" && spotlight && !rail ? "mt-0.5 text-2xl font-black text-cyan" : rail ? "text-xs font-black text-white sm:text-sm" : "text-sm font-semibold text-white"}>
              {stat.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
