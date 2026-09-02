import { useState } from "react";
import { ROLE_ORDER, type Player, type Team } from "@/lib/draft/types";

const ACQ_BADGE: Record<string, string> = {
  captain: "C",
  free_agency: "FA",
  admin: "ADM",
};

export default function TeamColumn({
  team,
  players,
  isNominator,
  isMyTeam,
  initialCollapsed = false,
}: {
  team: Team;
  players: Player[];
  isNominator: boolean;
  isMyTeam: boolean;
  initialCollapsed?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  return (
    <section
      className={`card-brand flex flex-col gap-2 p-3 ${isNominator ? "border-l-4 border-l-gold" : ""} ${
        isMyTeam ? "ring-1 ring-gold/40" : ""
      }`}
    >
      <header className="flex items-center justify-between gap-2">
        <h3 className="type-display truncate text-sm text-white">{team.name}</h3>
        <div className="flex shrink-0 items-center gap-2">
          {isNominator && <span className="label-dash !text-gold">Nominating</span>}
          <button
            type="button"
            aria-expanded={!collapsed}
            aria-label={`${collapsed ? "Expand" : "Collapse"} team ${team.name}`}
            onClick={() => setCollapsed((current) => !current)}
            className="rounded border border-border-strong px-1.5 py-0.5 text-sm leading-none text-muted hover:border-action-text hover:text-action-text"
          >
            {collapsed ? "+" : "−"}
          </button>
        </div>
      </header>

      {!collapsed && (
        <>
          <ul className="flex flex-col gap-1">
            {ROLE_ORDER.map((role) => {
              const player = players.find((p) => p.team_id === team.id && p.role === role);
              return (
                <li
                  key={role}
                  className={`flex items-center justify-between gap-2 rounded px-2 py-1 text-xs ${
                    player ? "border border-border-subtle bg-canvas/40" : "border border-dashed border-border-subtle text-muted/60"
                  }`}
                >
                  <span className="w-16 shrink-0 uppercase tracking-wide text-muted">{role}</span>
                  {player ? (
                    <span className="flex flex-1 items-center justify-between gap-2 truncate">
                      <span className="truncate text-white">{player.display_name}</span>
                      <span className="flex shrink-0 items-center gap-1">
                        {player.acquisition && ACQ_BADGE[player.acquisition] && (
                          <span className="rounded border border-muted/50 px-1 py-0.5 text-[10px] font-bold text-muted">
                            {ACQ_BADGE[player.acquisition]}
                          </span>
                        )}
                        <span className="font-display font-semibold not-italic text-[11px] text-gold">
                          {player.price ?? 0}
                        </span>
                      </span>
                    </span>
                  ) : (
                    <span className="flex-1 text-muted/60">—</span>
                  )}
                </li>
              );
            })}
          </ul>

          <footer className="mt-1 flex items-center justify-between border-t border-border-subtle pt-2 text-xs text-muted">
            <span>Budget</span>
            <span className="font-display font-semibold not-italic">
              <span className="text-gold">{team.points_remaining}</span>{" "}
              <span className="text-muted">/ {team.budget_start}</span>
            </span>
          </footer>
        </>
      )}
    </section>
  );
}
