"use client";
import { useState } from "react";
import { ROLE_ORDER, type LolRole, type Player, type Team } from "@/lib/draft/types";

export default function PlayerPool({ players, teams }: { players: Player[]; teams: Team[] }) {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<LolRole | null>(null);

  const teamName = (id: string | null) => teams.find((t) => t.id === id)?.name ?? "—";

  const filtered = players
    .filter((p) => !role || p.role === role)
    .filter((p) => p.display_name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => a.display_name.localeCompare(b.display_name));

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search players…"
          className="rounded border border-zinc-700 bg-black/30 px-2 py-1 text-sm text-zinc-100 placeholder:text-zinc-600"
        />
        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => setRole(null)}
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
              role === null ? "bg-indigo-600 text-white" : "bg-zinc-800 text-zinc-400"
            }`}
          >
            All
          </button>
          {ROLE_ORDER.map((r) => (
            <button
              key={r}
              onClick={() => setRole(r)}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase ${
                role === r ? "bg-indigo-600 text-white" : "bg-zinc-800 text-zinc-400"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <ul className="grid grid-cols-2 gap-1 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {filtered.map((p) => {
          const sold = p.team_id !== null;
          return (
            <li
              key={p.id}
              className={`flex items-center justify-between gap-2 rounded border border-zinc-800 px-2 py-1 text-xs ${
                sold ? "bg-black/10" : "bg-black/30"
              }`}
            >
              <span className={`truncate ${sold ? "text-zinc-500 line-through" : "text-zinc-100"}`}>
                {p.display_name}
              </span>
              {sold ? (
                <span className="shrink-0 text-[10px] text-zinc-500">
                  {teamName(p.team_id)} · {p.price ?? 0}
                </span>
              ) : (
                <span className="shrink-0 text-[10px] uppercase text-zinc-600">{p.role}</span>
              )}
            </li>
          );
        })}
        {filtered.length === 0 && (
          <li className="col-span-full py-4 text-center text-xs text-zinc-600">No players match.</li>
        )}
      </ul>
    </section>
  );
}
