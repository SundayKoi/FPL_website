import type { BroadcasterMatchupPlayer } from "@/lib/broadcaster/matchups";

function statsFor(player: BroadcasterMatchupPlayer) {
  if (!player.averages) return [];

  return [
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
}: {
  player: BroadcasterMatchupPlayer;
  spotlight?: boolean;
}) {
  if (!player.averages) {
    return <p className="text-xs text-steel">Season stats unavailable</p>;
  }

  return (
    <div
      aria-label={`${player.name} average stats`}
      className={spotlight ? "rounded-xl border border-cyan/30 bg-navy/70 p-3" : "min-w-[12rem] flex-1"}
    >
      <p className={spotlight ? "mono-label text-cyan" : "label-dash"}>
        Season averages · {player.averages.games} games
      </p>
      <dl className={`mt-2 grid grid-cols-2 gap-2 ${spotlight ? "sm:grid-cols-3" : "gap-x-4 gap-y-2"}`}>
        {statsFor(player).map((stat) => (
          <div
            key={stat.label}
            className={spotlight ? "rounded-lg border border-white/10 bg-white/[0.04] px-2 py-2" : undefined}
          >
            <dt className="text-[10px] uppercase tracking-wider text-steel">{stat.label}</dt>
            <dd className={stat.label === "KDA" && spotlight ? "mt-0.5 text-2xl font-black text-cyan" : "text-sm font-semibold text-white"}>
              {stat.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
