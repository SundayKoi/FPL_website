"use client";
import { useState } from "react";
import { ROLE_ORDER, type LolRole, type Player, type Team } from "@/lib/draft/types";

export default function PlayerPool({
  players,
  teams,
  compact = false,
}: {
  players: Player[];
  teams: Team[];
  compact?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<LolRole | null>(null);

  const teamName = (id: string | null) => teams.find((t) => t.id === id)?.name ?? "—";

  const filtered = players
    .filter((p) => !role || p.role === role)
    .filter((p) => p.display_name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => a.display_name.localeCompare(b.display_name));

  return (
    <section className={`card-brand flex flex-col ${compact ? "gap-2 p-3" : "gap-3 p-4"}`}>
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

      <ul className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 ${compact ? "gap-0.5 lg:grid-cols-5" : "gap-1 lg:grid-cols-6"}`}>
        {filtered.map((p) => {
          const sold = p.team_id !== null;
          return (
            <li
              key={p.id}
              className={`flex items-center justify-between gap-2 rounded border border-line ${
                compact ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-1 text-xs"
              } ${
                sold ? "bg-navy/40" : "bg-navy/70"
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
        {filtered.length === 0 && (
          <li className="col-span-full py-4 text-center text-xs text-steel">No players match.</li>
        )}
      </ul>
    </section>
  );
}
