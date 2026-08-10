"use client";

import type { DragEvent } from "react";
import type { RosterSlotView, RosterTeamView } from "@/lib/draft/types";

const roleLabels = {
  top: "TOP",
  jungle: "JG",
  mid: "MID",
  adc: "ADC",
  support: "SUP",
} as const;

export type TeamRosterCardProps = {
  team: RosterTeamView;
  editable?: boolean;
  onDragStart?: (player: RosterSlotView) => void;
  onDragEnd?: () => void;
  onDragOver?: (player: RosterSlotView) => void;
  onDrop?: (player: RosterSlotView) => void;
  onKeyboardSwap?: (player: RosterSlotView) => void;
};

export default function TeamRosterCard({
  team,
  editable = false,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onKeyboardSwap,
}: TeamRosterCardProps) {
  const headingId = `team-heading-${team.id}`;

  const handleDragStart = (event: DragEvent<HTMLLIElement>, player: RosterSlotView) => {
    event.dataTransfer?.setData("text/plain", player.id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
    onDragStart?.(player);
  };

  return (
    <article aria-labelledby={headingId} className="card-brand overflow-hidden">
      <div className={`${team.accentClass} relative flex h-28 items-end justify-between overflow-hidden px-5 py-4`}>
        {team.imageUrl ? (
          <img
            src={team.imageUrl}
            alt={`${team.name} logo`}
            className="h-16 w-16 rounded object-contain"
          />
        ) : (
          <span className="type-display text-5xl text-white/90" aria-hidden="true">
            {team.abbreviation}
          </span>
        )}
        <span className="label-dash text-white/70">Roster</span>
      </div>

      <div className="border-b border-line bg-navy/80 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <h2 id={headingId} className="font-display text-xl font-semibold text-white">
            {team.name}
          </h2>
        </div>
        <p className="mt-1 text-xs uppercase tracking-[0.14em] text-steel">
          Captain {team.captainName}
        </p>
      </div>

      <ul aria-label={`${team.name} roster`} className="divide-y divide-line/80">
        {team.players.map((player) => {
          const captain = player.acquisition === "captain";
          const empty = player.isEmpty === true;
          return (
            <li
              key={player.id}
              draggable={editable && !captain && !empty}
              onDragStart={(event) => handleDragStart(event, player)}
              onDragEnd={onDragEnd}
              onDragOver={(event) => {
                if (!editable || captain) return;
                event.preventDefault();
                onDragOver?.(player);
              }}
              onDrop={(event) => {
                if (!editable || captain) return;
                event.preventDefault();
                onDrop?.(player);
              }}
              className={`group flex min-h-12 items-center gap-3 px-4 py-2 ${
                editable && !captain && !empty ? "cursor-grab hover:bg-white/5" : ""
              }`}
            >
              <span className="w-9 shrink-0 text-xs font-display font-semibold not-italic text-steel">
                {roleLabels[player.role]}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">
                {player.displayName}
              </span>
              <span className="shrink-0 text-sm font-semibold text-gold">
                {empty ? "—" : player.price}
              </span>
              {captain ? (
                <span
                  aria-label="Captain, cannot be traded"
                  className="shrink-0 rounded border border-steel/50 px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-steel"
                >
                  C
                </span>
              ) : editable && !empty ? (
                <button
                  type="button"
                  onClick={() => onKeyboardSwap?.(player)}
                  className="shrink-0 rounded border border-line px-1.5 py-1 text-[0.6rem] font-semibold uppercase tracking-[0.1em] text-steel transition hover:border-gold hover:text-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
                  aria-label={`Swap with ${player.displayName}`}
                >
                  Swap with…
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </article>
  );
}
