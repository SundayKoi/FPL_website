"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { nominateBlockReason, openRoles } from "@/lib/draft/derive";
import { errCode, ROLE_ORDER, type Draft, type LolRole, type Player, type Team } from "@/lib/draft/types";
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
  const [roleFilter, setRoleFilter] = useState<LolRole | null>(null);

  const roles = openRoles(team.id, players);
  const minimum =
    draft.round_minimums[Math.min(draft.current_round, draft.round_minimums.length) - 1] ?? 0;

  const available = players
    .filter((p) => !p.team_id)
    .filter((p) => p.display_name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort(
      (a, b) =>
        ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) ||
        a.display_name.localeCompare(b.display_name)
    );

  const nominate = async (player: Player) => {
    const blocked = nominateBlockReason(team, player, draft, players);
    if (blocked) return onError(blocked);
    const { error } = await supabase.rpc("nominate", { p_draft_id: draft.id, p_player_id: player.id });
    if (error) onError(friendly(errCode(error)));
  };

  const nominatable = available
    .filter((p) => roles.includes(p.role))
    .filter((p) => !roleFilter || p.role === roleFilter);

  const chip = (active: boolean) =>
    active
      ? "rounded-full bg-gold px-3 py-1 text-xs font-semibold text-navy"
      : "rounded-full border border-line bg-panel px-3 py-1 text-xs font-semibold text-steel hover:text-white";

  return (
    <section className="card-brand flex flex-col gap-3 p-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="label-dash !text-gold">Your turn to nominate</h3>
        <span className="text-xs text-steel">
          click a player to nominate · opens at <span className="font-semibold text-gold">{minimum}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <button className={chip(roleFilter === null)} aria-pressed={roleFilter === null} onClick={() => setRoleFilter(null)}>
            All
          </button>
          {roles.map((r) => (
            <button
              key={r}
              className={`${chip(roleFilter === r)} uppercase`}
              aria-pressed={roleFilter === r}
              onClick={() => setRoleFilter(roleFilter === r ? null : r)}
            >
              {r}
            </button>
          ))}
        </span>
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

      <ul className="columns-2 gap-1.5 sm:columns-3 xl:columns-4">
        {nominatable.map((p) => {
          const blocked = nominateBlockReason(team, p, draft, players);
          return (
            <li key={p.id} className="mb-1.5 break-inside-avoid">
              <button
                className="flex w-full items-center justify-between gap-2 rounded border border-line bg-navy px-2.5 py-1.5 text-left text-sm hover:border-gold hover:bg-gold/10 disabled:opacity-40 disabled:hover:border-line disabled:hover:bg-navy"
                disabled={!!blocked}
                title={blocked ?? `Nominate (opens at ${minimum})`}
                onClick={() => nominate(p)}
              >
                <span className="sr-only">Nominate </span>
                <span className="truncate text-white">
                  {p.display_name}
                  {p.rank ? <span className="ml-1 text-xs text-steel">· {p.rank}</span> : null}
                </span>
                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-steel">
                  {p.role}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {roles.length > 0 && nominatable.length === 0 && (
        <p className="text-sm text-steel">No players match.</p>
      )}
    </section>
  );
}
