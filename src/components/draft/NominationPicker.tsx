"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { nominateBlockReason, openRoles } from "@/lib/draft/derive";
import { errCode, type Draft, type Player, type Team } from "@/lib/draft/types";
import { friendly } from "./Toast";

export default function NominationPicker({
  team,
  draft,
  players,
  onError,
}: {
  team: Team;
  draft: Draft;
  players: Player[];
  onError: (msg: string) => void;
}) {
  const supabase = createClient();
  const [query, setQuery] = useState("");

  const roles = openRoles(team.id, players);
  const minimum =
    draft.round_minimums[Math.min(draft.current_round, draft.round_minimums.length) - 1] ?? 0;

  const available = players
    .filter((p) => !p.team_id)
    .filter((p) => p.display_name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => a.display_name.localeCompare(b.display_name));

  const nominate = async (player: Player) => {
    const blocked = nominateBlockReason(team, player, draft, players);
    if (blocked) return onError(blocked);
    const { error } = await supabase.rpc("nominate", { p_draft_id: draft.id, p_player_id: player.id });
    if (error) onError(friendly(errCode(error)));
  };

  return (
    <section className="card-brand flex flex-col gap-3 p-3">
      <header className="flex items-center justify-between gap-2">
        <h3 className="label-dash !text-gold">Your turn to nominate</h3>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search players…"
          className="rounded border border-line bg-navy px-2 py-1 text-sm text-white placeholder:text-steel/60 focus:border-gold focus:outline-none"
        />
      </header>

      {roles.length === 0 && (
        <p className="text-sm text-steel">Your roster is already full.</p>
      )}

      <div className="flex flex-col gap-3">
        {roles.map((role) => {
          const rows = available.filter((p) => p.role === role);
          if (rows.length === 0) return null;
          return (
            <div key={role} className="flex flex-col gap-1">
              <h4 className="label-dash">{role}</h4>
              <ul className="flex flex-col gap-1">
                {rows.map((p) => {
                  const blocked = nominateBlockReason(team, p, draft, players);
                  return (
                    <li
                      key={p.id}
                      className="flex items-center justify-between gap-2 rounded border border-line px-2 py-1 text-sm hover:bg-navy/60"
                    >
                      <span className="truncate text-white">
                        {p.display_name}
                        {p.rank ? <span className="ml-1 text-xs text-steel">· {p.rank}</span> : null}
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        {blocked && <span className="text-xs text-steel">{blocked}</span>}
                        <button
                          className="shrink-0 rounded border border-gold px-2 py-1 text-xs font-semibold text-gold disabled:opacity-40"
                          disabled={!!blocked}
                          onClick={() => nominate(p)}
                        >
                          Nominate (opens at {minimum})
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
        {roles.length > 0 && available.filter((p) => roles.includes(p.role)).length === 0 && (
          <p className="text-sm text-steel">No players match.</p>
        )}
      </div>
    </section>
  );
}
