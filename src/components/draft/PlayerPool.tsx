import { ROLE_LABELS, ROLE_ORDER, type Player, type Team } from "@/lib/draft/types";

export default function PlayerPool({
  players,
  teams,
}: {
  players: Player[];
  teams: Team[];
}) {
  const teamName = (id: string | null) => teams.find((t) => t.id === id)?.name ?? "—";

  const sorted = [...players].sort((a, b) => a.display_name.localeCompare(b.display_name));

  const roleSections = ROLE_ORDER.map((role) => ({
    role,
    label: ROLE_LABELS[role],
    players: sorted.filter((player) => player.role === role),
  }));

  return (
    <section className="card-brand flex flex-col gap-2 p-3">
      <div className="grid gap-2 xl:grid-cols-5">
        {roleSections.map((section) => (
          <section key={section.role} className="overflow-hidden rounded border border-border">
            <h3 className="border-b border-border bg-canvas px-2 py-1.5 text-xs font-bold uppercase tracking-wide text-muted">
              {section.label}
            </h3>
            <ul className="flex flex-col gap-px bg-border/40">
              {section.players.map((p) => {
                const sold = p.team_id !== null;
                return (
                  <li
                    key={p.id}
                    className="flex items-center justify-between gap-2 bg-surface px-1.5 py-0.5 text-[11px]"
                  >
                    <span className={`truncate ${sold ? "text-muted/60 line-through" : "text-white"}`}>
                      {p.display_name}
                    </span>
                    {sold ? (
                      <span className="shrink-0 text-[9px] text-muted/60">
                        {teamName(p.team_id)} · <span className="text-gold">{p.price ?? 0}</span>
                      </span>
                    ) : (
                      <span className="shrink-0 text-[10px] uppercase text-muted">{p.role}</span>
                    )}
                  </li>
                );
              })}
              {section.players.length === 0 && (
                <li className="px-2 py-3 text-center text-[10px] text-muted">No players</li>
              )}
            </ul>
          </section>
        ))}
      </div>
    </section>
  );
}
