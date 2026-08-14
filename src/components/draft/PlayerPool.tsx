"use client";
import { useState } from "react";
import { ROLE_ORDER, type LolRole, type Player, type Team } from "@/lib/draft/types";

const ROLE_LABEL: Record<LolRole, string> = {
  top: "Top",
  jungle: "Jungle",
  mid: "Mid",
  adc: "ADC",
  support: "Support",
};

export default function PlayerPool({
  players,
  teams,
  compact = false,
  showFilters = true,
}: {
  players: Player[];
  teams: Team[];
  compact?: boolean;
  showFilters?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<LolRole | null>(null);

  const teamName = (id: string | null) => teams.find((t) => t.id === id)?.name ?? "—";

  const filtered = players
    .filter((p) => !role || p.role === role)
    .filter((p) => p.display_name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => a.display_name.localeCompare(b.display_name));

  const roleSections = ROLE_ORDER.map((role) => ({
    role,
    label: ROLE_LABEL[role],
    players: filtered.filter((player) => player.role === role),
  }));

  return (
    <section className={`card-brand flex flex-col ${compact ? "gap-2 p-3" : "gap-3 p-4"}`}>
      {showFilters && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search players…"
            className={`rounded border border-line bg-navy text-white placeholder:text-steel/60 focus:border-gold focus:outline-none ${
              compact ? "px-2 py-0.5 text-xs" : "px-2 py-1 text-sm"
            }`}
          />
          <div className="flex flex-wrap gap-1">
            <button
              onClick={() => setRole(null)}
              aria-pressed={role === null}
              className={`rounded-full text-xs font-semibold ${compact ? "px-2 py-0.5" : "px-2.5 py-1"} ${
                role === null ? "bg-gold text-navy" : "bg-panel text-steel border border-line"
              }`}
            >
              All
            </button>
            {ROLE_ORDER.map((r) => (
              <button
                key={r}
                onClick={() => setRole(r)}
                aria-pressed={role === r}
                className={`rounded-full text-xs font-semibold uppercase ${compact ? "px-2 py-0.5" : "px-2.5 py-1"} ${
                  role === r ? "bg-gold text-navy" : "bg-panel text-steel border border-line"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className={`grid gap-2 ${compact ? "xl:grid-cols-5" : "sm:grid-cols-2 xl:grid-cols-5"}`}>
        {roleSections.map((section) => (
          <section key={section.role} className="overflow-hidden rounded border border-line">
            <h3 className="border-b border-line bg-navy px-2 py-1.5 text-xs font-bold uppercase tracking-wide text-steel">
              {section.label}
            </h3>
            <ul className="flex flex-col gap-px bg-line/40">
              {section.players.map((p) => {
                const sold = p.team_id !== null;
                return (
                  <li
                    key={p.id}
                    className={`flex items-center justify-between gap-2 bg-panel ${
                      compact ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-1 text-xs"
                    }`}
                  >
                    <span className={`truncate ${sold ? "text-steel/60 line-through" : "text-white"}`}>
                      {p.display_name}
                    </span>
                    {sold ? (
                      <span className={`shrink-0 text-steel/60 ${compact ? "text-[9px]" : "text-[10px]"}`}>
                        {teamName(p.team_id)} · <span className="text-gold">{p.price ?? 0}</span>
                      </span>
                    ) : (
                      <span className="shrink-0 text-[10px] uppercase text-steel">{p.role}</span>
                    )}
                  </li>
                );
              })}
              {section.players.length === 0 && (
                <li className="px-2 py-3 text-center text-[10px] text-steel">No players</li>
              )}
            </ul>
          </section>
        ))}
      </div>
    </section>
  );
}
