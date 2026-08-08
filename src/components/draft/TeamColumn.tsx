import { ROLE_ORDER, type Player, type Team } from "@/lib/draft/types";

const ACQ_BADGE: Record<string, string> = {
  captain: "C",
  free_agency: "FA",
};

export default function TeamColumn({
  team,
  players,
  isNominator,
  isMyTeam,
}: {
  team: Team;
  players: Player[];
  isNominator: boolean;
  isMyTeam: boolean;
}) {
  return (
    <section
      className={`flex flex-col gap-2 rounded-lg border p-3 ${
        isMyTeam ? "border-indigo-400 bg-indigo-950/30" : "border-zinc-800 bg-zinc-900/40"
      }`}
    >
      <header className="flex items-center justify-between gap-2">
        <h3 className="truncate text-sm font-semibold text-zinc-100">{team.name}</h3>
        {isNominator && (
          <span className="shrink-0 rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold uppercase text-black">
            Nominating
          </span>
        )}
      </header>

      <ul className="flex flex-col gap-1">
        {ROLE_ORDER.map((role) => {
          const player = players.find((p) => p.team_id === team.id && p.role === role);
          return (
            <li
              key={role}
              className="flex items-center justify-between gap-2 rounded border border-zinc-800 bg-black/20 px-2 py-1 text-xs"
            >
              <span className="w-16 shrink-0 uppercase tracking-wide text-zinc-500">{role}</span>
              {player ? (
                <span className="flex flex-1 items-center justify-between gap-2 truncate">
                  <span className="truncate text-zinc-100">{player.display_name}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    {player.acquisition && ACQ_BADGE[player.acquisition] && (
                      <span className="rounded bg-zinc-700 px-1 py-0.5 text-[10px] font-bold text-zinc-200">
                        {ACQ_BADGE[player.acquisition]}
                      </span>
                    )}
                    <span className="rounded bg-emerald-700/60 px-1.5 py-0.5 font-mono text-[11px] text-emerald-100">
                      {player.price ?? 0}
                    </span>
                  </span>
                </span>
              ) : (
                <span className="flex-1 text-zinc-600">—</span>
              )}
            </li>
          );
        })}
      </ul>

      <footer className="mt-1 flex items-center justify-between border-t border-zinc-800 pt-2 text-xs text-zinc-400">
        <span>Budget</span>
        <span className="font-mono text-zinc-200">
          {team.points_remaining} / {team.budget_start}
        </span>
      </footer>
    </section>
  );
}
